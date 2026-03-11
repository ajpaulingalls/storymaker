import { describe, expect, test, spyOn, beforeEach, afterEach } from "bun:test";
import { parseArgs } from "./args";

describe("parseArgs", () => {
  let originalArgv: string[];
  let exitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    originalArgv = Bun.argv;
    exitSpy = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    Bun.argv = originalArgv;
    exitSpy.mockRestore();
  });

  test("parses all required arguments", () => {
    Bun.argv = [
      "bun",
      "index.ts",
      "--template",
      "default",
      "--site",
      "aje",
      "--postType",
      "post",
      "--postSlug",
      "test-slug",
      "--output",
      "output.mp4",
    ];
    const args = parseArgs();
    expect(args.template).toBe("default");
    expect(args.site).toBe("aje");
    expect(args.postType).toBe("post");
    expect(args.postSlug).toBe("test-slug");
    expect(args.output).toBe("output.mp4");
  });

  test("handles arguments in any order", () => {
    Bun.argv = [
      "bun",
      "index.ts",
      "--output",
      "out.mp4",
      "--site",
      "aja",
      "--postSlug",
      "slug",
      "--template",
      "breaking",
      "--postType",
      "liveblog",
    ];
    const args = parseArgs();
    expect(args.template).toBe("breaking");
    expect(args.site).toBe("aja");
    expect(args.postType).toBe("liveblog");
    expect(args.postSlug).toBe("slug");
    expect(args.output).toBe("out.mp4");
  });

  test("ignores unknown arguments", () => {
    Bun.argv = [
      "bun",
      "index.ts",
      "--unknown",
      "value",
      "--template",
      "default",
      "--site",
      "aje",
      "--postType",
      "post",
      "--postSlug",
      "slug",
      "--output",
      "out.mp4",
    ];
    const args = parseArgs();
    expect(args.template).toBe("default");
  });

  test("calls process.exit(1) when required args are missing", () => {
    Bun.argv = ["bun", "index.ts", "--template", "default"];
    expect(() => parseArgs()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test("calls process.exit(1) when no args provided", () => {
    Bun.argv = ["bun", "index.ts"];
    expect(() => parseArgs()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
