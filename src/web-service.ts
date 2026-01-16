import type { Server } from "bun";
import { join, extname } from "path";
import { recordStory } from "./recorder";
import { startPersistentServer, buildTemplateUrl } from "./server";
import {
  uploadVideo,
  isBlobStorageEnabled,
  ensureContainer,
} from "./blob-storage";
import {
  createJobStore,
  generateJobId,
  isTableStorageEnabled,
  type JobStore,
  type Job,
} from "./job-store";

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export interface CreateVideoRequest {
  site: string;
  slug: string;
  postType: string;
  template: string;
}

// Internal template server
let templateServer: Server<undefined>;

// Job store instance
let jobStore: JobStore;

// Cleanup interval handle
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

// 24 hours in milliseconds
const JOB_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Cleanup interval: run every hour
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function generateVideoFilename(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}.mp4`;
}

/**
 * Process a video job in the background
 */
async function processVideoJob(job: Job, req: Request): Promise<void> {
  try {
    // Update status to processing
    await jobStore.update(job.id, { status: "processing", progress: "initializing" });

    console.log(`[Job ${job.id}] Starting video creation for: ${job.request.site}/${job.request.postType}/${job.request.slug}`);

    // Generate unique filename
    const filename = generateVideoFilename();
    const videosDir = join(import.meta.dir, "..", "videos");
    const outputPath = join(videosDir, filename);

    // Ensure videos directory exists
    await Bun.$`mkdir -p ${videosDir}`.quiet();

    // Build template URL using the shared function
    const port = templateServer.port;
    if (!port) {
      throw new Error("Template server port is not available");
    }
    const templateUrl = buildTemplateUrl(port, {
      template: job.request.template,
      site: job.request.site,
      postType: job.request.postType,
      postSlug: job.request.slug,
    });
    console.log(`[Job ${job.id}] Template URL: ${templateUrl}`);

    // Update progress
    await jobStore.update(job.id, { progress: "recording video" });

    // Record the video
    const result = await recordStory({
      url: templateUrl,
      outputPath,
      width: 1080,
      height: 1920,
    });

    if (result.success) {
      let videoUrl: string;

      // Update progress
      await jobStore.update(job.id, { progress: "uploading video" });

      // Try to upload to Azure Blob Storage if configured
      if (isBlobStorageEnabled()) {
        const blobUrl = await uploadVideo(result.outputPath, filename);

        if (blobUrl) {
          // Successfully uploaded to blob storage
          videoUrl = blobUrl;

          // Delete the local temp file
          try {
            await Bun.$`rm ${result.outputPath}`.quiet();
            console.log(`[Job ${job.id}] Deleted local temp file: ${result.outputPath}`);
          } catch {
            console.warn(`[Job ${job.id}] Failed to delete temp file: ${result.outputPath}`);
          }
        } else {
          // Blob upload failed, fall back to local URL
          console.warn(`[Job ${job.id}] Blob upload failed, falling back to local URL`);
          const host = req.headers.get("host") || "localhost:8080";
          const protocol = req.headers.get("x-forwarded-proto") || "http";
          videoUrl = `${protocol}://${host}/videos/${filename}`;
        }
      } else {
        // Blob storage not configured, use local URL
        const host = req.headers.get("host") || "localhost:8080";
        const protocol = req.headers.get("x-forwarded-proto") || "http";
        videoUrl = `${protocol}://${host}/videos/${filename}`;
      }

      console.log(`[Job ${job.id}] Video created: ${videoUrl}`);

      // Update job as completed
      await jobStore.update(job.id, {
        status: "completed",
        progress: undefined,
        result: { url: videoUrl },
      });
    } else {
      console.error(`[Job ${job.id}] Recording failed: ${result.error}`);
      await jobStore.update(job.id, {
        status: "failed",
        progress: undefined,
        error: result.error,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Job ${job.id}] Error: ${errorMessage}`);
    await jobStore.update(job.id, {
      status: "failed",
      progress: undefined,
      error: errorMessage,
    });
  }
}

async function handleCreateVideo(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as CreateVideoRequest;

    // Validate required fields
    const required: (keyof CreateVideoRequest)[] = ["site", "slug", "postType", "template"];
    const missing = required.filter((key) => !body[key]);

    if (missing.length > 0) {
      return Response.json(
        { success: false, error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // Create a job
    const jobId = generateJobId();
    const job = await jobStore.create({
      id: jobId,
      status: "pending",
      request: {
        site: body.site,
        slug: body.slug,
        postType: body.postType,
        template: body.template,
      },
    });

    console.log(`[API] Created job ${jobId} for: ${body.site}/${body.postType}/${body.slug} (template: ${body.template})`);

    // Spawn background processing (don't await)
    processVideoJob(job, req).catch((error) => {
      console.error(`[Job ${jobId}] Unhandled error in background processing:`, error);
    });

    // Return job ID immediately
    return Response.json({ jobId }, { status: 202 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[API] Error: ${errorMessage}`);
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

async function handleGetJob(jobId: string): Promise<Response> {
  const job = await jobStore.get(jobId);

  if (!job) {
    return Response.json(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }

  // Build response based on job status
  const response: Record<string, unknown> = {
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };

  if (job.progress) {
    response.progress = job.progress;
  }

  if (job.status === "completed" && job.result) {
    response.url = job.result.url;
  }

  if (job.status === "failed" && job.error) {
    response.error = job.error;
  }

  return Response.json(response);
}

async function serveVideo(pathname: string): Promise<Response> {
  const videosDir = join(import.meta.dir, "..", "videos");
  const filename = pathname.replace("/videos/", "");
  const filePath = join(videosDir, filename);

  // Prevent directory traversal
  if (filename.includes("..") || filename.includes("/")) {
    return new Response("Forbidden", { status: 403 });
  }

  const file = Bun.file(filePath);
  if (await file.exists()) {
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000",
      },
    });
  }

  return new Response("Video not found", { status: 404 });
}

/**
 * Start periodic job cleanup
 */
function startJobCleanup(): void {
  if (cleanupInterval) {
    return;
  }

  // Run cleanup immediately on startup
  jobStore.cleanup(JOB_MAX_AGE_MS).catch((error) => {
    console.error("[Job Store] Cleanup error:", error);
  });

  // Then run periodically
  cleanupInterval = setInterval(() => {
    jobStore.cleanup(JOB_MAX_AGE_MS).catch((error) => {
      console.error("[Job Store] Cleanup error:", error);
    });
  }, CLEANUP_INTERVAL_MS);

  console.log("[Job Store] Cleanup scheduled (every hour, removes jobs older than 24h)");
}

export async function startWebService(port: number = 8080): Promise<Server<undefined>> {
  // Start the internal template server first
  templateServer = await startPersistentServer();

  // Initialize job store
  jobStore = createJobStore();

  // Initialize blob storage if configured
  const blobEnabled = isBlobStorageEnabled();
  if (blobEnabled) {
    const containerReady = await ensureContainer();
    if (!containerReady) {
      console.warn("[Web Service] Blob storage configured but container check failed");
    }
  }

  // Start job cleanup
  startJobCleanup();

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;
      const method = req.method;

      console.log(`[Web Service] ${method} ${pathname}`);

      // API endpoint: create video (returns job ID)
      if (pathname === "/api/create-video" && method === "POST") {
        return handleCreateVideo(req);
      }

      // API endpoint: get job status
      const jobMatch = pathname.match(/^\/api\/job\/([a-z0-9-]+)$/);
      if (jobMatch?.[1] && method === "GET") {
        return handleGetJob(jobMatch[1]);
      }

      // Serve videos
      if (pathname.startsWith("/videos/")) {
        return serveVideo(pathname);
      }

      // Health check
      if (pathname === "/health") {
        return Response.json({ status: "ok" });
      }

      // Root - show API info
      if (pathname === "/") {
        return Response.json({
          name: "StoryMaker Video Service",
          storage: blobEnabled ? "Azure Blob Storage" : "Local filesystem",
          jobStore: isTableStorageEnabled() ? "Azure Table Storage" : "In-memory",
          endpoints: {
            "POST /api/create-video": {
              description: "Start video creation job (returns immediately)",
              body: {
                site: "string (required) - Site identifier (e.g., 'aje', 'aja')",
                slug: "string (required) - Article slug",
                postType: "string (required) - Post type (e.g., 'post')",
                template: "string (required) - Template name (e.g., 'default', 'breaking')",
              },
              response: {
                jobId: "string - Job ID to poll for status",
              },
            },
            "GET /api/job/{jobId}": {
              description: "Get job status",
              response: {
                jobId: "string - Job ID",
                status: "string - pending | processing | completed | failed",
                progress: "string (optional) - Current progress message",
                url: "string (when completed) - Video URL",
                error: "string (when failed) - Error message",
                createdAt: "string - ISO timestamp",
                updatedAt: "string - ISO timestamp",
              },
            },
            "GET /videos/{filename}": "Serve generated videos (fallback when blob storage unavailable)",
            "GET /health": "Health check endpoint",
          },
        });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  console.log(`\n🎬 StoryMaker Web Service running at http://localhost:${port}`);
  console.log(`   POST /api/create-video - Start video creation job`);
  console.log(`   GET /api/job/{jobId} - Get job status`);
  console.log(`   GET /videos/{filename} - Serve videos (fallback)`);
  console.log(`   GET /health - Health check`);
  console.log(`   Storage: ${blobEnabled ? "Azure Blob Storage" : "Local filesystem"}`);
  console.log(`   Job Store: ${isTableStorageEnabled() ? "Azure Table Storage" : "In-memory"}\n`);

  return server;
}

// Run directly if this is the main module
if (import.meta.main) {
  startWebService();
}
