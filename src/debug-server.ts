import type { Server } from "bun";
import { join, extname } from "path";
import { readdirSync } from "fs";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

// Sample article data for debugging
const SAMPLE_ARTICLES = {
  aje: {
    title: "Denmark strengthens ties with Greenland amid Arctic tensions",
    excerpt: "As geopolitical interest in the Arctic region intensifies, Denmark reaffirms its commitment to Greenland while navigating complex international pressures.",
    imageUrl: "https://www.aljazeera.com/wp-content/uploads/2026/01/reuters_695e55ea-1767790058.jpg?resize=1920%2C1440",
    imageCredit: "Reuters",
    category: "News",
    location: "Greenland",
    date: new Date(),
    source: "Al Jazeera",
    isBreaking: false,
    isLive: false,
    isDeveloping: false,
    site: "aje",
    isRTL: false,
    locale: "en-US",
    accentColor: "#fa9000",
    accentColorAlt: "#e76f51",
  },
  aja: {
    title: "التوترات تتصاعد في الشرق الأوسط مع استمرار المفاوضات",
    excerpt: "تستمر الجهود الدبلوماسية في المنطقة بينما تتصاعد التوترات على عدة جبهات، وسط دعوات دولية للتهدئة والحوار.",
    imageUrl: "https://www.aljazeera.net/wp-content/uploads/2025/11/epa_691b55dcc357-1763399132.jpg?resize=1920%2C1440",
    imageCredit: "وكالة الأنباء الأوروبية",
    category: "أخبار",
    location: "الشرق الأوسط",
    date: new Date(),
    source: "الجزيرة",
    isBreaking: false,
    isLive: false,
    isDeveloping: false,
    site: "aja",
    isRTL: true,
    locale: "ar-SA",
    accentColor: "#32a2ef",
    accentColorAlt: "#1a7cc7",
  },
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
    .toggle-group {
      display: flex;
      gap: 10px;
    }
    .toggle-group button {
      flex: 1;
      padding: 8px;
      font-size: 12px;
    }
    .toggle-group button.active {
      background: #e94560;
    }
    .toggle-group button:not(.active) {
      background: #0f3460;
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
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
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
  </style>
</head>
<body>
  <div class="debug-panel">
    <h1>🎬 Story Template Debug</h1>
    
    <h2>Template</h2>
    <div class="control-group">
      <select id="templateSelect">
        ${templates.map(t => `<option value="${t}">${t}</option>`).join('\n        ')}
      </select>
    </div>
    
    <h2>Site / Language</h2>
    <div class="control-group">
      <div class="toggle-group">
        <button id="ajeBtn" class="active" onclick="setSite('aje')">AJE (English)</button>
        <button id="ajaBtn" onclick="setSite('aja')">AJA (العربية)</button>
      </div>
    </div>
    
    <h2>Status Flags</h2>
    <div class="control-group status-flags">
      <label><input type="checkbox" id="isBreaking" onchange="updatePreview()"> Breaking</label>
      <label><input type="checkbox" id="isLive" onchange="updatePreview()"> Live</label>
      <label><input type="checkbox" id="isDeveloping" onchange="updatePreview()"> Developing</label>
    </div>
    
    <h2>Preview Scale</h2>
    <div class="control-group scale-controls">
      <button onclick="setScale(0.3)">30%</button>
      <button onclick="setScale(0.4)">40%</button>
      <button onclick="setScale(0.5)">50%</button>
      <button onclick="setScale(0.6)">60%</button>
    </div>
    
    <h2>Actions</h2>
    <button onclick="updatePreview()">🔄 Refresh Preview</button>
    <button class="secondary" onclick="openInNewTab()">↗️ Open Full Size</button>
    
    <h2>Current URL</h2>
    <div class="control-group">
      <input type="text" id="currentUrl" readonly>
      <p class="info-text">Click to copy</p>
    </div>
  </div>
  
  <div class="preview-container">
    <div class="preview-frame" id="previewFrame">
      <iframe id="previewIframe"></iframe>
    </div>
  </div>
  
  <script>
    let currentSite = 'aje';
    let currentScale = 0.4;
    
    function setSite(site) {
      currentSite = site;
      document.getElementById('ajeBtn').classList.toggle('active', site === 'aje');
      document.getElementById('ajaBtn').classList.toggle('active', site === 'aja');
      updatePreview();
    }
    
    function setScale(scale) {
      currentScale = scale;
      document.getElementById('previewFrame').style.transform = \`scale(\${scale})\`;
    }
    
    function getPreviewUrl() {
      const template = document.getElementById('templateSelect').value;
      const isBreaking = document.getElementById('isBreaking').checked;
      const isLive = document.getElementById('isLive').checked;
      const isDeveloping = document.getElementById('isDeveloping').checked;
      
      const params = new URLSearchParams({
        template,
        site: currentSite,
        debug: 'true',
        isBreaking: isBreaking.toString(),
        isLive: isLive.toString(),
        isDeveloping: isDeveloping.toString(),
      });
      
      return \`/preview?\${params.toString()}\`;
    }
    
    function updatePreview() {
      const url = getPreviewUrl();
      document.getElementById('previewIframe').src = url;
      document.getElementById('currentUrl').value = window.location.origin + url;
    }
    
    function openInNewTab() {
      window.open(getPreviewUrl(), '_blank');
    }
    
    document.getElementById('currentUrl').addEventListener('click', function() {
      this.select();
      navigator.clipboard.writeText(this.value);
    });
    
    document.getElementById('templateSelect').addEventListener('change', updatePreview);
    
    // Initial setup
    setScale(currentScale);
    updatePreview();
  </script>
</body>
</html>`;
}

function generatePreviewPage(template: string, site: string, flags: { isBreaking: boolean; isLive: boolean; isDeveloping: boolean }): string {
  const articleData = { ...SAMPLE_ARTICLES[site as keyof typeof SAMPLE_ARTICLES], ...flags };
  
  return `<!DOCTYPE html>
<html lang="${site === 'aja' ? 'ar' : 'en'}" ${site === 'aja' ? 'dir="rtl"' : ''}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, height=1920">
  <title>Preview: ${template}</title>
  <script>
    // Mock the storyReady and storyDone functions
    window.storyReady = () => Promise.resolve();
    window.storyDone = () => Promise.resolve();
    
    // Inject mock article data
    window.DEBUG_ARTICLE_DATA = ${JSON.stringify(articleData, null, 2)};
  </script>
</head>
<body>
  <script>
    // Redirect to load the actual template with debug mode
    const params = new URLSearchParams(window.location.search);
    window.location.href = '/template/${template}/?debug=true&site=${site}&isBreaking=${flags.isBreaking}&isLive=${flags.isLive}&isDeveloping=${flags.isDeveloping}';
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

      // Serve debug panel at root
      if (pathname === "/" || pathname === "/debug") {
        return new Response(generateDebugPage(templates), {
          headers: { "Content-Type": "text/html" },
        });
      }

      // Handle preview requests
      if (pathname === "/preview") {
        const template = url.searchParams.get("template") || "default";
        const site = url.searchParams.get("site") || "aje";
        const flags = {
          isBreaking: url.searchParams.get("isBreaking") === "true",
          isLive: url.searchParams.get("isLive") === "true",
          isDeveloping: url.searchParams.get("isDeveloping") === "true",
        };

        // Serve the template directly with injected debug data
        const templatePath = join(templatesDir, template, "index.html");
        const file = Bun.file(templatePath);

        if (await file.exists()) {
          let html = await file.text();
          
          // Get article data
          const articleData = { 
            ...SAMPLE_ARTICLES[site as keyof typeof SAMPLE_ARTICLES], 
            ...flags 
          };

          // Inject debug script before closing </head>
          const debugScript = `
  <script>
    // Debug mode - mock recording functions
    window.storyReady = () => Promise.resolve();
    window.storyDone = () => Promise.resolve();
    
    // Debug mode - inject mock article data
    window.DEBUG_ARTICLE_DATA = ${JSON.stringify(articleData)};
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
