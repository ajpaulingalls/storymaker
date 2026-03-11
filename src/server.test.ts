import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { buildTemplateUrl, startPersistentServer } from "./server";
import type { Server } from "bun";

describe("buildTemplateUrl", () => {
  test("builds URL with required query params", () => {
    const url = buildTemplateUrl(3456, {
      template: "default",
      site: "aje",
      postType: "post",
      postSlug: "test-slug",
    });
    expect(url).toContain("http://localhost:3456/default/");
    expect(url).toContain("site=aje");
    expect(url).toContain("postType=post");
    expect(url).toContain("postSlug=test-slug");
  });

  test("includes update param when provided", () => {
    const url = buildTemplateUrl(3456, {
      template: "breaking",
      site: "aje",
      postType: "liveblog",
      postSlug: "live-slug",
      update: "12345",
    });
    expect(url).toContain("update=12345");
  });

  test("omits update param when not provided", () => {
    const url = buildTemplateUrl(3456, {
      template: "default",
      site: "aje",
      postType: "post",
      postSlug: "slug",
    });
    expect(url).not.toContain("update=");
  });
});

describe("startPersistentServer integration", () => {
  let server: Server<unknown>;

  beforeAll(async () => {
    server = await startPersistentServer(0); // port 0 = random available port
  });

  afterAll(() => {
    if (server) server.stop();
  });

  test("starts server on a random port", () => {
    expect(server.port).toBeGreaterThan(0);
  });

  test("serves shared files", async () => {
    const res = await fetch(`http://localhost:${server.port}/shared/base.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/css");
  });

  test("returns 404 for missing templates", async () => {
    const res = await fetch(`http://localhost:${server.port}/nonexistent-template/`);
    expect(res.status).toBe(404);
  });
});
