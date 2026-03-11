import { describe, expect, test, beforeAll, afterAll, mock } from "bun:test";
import type { Server } from "bun";

// Mock heavy dependencies before importing the module under test.
// Do NOT mock ./server — Bun's mock.module is global and would break server.test.ts.
mock.module("./recorder", () => ({
  recordStory: async () => ({
    success: true,
    outputPath: "/tmp/test.mp4",
    thumbnailPath: "/tmp/test.jpg",
  }),
}));

mock.module("./blob-storage", () => ({
  isBlobStorageEnabled: () => false,
  ensureContainer: async () => true,
  uploadVideo: async () => "https://blob.test/video.mp4",
  uploadThumbnail: async () => "https://blob.test/thumb.jpg",
}));

// Now import the module under test
const { startWebService, stopWebService } = await import("./web-service");

describe("web-service API", () => {
  let server: Server<undefined>;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startWebService(0); // port 0 = random available port
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(() => {
    if (server) stopWebService(server);
  });

  describe("GET /health", () => {
    test("returns 200 with status ok", async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
    });
  });

  describe("POST /api/create-video", () => {
    test("returns 202 with jobId for valid request", async () => {
      const res = await fetch(`${baseUrl}/api/create-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: "aje",
          slug: "test-slug",
          postType: "post",
          template: "default",
        }),
      });
      expect(res.status).toBe(202);
      const body = (await res.json()) as { jobId: string };
      expect(body.jobId).toBeDefined();
      expect(typeof body.jobId).toBe("string");
    });

    test("returns 400 for missing required fields", async () => {
      const res = await fetch(`${baseUrl}/api/create-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: "aje" }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Missing required fields");
    });
  });

  describe("GET /api/job/{jobId}", () => {
    test("returns job after creation", async () => {
      // First create a job
      const createRes = await fetch(`${baseUrl}/api/create-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: "aje",
          slug: "test-slug",
          postType: "post",
          template: "default",
        }),
      });
      const { jobId } = (await createRes.json()) as { jobId: string };

      // Then fetch it
      const res = await fetch(`${baseUrl}/api/job/${jobId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { jobId: string; status: string };
      expect(body.jobId).toBe(jobId);
      expect(body.status).toBeDefined();
    });

    test("returns 404 for missing job", async () => {
      const res = await fetch(`${baseUrl}/api/job/nonexistent-id`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/parse-url", () => {
    test("parses AJE article URL", async () => {
      const url = encodeURIComponent("https://www.aljazeera.com/news/2024/1/15/test-article-slug");
      const res = await fetch(`${baseUrl}/api/parse-url?url=${url}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        site: string;
        postType: string;
        slug: string;
      };
      expect(body.site).toBe("aje");
      expect(body.postType).toBe("post");
      expect(body.slug).toBe("test-article-slug");
    });

    test("returns 400 for missing url parameter", async () => {
      const res = await fetch(`${baseUrl}/api/parse-url`);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api", () => {
    test("returns API documentation", async () => {
      const res = await fetch(`${baseUrl}/api`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { name: string; endpoints: Record<string, unknown> };
      expect(body.name).toContain("StoryMaker");
      expect(body.endpoints).toBeDefined();
    });
  });

  describe("404 handling", () => {
    test("returns 404 for unknown paths", async () => {
      const res = await fetch(`${baseUrl}/unknown/path`);
      expect(res.status).toBe(404);
    });
  });
});
