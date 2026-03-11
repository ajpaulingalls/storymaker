import { describe, expect, test, beforeEach } from "bun:test";
import { generateJobId, InMemoryJobStore } from "./job-store";

describe("generateJobId", () => {
  test("returns a string with timestamp-random format", () => {
    const id = generateJobId();
    expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });

  test("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateJobId()));
    expect(ids.size).toBe(100);
  });
});

describe("InMemoryJobStore", () => {
  let store: InMemoryJobStore;
  const sampleRequest = {
    site: "aje",
    slug: "test-article",
    postType: "post",
    template: "default",
  };

  beforeEach(() => {
    store = new InMemoryJobStore();
  });

  describe("create", () => {
    test("creates a job with timestamps", async () => {
      const job = await store.create({
        id: "test-1",
        status: "pending",
        request: sampleRequest,
      });
      expect(job.id).toBe("test-1");
      expect(job.status).toBe("pending");
      expect(job.createdAt).toBeInstanceOf(Date);
      expect(job.updatedAt).toBeInstanceOf(Date);
      expect(job.request).toEqual(sampleRequest);
    });

    test("job is retrievable via get after creation", async () => {
      await store.create({ id: "test-2", status: "pending", request: sampleRequest });
      const retrieved = await store.get("test-2");
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe("test-2");
    });
  });

  describe("get", () => {
    test("returns null for missing jobs", async () => {
      expect(await store.get("nonexistent")).toBeNull();
    });
  });

  describe("update", () => {
    test("updates fields and sets new updatedAt", async () => {
      const job = await store.create({ id: "u-1", status: "pending", request: sampleRequest });
      const originalUpdatedAt = job.updatedAt;

      const updated = await store.update("u-1", { status: "processing", progress: "Starting..." });
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe("processing");
      expect(updated!.progress).toBe("Starting...");
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });

    test("preserves untouched fields", async () => {
      await store.create({ id: "u-2", status: "pending", request: sampleRequest });
      const updated = await store.update("u-2", { status: "processing" });
      expect(updated!.request).toEqual(sampleRequest);
      expect(updated!.id).toBe("u-2");
    });

    test("returns null for missing jobs", async () => {
      expect(await store.update("nonexistent", { status: "failed" })).toBeNull();
    });
  });

  describe("delete", () => {
    test("returns true and removes existing job", async () => {
      await store.create({ id: "d-1", status: "pending", request: sampleRequest });
      expect(await store.delete("d-1")).toBe(true);
      expect(await store.get("d-1")).toBeNull();
    });

    test("returns false for missing job", async () => {
      expect(await store.delete("nonexistent")).toBe(false);
    });
  });

  describe("cleanup", () => {
    test("removes old completed/failed jobs", async () => {
      const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

      // Create and manually set old updatedAt
      const job = await store.create({
        id: "old-1",
        status: "completed",
        request: sampleRequest,
      });
      job.updatedAt = oldDate;

      const deleted = await store.cleanup(60 * 60 * 1000); // 1 hour max age
      expect(deleted).toBe(1);
      expect(await store.get("old-1")).toBeNull();
    });

    test("preserves pending and processing jobs regardless of age", async () => {
      const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);

      const pending = await store.create({
        id: "keep-1",
        status: "pending",
        request: sampleRequest,
      });
      pending.updatedAt = oldDate;

      const processing = await store.create({
        id: "keep-2",
        status: "processing",
        request: sampleRequest,
      });
      processing.updatedAt = oldDate;

      const deleted = await store.cleanup(60 * 60 * 1000);
      expect(deleted).toBe(0);
      expect(await store.get("keep-1")).not.toBeNull();
      expect(await store.get("keep-2")).not.toBeNull();
    });

    test("preserves recent completed/failed jobs", async () => {
      await store.create({ id: "recent-1", status: "completed", request: sampleRequest });
      const deleted = await store.cleanup(60 * 60 * 1000);
      expect(deleted).toBe(0);
      expect(await store.get("recent-1")).not.toBeNull();
    });
  });
});
