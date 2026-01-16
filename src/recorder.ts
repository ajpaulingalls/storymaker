import puppeteer, { type Browser, type Page } from "puppeteer";
import { join } from "path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

export interface RecorderOptions {
  url: string;
  outputPath: string;
  width?: number;
  height?: number;
  frameRate?: number;
  duration?: number;
}

export interface RecorderResult {
  success: boolean;
  outputPath: string;
  thumbnailPath?: string;
  error?: string;
}

/**
 * Animation control script injected into the page.
 * Captures all CSS animations and provides pause/seek functionality.
 */
const ANIMATION_CONTROL_SCRIPT = `
(() => {
  // Get all animations on the page
  window.__animations = document.getAnimations();
  
  // Pause all animations
  window.__animations.forEach(a => a.pause());
  
  // Seek all animations to a specific time
  window.__seekTo = (timeMs) => {
    window.__animations.forEach(a => {
      try {
        const timing = a.effect?.getTiming();
        if (timing) {
          // For infinite animations, cap at one iteration
          const iterationDuration = timing.duration || 0;
          const maxTime = timing.iterations === Infinity 
            ? iterationDuration 
            : (iterationDuration * (timing.iterations || 1)) + (timing.delay || 0);
          
          // Set currentTime, accounting for delay
          a.currentTime = Math.min(timeMs, maxTime);
        } else {
          a.currentTime = timeMs;
        }
      } catch (e) {
        // Some animations may not support seeking
      }
    });
  };
  
  // Return animation count for logging
  return window.__animations.length;
})()
`;

export async function recordStory(
  options: RecorderOptions
): Promise<RecorderResult> {
  const { 
    url, 
    outputPath, 
    width = 1080, 
    height = 1920,
    frameRate = 25,
    duration = 10000, // 10 seconds default
  } = options;

  let browser: Browser | null = null;
  let page: Page | null = null;
  let tempDir: string | null = null;

  // Promise that will be resolved when page signals ready
  let resolveReady: () => void;
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  try {
    // Launch browser
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    browser = await puppeteer.launch({
      executablePath,
      args: [
        `--window-size=${width},${height}`,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      timeout: 120000, // 2 minute timeout for browser launch
    });
    console.log(`Browser launched${executablePath ? ` (using ${executablePath})` : ""}`);

    page = await browser.newPage();

    // Set longer timeouts for frame capture
    page.setDefaultTimeout(120000); // 2 minutes
    page.setDefaultNavigationTimeout(60000); // 1 minute for navigation

    // Forward console messages from the page
    page.on("console", async (msg) => {
      const type = msg.type();
      const args = await Promise.all(
        msg.args().map(async (arg) => {
          try {
            return await arg.jsonValue();
          } catch {
            return arg.toString();
          }
        })
      );
      const text = args.map(arg => 
        typeof arg === "object" ? JSON.stringify(arg) : String(arg)
      ).join(" ");
      
      if (type === "error") {
        console.error(`[Page Error] ${text}`);
      } else if (type === "warn") {
        console.warn(`[Page Warn] ${text}`);
      } else {
        console.log(`[Page] ${text}`);
      }
    });

    page.on("pageerror", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Page Error] ${message}`);
    });

    // Set viewport
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 1,
    });

    // Expose ready signal function
    await page.exposeFunction("storyReady", () => {
      console.log("Page signaled ready");
      resolveReady();
    });

    // Expose done signal function (not used in frame-by-frame mode, but templates call it)
    await page.exposeFunction("storyDone", () => {
      // No-op in frame-by-frame mode
    });

    // Navigate to page
    console.log(`Loading template from: ${url}`);
    await page.goto(url, {
      waitUntil: "domcontentloaded",
    });

    // Wait for page to signal ready
    console.log("Waiting for page to be ready...");
    const readyTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout waiting for page ready (30s)")), 30000);
    });
    await Promise.race([readyPromise, readyTimeout]);

    // Wait for fonts to load (runs in browser context)
    await page.evaluate("document.fonts.ready");
    console.log("Fonts loaded");

    // Small delay to ensure all animations are initialized
    await new Promise(resolve => setTimeout(resolve, 100));

    // Inject animation control script
    const animationCount = await page.evaluate(ANIMATION_CONTROL_SCRIPT);
    console.log(`Animation control initialized: ${animationCount} animations found`);

    // Create temp directory for frames
    tempDir = await mkdtemp(join(tmpdir(), "storymaker-frames-"));
    console.log(`Temp directory created: ${tempDir}`);

    // Calculate frame parameters
    const totalFrames = Math.ceil((duration / 1000) * frameRate);
    const frameInterval = 1000 / frameRate; // ms per frame
    
    console.log(`Starting frame capture: ${totalFrames} frames at ${frameRate}fps`);
    const captureStartTime = Date.now();

    // Capture frames
    for (let frame = 0; frame < totalFrames; frame++) {
      const timeMs = frame * frameInterval;
      
      // Seek animations to current time
      await page.evaluate((t) => {
        (window as any).__seekTo(t);
      }, timeMs);

      // Take screenshot
      const framePath = join(tempDir, `frame_${String(frame).padStart(4, "0")}.png`);
      await page.screenshot({
        path: framePath,
        type: "png",
      });

      // Progress logging every 30 frames (1 second)
      if (frame % 30 === 0) {
        const progress = ((frame / totalFrames) * 100).toFixed(0);
        console.log(`Frame capture: ${progress}% (${frame}/${totalFrames})`);
      }
    }

    const captureDuration = ((Date.now() - captureStartTime) / 1000).toFixed(1);
    console.log(`Frame capture completed in ${captureDuration}s`);

    // Stitch frames into video with FFmpeg
    console.log(`Stitching frames into video: ${outputPath}`);
    const stitchStartTime = Date.now();
    
    const framePattern = join(tempDir, "frame_%04d.png");
    const ffmpegResult = await Bun.$`ffmpeg -y -framerate ${frameRate} -i ${framePattern} -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p ${outputPath}`;

    const stitchDuration = ((Date.now() - stitchStartTime) / 1000).toFixed(1);

    if (ffmpegResult.exitCode !== 0) {
      console.error(`FFmpeg failed after ${stitchDuration}s:`, ffmpegResult.stderr.toString());
      return {
        success: false,
        outputPath,
        error: `FFmpeg failed: ${ffmpegResult.stderr.toString()}`,
      };
    }

    console.log(`FFmpeg stitching completed in ${stitchDuration}s`);

    // Generate thumbnail from the last frame
    const lastFramePath = join(tempDir, `frame_${String(totalFrames - 1).padStart(4, "0")}.png`);
    const thumbnailPath = outputPath.replace(/\.mp4$/, ".jpg");
    
    console.log(`Generating thumbnail from last frame...`);
    const thumbnailResult = await Bun.$`ffmpeg -y -i ${lastFramePath} -q:v 2 ${thumbnailPath}`;
    
    let finalThumbnailPath: string | undefined;
    if (thumbnailResult.exitCode !== 0) {
      console.warn(`Thumbnail generation failed: ${thumbnailResult.stderr.toString()}`);
    } else {
      finalThumbnailPath = thumbnailPath;
      console.log(`Thumbnail generated: ${thumbnailPath}`);
    }

    const totalDuration = ((Date.now() - captureStartTime) / 1000).toFixed(1);
    console.log(`Total video generation time: ${totalDuration}s`);

    return {
      success: true,
      outputPath,
      thumbnailPath: finalThumbnailPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Recording failed:", errorMessage);
    return {
      success: false,
      outputPath,
      error: errorMessage,
    };
  } finally {
    // Cleanup - wrap in try-catch since browser may already be closed
    if (page) {
      try {
        await page.close();
      } catch {
        // Page may already be closed
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Browser may already be closed
      }
    }
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true });
        console.log("Temp directory cleaned up");
      } catch {
        console.warn(`Failed to cleanup temp directory: ${tempDir}`);
      }
    }
  }
}
