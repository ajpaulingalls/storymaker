import type { Server } from "bun";
import { join, extname } from "path";
import { recordStory } from "./recorder";
import { startPersistentServer, buildTemplateUrl } from "./server";
import {
  uploadVideo,
  isBlobStorageEnabled,
  ensureContainer,
} from "./blob-storage";

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
let templateServer: Server;

function generateVideoFilename(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}.mp4`;
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

    console.log(`[API] Creating video for: ${body.site}/${body.postType}/${body.slug} (template: ${body.template})`);

    // Generate unique filename
    const filename = generateVideoFilename();
    const videosDir = join(import.meta.dir, "..", "videos");
    const outputPath = join(videosDir, filename);

    // Ensure videos directory exists
    await Bun.$`mkdir -p ${videosDir}`.quiet();

    // Build template URL using the shared function
    const templateUrl = buildTemplateUrl(templateServer.port, {
      template: body.template,
      site: body.site,
      postType: body.postType,
      postSlug: body.slug,
    });
    console.log(`[API] Template URL: ${templateUrl}`);

    // Record the video
    const result = await recordStory({
      url: templateUrl,
      outputPath,
      width: 1080,
      height: 1920,
    });

    if (result.success) {
      let videoUrl: string;

      // Try to upload to Azure Blob Storage if configured
      if (isBlobStorageEnabled()) {
        const blobUrl = await uploadVideo(result.outputPath, filename);

        if (blobUrl) {
          // Successfully uploaded to blob storage
          videoUrl = blobUrl;

          // Delete the local temp file
          try {
            await Bun.$`rm ${result.outputPath}`.quiet();
            console.log(`[API] Deleted local temp file: ${result.outputPath}`);
          } catch {
            console.warn(`[API] Failed to delete temp file: ${result.outputPath}`);
          }
        } else {
          // Blob upload failed, fall back to local URL
          console.warn("[API] Blob upload failed, falling back to local URL");
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

      console.log(`[API] Video created: ${videoUrl}`);

      return Response.json({
        success: true,
        url: videoUrl,
      });
    } else {
      console.error(`[API] Recording failed: ${result.error}`);
      return Response.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[API] Error: ${errorMessage}`);
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
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

export async function startWebService(port: number = 8080): Promise<Server> {
  // Start the internal template server first
  templateServer = await startPersistentServer();

  // Initialize blob storage if configured
  const blobEnabled = isBlobStorageEnabled();
  if (blobEnabled) {
    const containerReady = await ensureContainer();
    if (!containerReady) {
      console.warn("[Web Service] Blob storage configured but container check failed");
    }
  }

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;
      const method = req.method;

      console.log(`[Web Service] ${method} ${pathname}`);

      // API endpoint: create video
      if (pathname === "/api/create-video" && method === "POST") {
        return handleCreateVideo(req);
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
          endpoints: {
            "POST /api/create-video": {
              description: "Create a video from a story",
              body: {
                site: "string (required) - Site identifier (e.g., 'aje', 'aja')",
                slug: "string (required) - Article slug",
                postType: "string (required) - Post type (e.g., 'post')",
                template: "string (required) - Template name (e.g., 'default', 'breaking')",
              },
              response: {
                success: "boolean",
                url: "string - URL to download the video (Azure Blob URL or local URL)",
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
  console.log(`   POST /api/create-video - Create a video`);
  console.log(`   GET /videos/{filename} - Serve videos (fallback when blob storage unavailable)`);
  console.log(`   GET /health - Health check`);
  console.log(`   Storage: ${blobEnabled ? "Azure Blob Storage" : "Local filesystem"}\n`);

  return server;
}

// Run directly if this is the main module
if (import.meta.main) {
  startWebService();
}
