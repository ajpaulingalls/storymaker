import type { Server } from "bun";
import { join, extname } from "path";
import { readdirSync } from "fs";
import { recordStory, type RecorderProgress } from "./recorder";
import { startPersistentServer, buildTemplateUrl } from "./server";
import {
  uploadVideo,
  uploadThumbnail,
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
import {
  getSiteFromAJLink,
  getPostTypeFromLink,
  getSlugFromLink,
  isShortUrl,
  expandShortUrl,
} from "./urlUtils";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

// Social Pulse Backend configuration
const SOCIAL_PULSE_API_URL = process.env.SOCIAL_PULSE_API_URL || "";
const SOCIAL_PULSE_BEARER_TOKEN = process.env.SOCIAL_PULSE_BEARER_TOKEN || "";
const SOCIAL_PULSE_ACCOUNT_ID = process.env.SOCIAL_PULSE_ACCOUNT_ID || "";
const SOCIAL_PULSE_DATASOURCE_ID = process.env.SOCIAL_PULSE_DATASOURCE_ID || "";

// Templates directory path
const templatesDir = join(import.meta.dir, "..", "templates");

/**
 * Get list of available template names
 */
function getAvailableTemplates(): string[] {
  return readdirSync(templatesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name !== "shared")
    .map(dirent => dirent.name);
}

/**
 * Generate the StoryMaker web UI page
 */
function generateStoryMakerPage(templates: string[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StoryMaker</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
    }
    .control-panel {
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
      font-size: 20px;
      margin-bottom: 8px;
      color: #e94560;
    }
    .subtitle {
      font-size: 12px;
      color: #666;
      margin-bottom: 20px;
    }
    .info-text {
      font-size: 11px;
      color: #666;
      margin-top: 5px;
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
      transform: scale(0.4);
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
    button.record {
      background: #28a745;
    }
    button.record:hover {
      background: #34ce57;
    }
    button:disabled {
      background: #555;
      cursor: not-allowed;
    }
    .progress-container {
      display: none;
      margin-top: 15px;
      padding: 15px;
      background: #1a1a2e;
      border: 1px solid #0f3460;
      border-radius: 6px;
    }
    .progress-container.active {
      display: block;
    }
    .progress-bar {
      height: 8px;
      background: #0f3460;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    .progress-bar-fill {
      height: 100%;
      background: #e94560;
      width: 0%;
      transition: width 0.3s ease;
    }
    .progress-text {
      font-size: 12px;
      color: #888;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="control-panel">
    <h1>StoryMaker</h1>
    <p class="subtitle">Video Story Generator</p>
    <p class="info-text" style="margin-top: -10px; margin-bottom: 20px;">Recording: 1080×1920 (9:16 portrait)</p>
    
    <h2>Template</h2>
    <div class="control-group">
      <select id="templateSelect">
        ${templates.map(t => `<option value="${t}">${t}</option>`).join('\n        ')}
      </select>
    </div>
    
    <h2>Content</h2>
    <div class="control-group">
      <label>Article URL</label>
      <input type="text" id="urlInput" placeholder="Paste Al Jazeera article URL...">
      <button onclick="loadContent()">Load Content</button>
    </div>
    
    <div id="errorMessage" class="error-message"></div>
    <div id="loadingIndicator" class="loading-indicator">Loading content...</div>
    
    <h2>Actions</h2>
    <button onclick="updatePreview()">Refresh Preview</button>
    <button class="record" id="recordBtn" onclick="recordVideo()">Record Video</button>
    
    <div id="progressContainer" class="progress-container">
      <div class="progress-bar">
        <div id="progressBarFill" class="progress-bar-fill"></div>
      </div>
      <div id="progressText" class="progress-text">Starting...</div>
    </div>
  </div>
  
  <div class="preview-container">
    <div class="preview-frame" id="previewFrame">
      <iframe id="previewIframe" width="1080" height="1920"></iframe>
    </div>
  </div>
  
  <script>
    let currentContent = {
      site: '',
      postType: '',
      slug: ''
    };
    
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
          slug: data.slug
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
      
      const params = new URLSearchParams({
        template,
        site: currentContent.site,
        postType: currentContent.postType,
        postSlug: currentContent.slug,
      });
      
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
    }
    
    document.getElementById('templateSelect').addEventListener('change', () => {
      if (currentContent.slug) {
        updatePreview();
      }
    });
    
    // Allow Enter key to load content from URL
    document.getElementById('urlInput').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') loadContent();
    });
    
    // Site configuration for GraphQL
    const SITE_CONFIG = {
      aje: { domain: 'www.aljazeera.com' },
      aja: { domain: 'www.aljazeera.net' }
    };
    
    // Fetch article data from GraphQL
    async function fetchArticleData(site, postType, postSlug) {
      const config = SITE_CONFIG[site] || SITE_CONFIG.aje;
      const variables = { name: postSlug, postType: postType, preview: '' };
      const params = new URLSearchParams({
        'wp-site': site,
        'operationName': 'ArchipelagoSingleArticleQuery',
        'variables': JSON.stringify(variables),
        'extensions': '{}'
      });
      
      const url = \`https://\${config.domain}/graphql?\${params.toString()}\`;
      const response = await fetch(url, { headers: { 'Wp-Site': site } });
      
      if (!response.ok) {
        throw new Error('Failed to fetch article data');
      }
      
      const json = await response.json();
      if (!json.data || !json.data.article) {
        throw new Error('Invalid article response');
      }
      
      return json.data.article;
    }
    
    // Record video function
    async function recordVideo() {
      if (!currentContent.slug) {
        showError('Please load content from a URL first');
        return;
      }
      
      const recordBtn = document.getElementById('recordBtn');
      const progressContainer = document.getElementById('progressContainer');
      const progressBarFill = document.getElementById('progressBarFill');
      const progressText = document.getElementById('progressText');
      
      // Disable button and show progress
      recordBtn.disabled = true;
      progressContainer.classList.add('active');
      progressBarFill.style.width = '10%';
      progressText.textContent = 'Starting video creation...';
      clearError();
      
      try {
        const template = document.getElementById('templateSelect').value;
        
        // Start video creation job
        const createResponse = await fetch('/api/create-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            site: currentContent.site,
            slug: currentContent.slug,
            postType: currentContent.postType,
            template: template
          })
        });
        
        if (!createResponse.ok) {
          const error = await createResponse.json();
          throw new Error(error.error || 'Failed to start video creation');
        }
        
        const { jobId } = await createResponse.json();
        progressBarFill.style.width = '20%';
        progressText.textContent = 'Video creation started...';
        
        // Poll for job completion
        let jobComplete = false;
        let videoUrl = '';
        let thumbnailUrl = '';
        
        while (!jobComplete) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const statusResponse = await fetch(\`/api/job/\${jobId}\`);
          const status = await statusResponse.json();
          
          if (status.status === 'completed') {
            jobComplete = true;
            videoUrl = status.url;
            thumbnailUrl = status.thumbnailUrl || '';
            progressBarFill.style.width = '80%';
            progressText.textContent = 'Video created! Fetching article data...';
          } else if (status.status === 'failed') {
            throw new Error(status.error || 'Video creation failed');
          } else {
            // Update progress from API
            const percent = status.progressPercent || 20;
            progressBarFill.style.width = percent + '%';
            progressText.textContent = status.progress || status.status || 'Processing...';
          }
        }
        
        // Fetch article data for publish metadata
        const article = await fetchArticleData(
          currentContent.site,
          currentContent.postType,
          currentContent.slug
        );
        
        progressBarFill.style.width = '90%';
        progressText.textContent = 'Preparing review page...';
        
        // Determine posting category
        let postingCategory = article.primaryCategoryTerm || 'news';
        if (article.isBreaking) postingCategory = 'breaking';
        else if (article.isLive) postingCategory = 'live';
        else if (article.isDeveloping) postingCategory = 'developing';
        
        // Build review page URL with all necessary data
        const articleUrl = document.getElementById('urlInput').value.trim();
        const reviewParams = new URLSearchParams({
          videoUrl: videoUrl,
          thumbnailUrl: thumbnailUrl,
          articleUrl: articleUrl,
          title: article.title || '',
          summary: article.excerpt || article.socialMediaSummary || '',
          category: article.primaryCategoryTermName || '',
          keywords: article.primaryTagsTermName || '',
          postingCategory: postingCategory,
          publishedDate: article.date || new Date().toISOString(),
          slug: currentContent.slug
        });
        
        progressBarFill.style.width = '100%';
        progressText.textContent = 'Redirecting to review...';
        
        // Navigate to review page
        await new Promise(resolve => setTimeout(resolve, 500));
        window.location.href = '/review?' + reviewParams.toString();
        
      } catch (error) {
        showError('Recording failed: ' + error.message);
        recordBtn.disabled = false;
        progressContainer.classList.remove('active');
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Generate the Review page for video preview and publishing
 */
function generateReviewPage(params: {
  videoUrl: string;
  thumbnailUrl: string;
  articleUrl: string;
  title: string;
  summary: string;
  category: string;
  keywords: string;
  postingCategory: string;
  publishedDate: string;
  slug: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StoryMaker - Review</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      padding: 20px;
      background: #16213e;
      border-bottom: 1px solid #0f3460;
    }
    h1 {
      font-size: 20px;
      color: #e94560;
    }
    .subtitle {
      font-size: 14px;
      color: #888;
      margin-top: 5px;
    }
    .content {
      flex: 1;
      padding: 30px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 30px;
    }
    .media-container {
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .video-section, .thumbnail-section {
      background: #16213e;
      border-radius: 12px;
      padding: 20px;
      border: 1px solid #0f3460;
    }
    .video-section h2, .thumbnail-section h2 {
      font-size: 14px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 15px;
    }
    video {
      max-height: 500px;
      border-radius: 8px;
      background: #000;
    }
    .thumbnail-section img {
      max-height: 300px;
      border-radius: 8px;
      background: #000;
    }
    .article-info {
      background: #16213e;
      border-radius: 12px;
      padding: 20px;
      border: 1px solid #0f3460;
      max-width: 800px;
      width: 100%;
    }
    .article-info h2 {
      font-size: 14px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 15px;
    }
    .article-info p {
      color: #aaa;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .article-info strong {
      color: #eee;
    }
    .button-container {
      display: flex;
      gap: 15px;
      padding: 20px;
      background: #16213e;
      border-top: 1px solid #0f3460;
      justify-content: flex-end;
    }
    button {
      padding: 12px 30px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button.back {
      background: #0f3460;
      color: #eee;
    }
    button.back:hover {
      background: #1a4a7a;
    }
    button.publish {
      background: #28a745;
      color: #fff;
    }
    button.publish:hover {
      background: #34ce57;
    }
    button:disabled {
      background: #555;
      cursor: not-allowed;
    }
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }
    .modal-overlay.active {
      display: flex;
    }
    .modal {
      background: #16213e;
      border-radius: 12px;
      padding: 30px;
      border: 1px solid #0f3460;
      text-align: center;
      max-width: 400px;
    }
    .modal h3 {
      color: #28a745;
      margin-bottom: 15px;
      font-size: 18px;
    }
    .modal p {
      color: #aaa;
      margin-bottom: 20px;
    }
    .modal button {
      background: #e94560;
    }
    .modal button:hover {
      background: #ff6b6b;
    }
    .error-message {
      background: #4a1a1a;
      border: 1px solid #e94560;
      border-radius: 6px;
      padding: 15px;
      margin: 20px;
      font-size: 14px;
      color: #ff9999;
      display: none;
    }
    .error-message.active {
      display: block;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>StoryMaker</h1>
    <p class="subtitle">Review your video before publishing</p>
  </div>
  
  <div class="content">
    <div class="media-container">
      <div class="video-section">
        <h2>Video Preview</h2>
        <video controls autoplay muted loop>
          <source src="${params.videoUrl}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      </div>
      
      <div class="thumbnail-section">
        <h2>Thumbnail</h2>
        <img src="${params.thumbnailUrl}" alt="Video thumbnail">
      </div>
    </div>
    
    <div class="article-info">
      <h2>Article Information</h2>
      <p><strong>Title:</strong> ${escapeHtml(params.title)}</p>
      <p><strong>Category:</strong> ${escapeHtml(params.category)}</p>
      <p><strong>Keywords:</strong> ${escapeHtml(params.keywords)}</p>
      <p><strong>Posting Category:</strong> ${escapeHtml(params.postingCategory)}</p>
    </div>
    
    <div id="errorMessage" class="error-message"></div>
  </div>
  
  <div class="button-container">
    <button class="back" onclick="goBack()">Back</button>
    <button class="publish" id="publishBtn" onclick="publish()">Publish</button>
  </div>
  
  <div id="successModal" class="modal-overlay">
    <div class="modal">
      <h3>Published Successfully!</h3>
      <p>Your video has been published to Social Pulse.</p>
      <button onclick="goHome()">Return to StoryMaker</button>
    </div>
  </div>
  
  <script>
    const publishData = {
      videoUrl: ${JSON.stringify(params.videoUrl)},
      thumbnailUrl: ${JSON.stringify(params.thumbnailUrl)},
      articleUrl: ${JSON.stringify(params.articleUrl)},
      title: ${JSON.stringify(params.title)},
      summary: ${JSON.stringify(params.summary)},
      category: ${JSON.stringify(params.category)},
      keywords: ${JSON.stringify(params.keywords)},
      postingCategory: ${JSON.stringify(params.postingCategory)},
      publishedDate: ${JSON.stringify(params.publishedDate)},
      slug: ${JSON.stringify(params.slug)}
    };
    
    function goBack() {
      window.history.back();
    }
    
    function goHome() {
      window.location.href = '/';
    }
    
    function showError(message) {
      const errorEl = document.getElementById('errorMessage');
      errorEl.textContent = message;
      errorEl.classList.add('active');
    }
    
    function clearError() {
      document.getElementById('errorMessage').classList.remove('active');
    }
    
    async function publish() {
      const publishBtn = document.getElementById('publishBtn');
      publishBtn.disabled = true;
      publishBtn.textContent = 'Publishing...';
      clearError();
      
      try {
        const response = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(publishData)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Publishing failed');
        }
        
        // Show success modal
        document.getElementById('successModal').classList.add('active');
        
      } catch (error) {
        showError('Publishing failed: ' + error.message);
        publishBtn.disabled = false;
        publishBtn.textContent = 'Publish';
      }
    }
  </script>
</body>
</html>`;
}

// Helper function to escape HTML
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
    await jobStore.update(job.id, { status: "processing", progress: "Initializing", progressPercent: 10 });

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
    await jobStore.update(job.id, { progress: "Recording video", progressPercent: 15 });

    // Record the video with progress callback
    const result = await recordStory({
      url: templateUrl,
      outputPath,
      width: 1080,
      height: 1920,
      onProgress: async (progress: RecorderProgress) => {
        // Map recorder phases to user-friendly messages
        const phaseMessages: Record<string, string> = {
          initializing: "Initializing browser",
          capturing: `Capturing frames (${progress.currentFrame || 0}/${progress.totalFrames || 0})`,
          stitching: "Encoding video",
          thumbnail: "Generating thumbnail",
          complete: "Recording complete",
        };
        const message = phaseMessages[progress.phase] || progress.phase;
        
        // Update job with progress (don't await to avoid slowing down recording)
        jobStore.update(job.id, { 
          progress: message, 
          progressPercent: progress.percent 
        }).catch(() => {}); // Ignore errors
      },
    });

    if (result.success) {
      let videoUrl: string;
      let thumbnailUrl: string | undefined;

      // Update progress
      await jobStore.update(job.id, { progress: "Uploading video", progressPercent: 75 });

      // Try to upload to Azure Blob Storage if configured
      if (isBlobStorageEnabled()) {
        const blobUrl = await uploadVideo(result.outputPath, filename);

        if (blobUrl) {
          // Successfully uploaded video to blob storage
          videoUrl = blobUrl;

          // Delete the local video temp file
          try {
            await Bun.$`rm ${result.outputPath}`.quiet();
            console.log(`[Job ${job.id}] Deleted local temp file: ${result.outputPath}`);
          } catch {
            console.warn(`[Job ${job.id}] Failed to delete temp file: ${result.outputPath}`);
          }

          // Upload thumbnail if available
          if (result.thumbnailPath) {
            await jobStore.update(job.id, { progress: "Uploading thumbnail", progressPercent: 90 });
            const thumbnailFilename = filename.replace(/\.mp4$/, ".jpg");
            const thumbnailBlobUrl = await uploadThumbnail(result.thumbnailPath, thumbnailFilename);

            if (thumbnailBlobUrl) {
              thumbnailUrl = thumbnailBlobUrl;
              console.log(`[Job ${job.id}] Thumbnail uploaded: ${thumbnailUrl}`);

              // Delete the local thumbnail temp file
              try {
                await Bun.$`rm ${result.thumbnailPath}`.quiet();
                console.log(`[Job ${job.id}] Deleted local thumbnail file: ${result.thumbnailPath}`);
              } catch {
                console.warn(`[Job ${job.id}] Failed to delete thumbnail file: ${result.thumbnailPath}`);
              }
            } else {
              console.warn(`[Job ${job.id}] Thumbnail upload failed`);
            }
          }
        } else {
          // Blob upload failed, fall back to local URL
          console.warn(`[Job ${job.id}] Blob upload failed, falling back to local URL`);
          const host = req.headers.get("host") || "localhost:8080";
          const protocol = req.headers.get("x-forwarded-proto") || "http";
          videoUrl = `${protocol}://${host}/videos/${filename}`;
          
          // Local thumbnail URL if available
          if (result.thumbnailPath) {
            const thumbnailFilename = filename.replace(/\.mp4$/, ".jpg");
            thumbnailUrl = `${protocol}://${host}/videos/${thumbnailFilename}`;
          }
        }
      } else {
        // Blob storage not configured, use local URL
        const host = req.headers.get("host") || "localhost:8080";
        const protocol = req.headers.get("x-forwarded-proto") || "http";
        videoUrl = `${protocol}://${host}/videos/${filename}`;
        
        // Local thumbnail URL if available
        if (result.thumbnailPath) {
          const thumbnailFilename = filename.replace(/\.mp4$/, ".jpg");
          thumbnailUrl = `${protocol}://${host}/videos/${thumbnailFilename}`;
        }
      }

      console.log(`[Job ${job.id}] Video created: ${videoUrl}`);
      if (thumbnailUrl) {
        console.log(`[Job ${job.id}] Thumbnail created: ${thumbnailUrl}`);
      }

      // Update job as completed
      await jobStore.update(job.id, {
        status: "completed",
        progress: undefined,
        result: { url: videoUrl, thumbnailUrl },
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

  if (job.progressPercent !== undefined) {
    response.progressPercent = job.progressPercent;
  }

  if (job.status === "completed" && job.result) {
    response.url = job.result.url;
    if (job.result.thumbnailUrl) {
      response.thumbnailUrl = job.result.thumbnailUrl;
    }
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

      // API endpoint: parse URL (for StoryMaker UI)
      if (pathname === "/api/parse-url" && method === "GET") {
        const inputUrl = url.searchParams.get("url");
        if (!inputUrl) {
          return Response.json({ error: "Missing url parameter" }, { status: 400 });
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

          return Response.json({
            site: site || "aje",
            postType: postType || "post",
            slug: slug || "",
            expandedUrl,
          });
        } catch (error) {
          console.error("[Web Service] Error parsing URL:", error);
          return Response.json({ error: "Failed to parse URL" }, { status: 500 });
        }
      }

      // API endpoint: publish to Social Pulse
      if (pathname === "/api/publish" && method === "POST") {
        // Check if Social Pulse is configured
        if (!SOCIAL_PULSE_API_URL || !SOCIAL_PULSE_BEARER_TOKEN || !SOCIAL_PULSE_ACCOUNT_ID || !SOCIAL_PULSE_DATASOURCE_ID) {
          return Response.json(
            { error: "Social Pulse integration is not configured" },
            { status: 503 }
          );
        }

        try {
          const body = await req.json() as {
            videoUrl: string;
            thumbnailUrl: string;
            articleUrl: string;
            title: string;
            summary: string;
            category: string;
            keywords: string;
            postingCategory: string;
            publishedDate: string;
            slug: string;
          };

          // Validate required fields
          if (!body.videoUrl || !body.title || !body.slug) {
            return Response.json(
              { error: "Missing required fields: videoUrl, title, slug" },
              { status: 400 }
            );
          }

          // Build the Social Pulse API payload
          const payload = {
            accountId: SOCIAL_PULSE_ACCOUNT_ID,
            title: body.title,
            summary: body.summary,
            mediaType: "VIDEO",
            mediaUrl: body.videoUrl,
            destinationUrl: body.articleUrl + "?z=1",
            dataSourceId: SOCIAL_PULSE_DATASOURCE_ID,
            keywords: body.keywords,
            publishedDate: body.publishedDate || new Date().toISOString(),
            category: body.category,
            postingCategory: body.postingCategory,
            thumbnailUrl: body.thumbnailUrl,
            duration: 10,
            isvertical: true,
            externalId: body.slug,
            isActive: true,
          };

          console.log(`[Web Service] Publishing to Social Pulse: ${body.title}`);

          // POST to Social Pulse API
          const response = await fetch(`${SOCIAL_PULSE_API_URL}/api/topics`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SOCIAL_PULSE_BEARER_TOKEN}`,
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Web Service] Social Pulse error: ${response.status} - ${errorText}`);
            return Response.json(
              { error: `Social Pulse API error: ${response.status}` },
              { status: response.status }
            );
          }

          const result = await response.json();
          console.log(`[Web Service] Published successfully to Social Pulse`);

          return Response.json({ success: true, result });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error(`[Web Service] Publish error: ${errorMessage}`);
          return Response.json(
            { error: `Failed to publish: ${errorMessage}` },
            { status: 500 }
          );
        }
      }

      // Preview endpoint: serve template with debug script injection
      if (pathname === "/preview" && method === "GET") {
        const template = url.searchParams.get("template") || "default";
        const site = url.searchParams.get("site") || "aje";
        const postType = url.searchParams.get("postType") || "post";
        const postSlug = url.searchParams.get("postSlug") || "";

        const templatePath = join(templatesDir, template, "index.html");
        const file = Bun.file(templatePath);

        if (await file.exists()) {
          let html = await file.text();

          // Inject debug script - mock recording functions and pass content params
          const debugScript = `
  <script>
    // Preview mode - mock recording functions
    window.storyReady = () => Promise.resolve();
    window.storyDone = () => Promise.resolve();
    
    // Preview mode - override URL params for the template
    window.DEBUG_URL_PARAMS = {
      site: "${site}",
      postType: "${postType}",
      postSlug: "${postSlug}"
    };
  </script>
</head>`;

          html = html.replace('</head>', debugScript);

          return new Response(html, {
            headers: { "Content-Type": "text/html" },
          });
        }

        return new Response(`Template "${template}" not found`, { status: 404 });
      }

      // Serve shared template files (CSS, JS)
      if (pathname.startsWith("/shared/")) {
        const relativePath = pathname.slice(1); // Remove leading /
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

      // Review page endpoint
      if (pathname === "/review" && method === "GET") {
        const params = {
          videoUrl: url.searchParams.get("videoUrl") || "",
          thumbnailUrl: url.searchParams.get("thumbnailUrl") || "",
          articleUrl: url.searchParams.get("articleUrl") || "",
          title: url.searchParams.get("title") || "",
          summary: url.searchParams.get("summary") || "",
          category: url.searchParams.get("category") || "",
          keywords: url.searchParams.get("keywords") || "",
          postingCategory: url.searchParams.get("postingCategory") || "",
          publishedDate: url.searchParams.get("publishedDate") || "",
          slug: url.searchParams.get("slug") || "",
        };

        return new Response(generateReviewPage(params), {
          headers: { "Content-Type": "text/html" },
        });
      }

      // Serve videos
      if (pathname.startsWith("/videos/")) {
        return serveVideo(pathname);
      }

      // Health check
      if (pathname === "/health") {
        return Response.json({ status: "ok" });
      }

      // Root - serve StoryMaker UI
      if (pathname === "/") {
        const templates = getAvailableTemplates();
        return new Response(generateStoryMakerPage(templates), {
          headers: { "Content-Type": "text/html" },
        });
      }

      // API documentation endpoint
      if (pathname === "/api") {
        return Response.json({
          name: "StoryMaker Video Service API",
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
                thumbnailUrl: "string (when completed) - Thumbnail URL (JPEG of last frame)",
                error: "string (when failed) - Error message",
                createdAt: "string - ISO timestamp",
                updatedAt: "string - ISO timestamp",
              },
            },
            "GET /api/parse-url?url=": {
              description: "Parse Al Jazeera article URL",
              response: {
                site: "string - Site identifier",
                postType: "string - Post type",
                slug: "string - Article slug",
                expandedUrl: "string - Expanded URL (if short URL was provided)",
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

  console.log(`\n🎬 StoryMaker running at http://localhost:${port}`);
  console.log(`   Web UI: http://localhost:${port}/`);
  console.log(`   API Docs: http://localhost:${port}/api`);
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
