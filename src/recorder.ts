import puppeteer, { type Browser, type Page } from "puppeteer";
import { join } from "path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

export interface RecorderProgress {
  phase: "initializing" | "capturing" | "stitching" | "thumbnail" | "complete";
  currentFrame?: number;
  totalFrames?: number;
  percent: number;
}

export interface RecorderOptions {
  url: string;
  outputPath: string;
  width?: number;
  height?: number;
  frameRate?: number;
  defaultDuration?: number; // Fallback duration if template doesn't provide one
  onProgress?: (progress: RecorderProgress) => void;
}

export interface RecorderResult {
  success: boolean;
  outputPath: string;
  thumbnailPath?: string;
  error?: string;
}

/**
 * Virtual clock script injected into the page.
 * Starts in passthrough mode (using real timers) during initialization.
 * Call __startVirtualClock() to switch to virtual time control for frame capture.
 */
const VIRTUAL_CLOCK_SCRIPT = `
(() => {
  // Store original functions
  const originalSetTimeout = window.setTimeout.bind(window);
  const originalSetInterval = window.setInterval.bind(window);
  const originalClearTimeout = window.clearTimeout.bind(window);
  const originalClearInterval = window.clearInterval.bind(window);
  const originalDateNow = Date.now;
  const originalRAF = window.requestAnimationFrame.bind(window);
  const originalCAF = window.cancelAnimationFrame.bind(window);
  const originalPerformanceNow = performance.now.bind(performance);
  
  // Mode: 'passthrough' uses real timers, 'virtual' uses controlled time
  let mode = 'passthrough';
  
  // Virtual clock state (initialized when switching to virtual mode)
  let virtualTime = 0;
  let startVirtualTime = 0;
  let timerId = 1;
  const timers = new Map(); // id -> { callback, triggerTime, interval, type }
  const rafCallbacks = new Map(); // id -> callback
  let rafId = 1;
  
  // Override setTimeout
  window.setTimeout = (callback, delay = 0, ...args) => {
    if (mode === 'passthrough') {
      return originalSetTimeout(callback, delay, ...args);
    }
    const id = timerId++;
    timers.set(id, {
      callback: () => callback(...args),
      triggerTime: virtualTime + delay,
      type: 'timeout'
    });
    return id;
  };
  
  // Override setInterval
  window.setInterval = (callback, delay = 0, ...args) => {
    if (mode === 'passthrough') {
      return originalSetInterval(callback, delay, ...args);
    }
    const id = timerId++;
    timers.set(id, {
      callback: () => callback(...args),
      triggerTime: virtualTime + delay,
      interval: delay,
      type: 'interval'
    });
    return id;
  };
  
  // Override clearTimeout/clearInterval
  window.clearTimeout = (id) => {
    if (mode === 'passthrough') {
      return originalClearTimeout(id);
    }
    timers.delete(id);
  };
  window.clearInterval = (id) => {
    if (mode === 'passthrough') {
      return originalClearInterval(id);
    }
    timers.delete(id);
  };
  
  // Override requestAnimationFrame
  window.requestAnimationFrame = (callback) => {
    if (mode === 'passthrough') {
      return originalRAF(callback);
    }
    const id = rafId++;
    rafCallbacks.set(id, callback);
    return id;
  };
  
  // Override cancelAnimationFrame
  window.cancelAnimationFrame = (id) => {
    if (mode === 'passthrough') {
      return originalCAF(id);
    }
    rafCallbacks.delete(id);
  };
  
  // Start virtual clock mode - called after page signals ready
  window.__startVirtualClock = () => {
    if (mode === 'virtual') return;
    mode = 'virtual';
    virtualTime = originalDateNow();
    startVirtualTime = virtualTime;
    console.log('[Virtual Clock] Started at', virtualTime);
    
    // Override Date.now and performance.now only when in virtual mode
    Date.now = () => virtualTime;
    performance.now = () => virtualTime - startVirtualTime;
  };
  
  // Advance virtual time and process timers
  window.__advanceTime = (deltaMs) => {
    if (mode !== 'virtual') {
      console.warn('[Virtual Clock] __advanceTime called but not in virtual mode');
      return;
    }
    
    virtualTime += deltaMs;
    
    // Process RAF callbacks
    const rafs = Array.from(rafCallbacks.entries());
    rafCallbacks.clear();
    for (const [id, callback] of rafs) {
      try {
        callback(virtualTime - startVirtualTime);
      } catch (e) {
        console.error('RAF callback error:', e);
      }
    }
    
    // Process timers that should fire
    for (const [id, timer] of timers.entries()) {
      if (timer.triggerTime <= virtualTime) {
        try {
          timer.callback();
        } catch (e) {
          console.error('Timer callback error:', e);
        }
        
        if (timer.type === 'interval') {
          timer.triggerTime = virtualTime + timer.interval;
        } else {
          timers.delete(id);
        }
      }
    }
    
    // Also advance CSS animations
    const animations = document.getAnimations();
    animations.forEach(a => {
      try {
        a.currentTime = virtualTime - startVirtualTime;
      } catch (e) {}
    });
  };
  
  // Get current virtual time
  window.__getVirtualTime = () => virtualTime;
  
  // Check if there are pending timers
  window.__hasPendingTimers = () => timers.size > 0 || rafCallbacks.size > 0;
  
  // Check current mode
  window.__isVirtualMode = () => mode === 'virtual';
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
    defaultDuration = 10000, // 10 seconds fallback
    onProgress,
  } = options;

  // Helper to report progress
  const reportProgress = (progress: RecorderProgress) => {
    if (onProgress) {
      onProgress(progress);
    }
  };

  let browser: Browser | null = null;
  let page: Page | null = null;
  let tempDir: string | null = null;

  // Promise that will be resolved when page signals ready
  let resolveReady: () => void;
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  try {
    // Report initializing
    reportProgress({ phase: "initializing", percent: 5 });

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
    page.setDefaultTimeout(300000); // 5 minutes for long recordings
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

    // Inject virtual clock BEFORE any page scripts run
    await page.evaluateOnNewDocument(VIRTUAL_CLOCK_SCRIPT);

    // Expose ready signal function
    await page.exposeFunction("storyReady", () => {
      console.log("Page signaled ready");
      resolveReady();
    });

    // Expose done signal function (no-op - we control timing via virtual clock)
    await page.exposeFunction("storyDone", () => {
      console.log("Page signaled done (ignored - using virtual clock)");
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

    // Small delay to ensure rendering is complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get story duration from template (or use default) - do this BEFORE starting virtual clock
    const storyDuration = await page.evaluate((fallback) => {
      if (typeof (window as any).getStoryDuration === "function") {
        return (window as any).getStoryDuration();
      }
      return fallback;
    }, defaultDuration);
    
    console.log(`Story duration: ${storyDuration}ms (${(storyDuration / 1000).toFixed(1)}s)`);

    // Switch to virtual clock mode for frame-by-frame capture
    await page.evaluate(() => {
      (window as any).__startVirtualClock();
    });
    console.log("Virtual clock started");

    // Create temp directory for frames
    tempDir = await mkdtemp(join(tmpdir(), "storymaker-frames-"));
    console.log(`Temp directory created: ${tempDir}`);

    // Calculate frame parameters
    const frameInterval = 1000 / frameRate; // ms per frame
    const totalFrames = Math.ceil((storyDuration / 1000) * frameRate);
    
    console.log(`Starting frame capture: ${totalFrames} frames at ${frameRate}fps`);
    const captureStartTime = Date.now();

    // Report starting capture
    reportProgress({ phase: "capturing", currentFrame: 0, totalFrames, percent: 10 });

    // Capture frames by advancing virtual time
    for (let frame = 0; frame < totalFrames; frame++) {
      // Advance virtual time to this frame's timestamp
      await page.evaluate((delta) => {
        (window as any).__advanceTime(delta);
      }, frameInterval);

      // Small delay to let browser render
      await new Promise(resolve => setTimeout(resolve, 5));

      // Take screenshot
      const framePath = join(tempDir, `frame_${String(frame).padStart(5, "0")}.png`);
      await page.screenshot({
        path: framePath,
        type: "png",
      });

      // Progress logging and reporting every 10 frames
      if (frame % 10 === 0 || frame === totalFrames - 1) {
        // Frame capture is 10% to 70% of total progress
        const capturePercent = 10 + Math.round((frame / totalFrames) * 60);
        reportProgress({ 
          phase: "capturing", 
          currentFrame: frame + 1, 
          totalFrames, 
          percent: capturePercent 
        });
      }
      
      // Console logging every 25 frames (1 second of video)
      if (frame % frameRate === 0) {
        const progress = ((frame / totalFrames) * 100).toFixed(0);
        console.log(`Frame capture: ${progress}% (${frame}/${totalFrames})`);
      }
    }

    const captureDuration = ((Date.now() - captureStartTime) / 1000).toFixed(1);
    console.log(`Frame capture completed: ${totalFrames} frames in ${captureDuration}s`);

    // Stitch frames into video with FFmpeg
    console.log(`Stitching ${totalFrames} frames into video: ${outputPath}`);
    reportProgress({ phase: "stitching", percent: 75 });
    const stitchStartTime = Date.now();
    
    const framePattern = join(tempDir, "frame_%05d.png");
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
    const lastFramePath = join(tempDir, `frame_${String(totalFrames - 1).padStart(5, "0")}.png`);
    const thumbnailPath = outputPath.replace(/\.mp4$/, ".jpg");
    
    console.log(`Generating thumbnail from last frame...`);
    reportProgress({ phase: "thumbnail", percent: 90 });
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

    reportProgress({ phase: "complete", percent: 100 });

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
