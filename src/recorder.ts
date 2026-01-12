import puppeteer, { type Browser, type Page } from "puppeteer";
import { join } from "path";

export interface RecorderOptions {
  url: string;
  outputPath: string;
  width?: number;
  height?: number;
}

export interface RecorderResult {
  success: boolean;
  outputPath: string;
  error?: string;
}

export async function recordStory(
  options: RecorderOptions
): Promise<RecorderResult> {
  const { url, outputPath, width = 1080, height = 1920 } = options;

  let browser: Browser | null = null;
  let page: Page | null = null;

  // Promises that will be resolved by the page
  let resolveReady: () => void;
  let resolveDone: () => void;

  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const donePromise = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  try {
    // Launch browser
    browser = await puppeteer.launch({
//      headless: true,
      args: [
        `--window-size=${width},${height}`,
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });
    console.log("Browser launched");

    page = await browser.newPage();

    // Forward console messages from the page to Node console
    page.on("console", async (msg) => {
      const type = msg.type();
      
      // Get the actual values from JSHandles
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

    // Forward page errors
    page.on("pageerror", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Page Error] ${message}`);
    });

    // Set viewport to portrait video dimensions
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 1,
    });

    // Expose functions for page-to-app communication
    await page.exposeFunction("storyReady", () => {
      console.log("Page signaled ready - starting recording...");
      resolveReady();
    });

    await page.exposeFunction("storyDone", () => {
      console.log("Page signaled done - stopping recording...");
      resolveDone();
    });

    // Navigate to the page
    console.log(`Loading template from: ${url}`);
    await page.goto(url, {
      waitUntil: "domcontentloaded",
    });

    // Wait for the page to signal it's ready (with timeout)
    console.log("Waiting for page to be ready...");
    const readyTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout waiting for page to signal ready (30s)")), 30000);
    });
    await Promise.race([readyPromise, readyTimeout]);

    // Determine output paths
    const webmPath = outputPath.replace(/\.mp4$/, ".webm") as `${string}.webm`;
    const finalPath = outputPath;

    // Start screencast recording
    console.log(`Starting screencast recording to: ${webmPath}`);
    const recorder = await page.screencast({
      path: webmPath,
      speed: 1,
    });

    // Wait for the page to signal it's done (with timeout)
    console.log("Recording... waiting for animation to complete");
    const doneTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout waiting for page to signal done (60s)")), 60000);
    });
    await Promise.race([donePromise, doneTimeout]);

    // Stop recording
    await recorder.stop();
    console.log("Recording stopped");

    // Convert WebM to MP4 using ffmpeg
    if (finalPath.endsWith(".mp4")) {
      console.log(`Converting to MP4: ${finalPath}`);
      const ffmpegResult =
        await Bun.$`ffmpeg -y -i ${webmPath} -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p ${finalPath}`.quiet();

      if (ffmpegResult.exitCode !== 0) {
        console.warn(
          "FFmpeg conversion failed, keeping WebM file:",
          ffmpegResult.stderr.toString()
        );
        return {
          success: true,
          outputPath: webmPath,
        };
      }

      // Remove the WebM file after successful conversion
      await Bun.$`rm ${webmPath}`.quiet();
    }

    return {
      success: true,
      outputPath: finalPath,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Recording failed:", errorMessage);
    return {
      success: false,
      outputPath,
      error: errorMessage,
    };
  } finally {
    if (page) {
      await page.close();
    }
    if (browser) {
      await browser.close();
    }
  }
}
