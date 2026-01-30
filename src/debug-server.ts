import type { Server } from "bun";
import { join, extname } from "path";
import { readdirSync } from "fs";
import { getSiteFromAJLink, getPostTypeFromLink, getSlugFromLink, isShortUrl, expandShortUrl, getUrlParams } from "./urlUtils";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

// Default content parameters
const DEFAULT_CONTENT = {
  site: "aje",
  postType: "post",
  slug: "trump-nixes-european-tariff-threats-over-greenland-after-nato-chief-talks",
};

function getAvailableTemplates(): string[] {
  const templatesDir = join(import.meta.dir, "..", "templates");
  return readdirSync(templatesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name !== "shared")
    .map(dirent => dirent.name);
}

function generateDebugPage(templates: string[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Story Template Debug</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
    }
    .debug-panel {
      position: fixed;
      top: 0;
      left: 0;
      width: 300px;
      height: 100vh;
      background: #16213e;
      padding: 20px;
      overflow-y: auto;
      z-index: 1000;
      border-right: 1px solid #0f3460;
    }
    h1 {
      font-size: 18px;
      margin-bottom: 20px;
      color: #e94560;
    }
    h2 {
      font-size: 14px;
      margin: 20px 0 10px;
      color: #0f3460;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #888;
    }
    .control-group {
      margin-bottom: 15px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-size: 13px;
      color: #aaa;
    }
    select, input, button {
      width: 100%;
      padding: 10px;
      border: 1px solid #0f3460;
      border-radius: 6px;
      background: #1a1a2e;
      color: #eee;
      font-size: 14px;
    }
    select:focus, input:focus {
      outline: none;
      border-color: #e94560;
    }
    button {
      background: #e94560;
      border: none;
      cursor: pointer;
      font-weight: 600;
      margin-top: 10px;
      transition: background 0.2s;
    }
    button:hover {
      background: #ff6b6b;
    }
    button.secondary {
      background: #0f3460;
    }
    button.secondary:hover {
      background: #1a4a7a;
    }
    .preview-container {
      margin-left: 300px;
      padding: 20px;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }
    .preview-frame {
      width: 1080px;
      height: 1920px;
      transform-origin: top center;
      border: 2px solid #0f3460;
      border-radius: 8px;
      overflow: hidden;
      background: #000;
      display: block;
      box-sizing: content-box;
      padding: 0;
      margin: 0;
      position: relative;
      flex-shrink: 0;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
      padding: 0;
      margin: 0;
      box-sizing: border-box;
    }
    .scale-controls {
      display: flex;
      gap: 5px;
      margin-top: 10px;
    }
    .scale-controls button {
      flex: 1;
      padding: 6px;
      font-size: 11px;
    }
    .status-flags {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .status-flags label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .status-flags input[type="checkbox"] {
      width: auto;
    }
    .info-text {
      font-size: 11px;
      color: #666;
      margin-top: 5px;
    }
    .error-message {
      background: #4a1a1a;
      border: 1px solid #e94560;
      border-radius: 6px;
      padding: 10px;
      margin-top: 10px;
      font-size: 12px;
      color: #ff9999;
      display: none;
    }
    .loading-indicator {
      display: none;
      text-align: center;
      padding: 10px;
      color: #888;
      font-size: 12px;
    }
    .loading-indicator.active {
      display: block;
    }
  </style>
</head>
<body>
  <div class="debug-panel">
    <h1>Story Template Debug</h1>
    
    <h2>Template</h2>
    <div class="control-group">
      <select id="templateSelect">
        ${templates.map(t => `<option value="${t}">${t}</option>`).join('\n        ')}
      </select>
    </div>
    
    <h2>Content</h2>
    <div class="control-group">
      <label>Article URL</label>
      <input type="text" id="urlInput" placeholder="Paste Al Jazeera article URL..." value="https://www.aljazeera.com/news/2025/1/21/${DEFAULT_CONTENT.slug}">
      <button onclick="loadContent()">Load Content</button>
    </div>
    
    <div id="errorMessage" class="error-message"></div>
    <div id="loadingIndicator" class="loading-indicator">Loading content...</div>
    
    <h2>Status Flags</h2>
    <div class="control-group status-flags">
      <label><input type="checkbox" id="isBreaking" onchange="updatePreview()"> Breaking</label>
      <label><input type="checkbox" id="isLive" onchange="updatePreview()"> Live</label>
      <label><input type="checkbox" id="isDeveloping" onchange="updatePreview()"> Developing</label>
    </div>
    <p class="info-text">Flags override article data</p>
    
    <h2>Preview Scale</h2>
    <div class="control-group scale-controls">
      <button onclick="setScale(0.3)">30%</button>
      <button onclick="setScale(0.4)">40%</button>
      <button onclick="setScale(0.5)">50%</button>
      <button onclick="setScale(0.6)">60%</button>
    </div>
    <p class="info-text">Recording size: 1080×1920 (9:16 portrait)</p>
    
    <h2>Actions</h2>
    <button onclick="updatePreview()">Refresh Preview</button>
    <button class="secondary" onclick="openInNewTab()">Open Full Size</button>
    
    <h2>Current URL</h2>
    <div class="control-group">
      <input type="text" id="currentUrl" readonly>
      <p class="info-text">Click to copy</p>
    </div>
  </div>
  
  <div class="preview-container">
    <div class="preview-frame" id="previewFrame">
      <iframe id="previewIframe" width="1080" height="1920"></iframe>
    </div>
  </div>
  
  <script>
    let currentScale = 0.4;
    let currentContent = {
      site: 'aje',
      postType: 'post',
      slug: '${DEFAULT_CONTENT.slug}',
      update: ''
    };
    
    function setScale(scale) {
      currentScale = scale;
      document.getElementById('previewFrame').style.transform = \`scale(\${scale})\`;
    }
    
    async function loadContent() {
      const urlInput = document.getElementById('urlInput');
      const url = urlInput.value.trim();
      
      if (!url) {
        showError('Please enter a URL');
        return;
      }
      
      clearError();
      setLoading(true);
      
      try {
        const response = await fetch(\`/api/parse-url?url=\${encodeURIComponent(url)}\`);
        const data = await response.json();
        
        if (data.error) {
          showError(data.error);
          setLoading(false);
          return;
        }
        
        if (!data.slug) {
          showError('Could not extract slug from URL');
          setLoading(false);
          return;
        }
        
        // Store the parsed content
        currentContent = {
          site: data.site,
          postType: data.postType,
          slug: data.slug,
          update: data.update || ''
        };
        
        // Load the preview
        updatePreview();
      } catch (error) {
        showError('Failed to load content: ' + error.message);
        setLoading(false);
      }
    }
    
    function showError(message) {
      const errorEl = document.getElementById('errorMessage');
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
    
    function clearError() {
      document.getElementById('errorMessage').style.display = 'none';
    }
    
    function setLoading(loading) {
      document.getElementById('loadingIndicator').classList.toggle('active', loading);
    }
    
    function getPreviewUrl() {
      const template = document.getElementById('templateSelect').value;
      const isBreaking = document.getElementById('isBreaking').checked;
      const isLive = document.getElementById('isLive').checked;
      const isDeveloping = document.getElementById('isDeveloping').checked;
      
      const params = new URLSearchParams({
        template,
        site: currentContent.site,
        postType: currentContent.postType,
        postSlug: currentContent.slug,
        isBreaking: isBreaking.toString(),
        isLive: isLive.toString(),
        isDeveloping: isDeveloping.toString(),
      });
      if (currentContent.update) {
        params.set('update', currentContent.update);
      }
      
      return \`/preview?\${params.toString()}\`;
    }
    
    function updatePreview() {
      clearError();
      
      if (!currentContent.slug) {
        showError('Please load content from a URL first');
        return;
      }
      
      setLoading(true);
      
      const url = getPreviewUrl();
      const iframe = document.getElementById('previewIframe');
      
      // Explicitly set iframe dimensions
      iframe.width = '1080';
      iframe.height = '1920';
      iframe.style.width = '1080px';
      iframe.style.height = '1920px';
      
      iframe.onload = () => {
        setLoading(false);
      };
      
      iframe.onerror = () => {
        setLoading(false);
        showError('Failed to load preview');
      };
      
      iframe.src = url;
      document.getElementById('currentUrl').value = window.location.origin + url;
    }
    
    function openInNewTab() {
      if (!currentContent.slug) {
        showError('Please load content from a URL first');
        return;
      }
      window.open(getPreviewUrl(), '_blank');
    }
    
    document.getElementById('currentUrl').addEventListener('click', function() {
      this.select();
      navigator.clipboard.writeText(this.value);
    });
    
    document.getElementById('templateSelect').addEventListener('change', updatePreview);
    
    // Allow Enter key to load content from URL
    document.getElementById('urlInput').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') loadContent();
    });
    
    // Initial setup
    setScale(currentScale);
    loadContent();
  </script>
</body>
</html>`;
}

export async function startDebugServer(port: number = 3333): Promise<Server> {
  const templatesDir = join(import.meta.dir, "..", "templates");
  const templates = getAvailableTemplates();

  console.log(`📂 Templates directory: ${templatesDir}`);
  console.log(`📋 Available templates: ${templates.join(', ')}`);

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      console.log(`[Debug] ${req.method} ${pathname}`);

      // API endpoint to parse URLs
      if (pathname === "/api/parse-url") {
        const inputUrl = url.searchParams.get("url");
        if (!inputUrl) {
          return new Response(JSON.stringify({ error: "Missing url parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          // Expand short URL if needed
          let expandedUrl = inputUrl;
          if (isShortUrl(inputUrl)) {
            expandedUrl = await expandShortUrl(inputUrl);
          }

          const site = getSiteFromAJLink(expandedUrl);
          const postType = getPostTypeFromLink(expandedUrl);
          const slug = getSlugFromLink(expandedUrl);
          const updateParam = getUrlParams<{ update: string }>(expandedUrl).update;
          const update = updateParam && /^\d+$/.test(updateParam) ? updateParam : "";

          return new Response(JSON.stringify({
            site: site || "aje",
            postType: postType || "post",
            slug: slug || "",
            update,
            expandedUrl,
          }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("[Debug] Error parsing URL:", error);
          return new Response(JSON.stringify({ error: "Failed to parse URL" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // Serve debug panel at root
      if (pathname === "/" || pathname === "/debug") {
        return new Response(generateDebugPage(templates), {
          headers: { "Content-Type": "text/html" },
        });
      }

      // Handle preview requests
      if (pathname === "/preview") {
        const template = url.searchParams.get("template") || "default";
        const site = url.searchParams.get("site") || DEFAULT_CONTENT.site;
        const postType = url.searchParams.get("postType") || DEFAULT_CONTENT.postType;
        const postSlug = url.searchParams.get("postSlug") || DEFAULT_CONTENT.slug;
        const update = url.searchParams.get("update") || "";
        const flags = {
          isBreaking: url.searchParams.get("isBreaking") === "true",
          isLive: url.searchParams.get("isLive") === "true",
          isDeveloping: url.searchParams.get("isDeveloping") === "true",
        };

        // Serve the template directly
        const templatePath = join(templatesDir, template, "index.html");
        const file = Bun.file(templatePath);

        if (await file.exists()) {
          let html = await file.text();
          
          // Inject debug script - mock recording functions and pass content params
          const debugScript = `
  <script>
    // Debug mode - mock recording functions
    window.storyReady = () => Promise.resolve();
    window.storyDone = () => Promise.resolve();
    
    // Debug mode - override URL params for the template
    window.DEBUG_URL_PARAMS = {
      site: "${site}",
      postType: "${postType}",
      postSlug: "${postSlug}",
      update: "${update}"
    };
    
    // Override status flags if set
    window.DEBUG_FLAG_OVERRIDES = ${JSON.stringify(flags)};
  </script>
</head>`;
          
          html = html.replace('</head>', debugScript);
          
          return new Response(html, {
            headers: { "Content-Type": "text/html" },
          });
        }

        return new Response(`Template "${template}" not found`, { status: 404 });
      }

      // Serve shared files
      if (pathname.startsWith("/shared/")) {
        const relativePath = pathname.slice(1);
        const filePath = join(templatesDir, relativePath);
        const file = Bun.file(filePath);

        if (await file.exists()) {
          const ext = extname(pathname);
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          return new Response(file, {
            headers: { "Content-Type": contentType },
          });
        }
        return new Response("File not found", { status: 404 });
      }

      // Serve template-specific files (for CSS, images, etc.)
      if (pathname.startsWith("/template/")) {
        const parts = pathname.slice("/template/".length).split("/");
        const template = parts[0];
        const filePath = join(templatesDir, template, parts.slice(1).join("/") || "index.html");
        const file = Bun.file(filePath);

        if (await file.exists()) {
          const ext = extname(filePath);
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          return new Response(file, {
            headers: { "Content-Type": contentType },
          });
        }
        return new Response("File not found", { status: 404 });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  console.log(`\n🚀 Debug server running at http://localhost:${port}`);
  console.log(`   Open in browser to preview templates\n`);

  return server;
}

// Run directly if this is the main module
if (import.meta.main) {
  startDebugServer();
}
