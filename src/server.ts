import type { Server } from "bun";
import { join, extname } from "path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

export interface TemplateServerOptions {
  template: string;
  site: string;
  postType: string;
  postSlug: string;
}

export async function startServer(options: TemplateServerOptions): Promise<{
  server: Server;
  url: string;
}> {
  const templatesDir = join(import.meta.dir, "..", "templates");
  console.log(`Templates directory: ${templatesDir}`);

  const server = Bun.serve({
    port: 0, // Let Bun pick an available port
    async fetch(req) {
      const url = new URL(req.url);
      let pathname = url.pathname;

      console.log(`[Server] Request: ${pathname}`);

      // Serve the template index.html at root
      if (pathname === "/") {
        const templatePath = join(
          templatesDir,
          options.template,
          "index.html"
        );
        console.log(`[Server] Serving template: ${templatePath}`);
        const file = Bun.file(templatePath);

        if (await file.exists()) {
          return new Response(file, {
            headers: { "Content-Type": "text/html" },
          });
        }
        console.log(`[Server] Template not found: ${templatePath}`);
        return new Response("Template not found", { status: 404 });
      }

      // Serve shared files (remove leading slash for join)
      if (pathname.startsWith("/shared/")) {
        const relativePath = pathname.slice(1); // Remove leading /
        const filePath = join(templatesDir, relativePath);
        console.log(`[Server] Serving shared file: ${filePath}`);
        const file = Bun.file(filePath);

        if (await file.exists()) {
          const ext = extname(pathname);
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          return new Response(file, {
            headers: { "Content-Type": contentType },
          });
        }
        console.log(`[Server] Shared file not found: ${filePath}`);
        return new Response("File not found", { status: 404 });
      }

      // Serve template-specific files
      const relativePath = pathname.slice(1); // Remove leading /
      const filePath = join(templatesDir, options.template, relativePath);
      console.log(`[Server] Serving template file: ${filePath}`);
      const file = Bun.file(filePath);

      if (await file.exists()) {
        const ext = extname(pathname);
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        return new Response(file, {
          headers: { "Content-Type": contentType },
        });
      }

      console.log(`[Server] File not found: ${filePath}`);
      return new Response("Not found", { status: 404 });
    },
  });

  // Build the URL with query parameters
  const templateUrl = new URL(`http://localhost:${server.port}/`);
  templateUrl.searchParams.set("site", options.site);
  templateUrl.searchParams.set("postType", options.postType);
  templateUrl.searchParams.set("postSlug", options.postSlug);

  return {
    server,
    url: templateUrl.toString(),
  };
}

export function stopServer(server: Server): void {
  server.stop();
}
