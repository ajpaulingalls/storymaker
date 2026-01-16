# StoryMaker

A Bun application that generates portrait video stories from Al Jazeera article data using Puppeteer for browser automation and screen recording. Available as both a CLI tool and a web service API.

## Prerequisites

- [Bun](https://bun.sh) v1.0.0+
- [FFmpeg](https://ffmpeg.org/) (for video encoding and thumbnail generation)
- [Puppeteer](https://pptr.dev/) (automatically installed via npm dependencies)

### Optional: Azure Storage

For production deployments, configure Azure Storage for video and job persistence:

- **Azure Blob Storage**: Stores generated videos and thumbnails
- **Azure Table Storage**: Persists job status and metadata

Set environment variable:
```bash
export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=..."
export AZURE_STORAGE_CONTAINER="videos"  # Optional, defaults to "videos"
```

Without Azure configuration, the service uses:
- Local filesystem for video storage
- In-memory job store (jobs lost on restart)

## Installation

```bash
bun install
```

## Usage

### Web Service

Start the web service:

```bash
bun run serve
```

The service runs on port 8080 and provides the following endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/create-video` | POST | Create a video job (returns job ID immediately) |
| `/api/job/{jobId}` | GET | Get job status and result |
| `/videos/{filename}` | GET | Serve generated videos (fallback when blob storage unavailable) |
| `/health` | GET | Health check |
| `/` | GET | API documentation |

#### Create Video Request

```bash
curl -X POST http://localhost:8080/api/create-video \
  -H "Content-Type: application/json" \
  -d '{
    "site": "aje",
    "slug": "article-slug",
    "postType": "post",
    "template": "default"
  }'
```

#### Response (202 Accepted)

```json
{
  "jobId": "abc123-def456"
}
```

#### Get Job Status

```bash
curl http://localhost:8080/api/job/abc123-def456
```

#### Job Status Response

**Pending/Processing:**
```json
{
  "jobId": "abc123-def456",
  "status": "processing",
  "progress": "recording video",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:15.000Z"
}
```

**Completed:**
```json
{
  "jobId": "abc123-def456",
  "status": "completed",
  "url": "https://storage.azure.com/videos/1705234567890-abc123.mp4",
  "thumbnailUrl": "https://storage.azure.com/videos/1705234567890-abc123.jpg",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:32:00.000Z"
}
```

**Failed:**
```json
{
  "jobId": "abc123-def456",
  "status": "failed",
  "error": "Recording failed: timeout",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:30.000Z"
}
```

### CLI

```bash
bun run start \
  --template <template-name> \
  --site <site-id> \
  --postType <post-type> \
  --postSlug <post-slug> \
  --output <output-file.mp4>
```

#### CLI Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `--template` | Name of the template folder in `templates/` | `default` |
| `--site` | WordPress site identifier | `aje` |
| `--postType` | Post type for GraphQL query | `post` |
| `--postSlug` | Article slug for GraphQL query | `some-article-slug` |
| `--output` | Output video file path | `./output/story.mp4` |

#### CLI Example

```bash
bun run start \
  --template default \
  --site aje \
  --postType post \
  --postSlug breaking-news-story \
  --output ./output/story.mp4
```

## Project Structure

```
storymaker/
├── index.ts                    # CLI entry point
├── src/
│   ├── args.ts                 # Argument parsing and validation
│   ├── recorder.ts             # Puppeteer setup and frame-by-frame video recording
│   ├── server.ts               # Template server (CLI & web service)
│   ├── web-service.ts          # Web service API entry point with job queue
│   ├── job-store.ts            # Job status tracking (in-memory or Azure Table Storage)
│   ├── blob-storage.ts         # Azure Blob Storage integration for videos
│   └── debug-server.ts         # Debug server for template preview
├── templates/
│   ├── shared/
│   │   ├── story.js            # Shared JS for data fetching & animations
│   │   ├── components.js       # Shared UI components
│   │   └── base.css            # Shared base styles
│   ├── default/
│   │   └── index.html          # Default template
│   ├── breaking/               # Breaking news template
│   ├── cinematic/              # Cinematic template
│   ├── headline/               # Headline template
│   ├── kenBurns/               # Ken Burns effect template
│   ├── minimal/                # Minimal template
│   ├── quote/                  # Quote template
│   └── split/                  # Split layout template
└── videos/                     # Generated videos (web-accessible)
```

## How It Works

### Web Service Flow

1. **API receives request** with site, slug, postType, and template parameters
2. **Job created** in job store (in-memory or Azure Table Storage) with status "pending"
3. **Job ID returned immediately** (202 Accepted) - client polls for status
4. **Background processing starts:**
   - Template server serves the requested template with query parameters
   - Puppeteer launches a browser with a 1080x1920 viewport (portrait video)
   - Page loads and fetches article data from Al Jazeera GraphQL API
   - Content renders and page signals `storyReady()` via exposed function
   - **Frame-by-frame capture**: Animations are paused and captured frame-by-frame at 25fps
   - Frames are stitched into MP4 video using FFmpeg
   - Thumbnail (JPEG) is generated from the last frame
5. **Upload to storage:**
   - If Azure Blob Storage is configured: videos and thumbnails are uploaded, local files deleted
   - Otherwise: files remain in local `videos/` directory
6. **Job status updated** to "completed" with video and thumbnail URLs
7. **Client polls** `/api/job/{jobId}` to check status and retrieve URLs

### CLI Flow

1. **CLI parses arguments** and validates required parameters
2. **Local server starts** to serve HTML templates with query parameters
3. **Puppeteer launches** and loads the template
4. **Frame-by-frame capture** at 25fps with animation seeking
5. **FFmpeg stitches** frames into MP4 video
6. **Thumbnail generated** from last frame
7. **Server stops** after video generation
8. **Output saved** to specified file path

## Creating Custom Templates

1. Create a new folder in `templates/` (e.g., `templates/custom/`)
2. Add an `index.html` file
3. Include the shared story.js: `<script src="/shared/story.js"></script>`
4. Call `window.StoryMaker.initStory()` with optional custom render/animate functions

### Template Example

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    /* Your custom styles for 1080x1920 viewport */
  </style>
</head>
<body>
  <div id="content">
    <h1 id="title"></h1>
    <p id="excerpt"></p>
  </div>
  
  <script src="/shared/story.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      window.StoryMaker.initStory({
        // Optional: custom render function
        renderContent: (title, excerpt) => {
          document.getElementById('title').textContent = title;
          document.getElementById('excerpt').textContent = excerpt;
        },
        // Optional: custom animation function
        animateContent: async () => {
          // Your animation logic
          await new Promise(r => setTimeout(r, 2000));
        }
      });
    });
  </script>
</body>
</html>
```

## Available Templates

| Template | Description |
|----------|-------------|
| `default` | Standard news story with pan animation |
| `breaking` | Breaking news style with urgent styling |
| `cinematic` | Cinematic presentation with dramatic effects |
| `headline` | Bold headline-focused layout |
| `kenBurns` | Ken Burns zoom/pan effect on images |
| `minimal` | Clean, minimal design |
| `quote` | Quote-focused layout |
| `split` | Split-screen layout |

## Debug Server

Preview templates in browser without generating videos:

```bash
bun run debug
```

Opens at http://localhost:3333 with a UI to:
- Select templates
- Toggle between AJE (English) and AJA (Arabic)
- Toggle status flags (Breaking, Live, Developing)
- Preview at different scales

## Video Output

- **Resolution**: 1080x1920 (9:16 portrait, optimized for social media stories)
- **Format**: MP4 (H.264 codec, libx264)
- **Frame Rate**: 25fps (configurable)
- **Duration**: 10 seconds default (configurable)
- **Thumbnail**: JPEG generated from the last frame
- **Recording Method**: Frame-by-frame capture with animation seeking (no WebM intermediate)

## Azure Deployment

This application can be deployed to Azure App Service using GitHub Actions for CI/CD.

### Prerequisites

- Azure subscription
- GitHub repository
- Azure CLI installed locally (for one-time setup)

### One-Time Setup

#### 1. Create Azure Service Principal

Run locally to create credentials for GitHub Actions:

```bash
# Login to Azure
az login

# Get your subscription ID
az account show --query id -o tsv

# Create service principal with Contributor role
az ad sp create-for-rbac \
  --name "storymaker-github-actions" \
  --role contributor \
  --scopes /subscriptions/{YOUR_SUBSCRIPTION_ID} \
  --sdk-auth
```

Save the JSON output for the next step.

#### 2. Configure GitHub Secrets

Go to your GitHub repo > Settings > Secrets and variables > Actions

**Add these secrets:**

| Secret Name | Description |
|-------------|-------------|
| `AZURE_CREDENTIALS` | The JSON output from step 1 |

**Add these variables** (Variables tab):

| Variable Name | Description | Example |
|---------------|-------------|---------|
| `AZURE_RESOURCE_GROUP` | Resource group name | `storymaker-rg` |
| `AZURE_LOCATION` | Azure region | `eastus` |
| `APP_NAME` | Base name for resources | `storymaker` |

### Deployment

#### Initial Infrastructure Setup

1. Go to Actions tab in GitHub
2. Select "Infrastructure" workflow
3. Click "Run workflow"
4. Wait for completion (~5 minutes)

This creates:
- Azure Container Registry
- Azure Storage Account (for video storage via Blob Storage and job tracking via Table Storage)
- Azure App Service Plan (B2 tier)
- Azure Web App

**Note**: After infrastructure setup, configure the App Service with:
- `AZURE_STORAGE_CONNECTION_STRING`: Connection string from the storage account
- `AZURE_STORAGE_CONTAINER`: Container name (defaults to "videos" if not set)

#### Deploy Application

Push to `main` branch to automatically deploy, or:

1. Go to Actions tab
2. Select "Deploy" workflow
3. Click "Run workflow"

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  GitHub Actions │────▶│ Azure Container  │────▶│  Azure App      │
│  (Build & Push) │     │ Registry (ACR)   │     │  Service        │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  Azure Blob     │
                                                 │  Storage        │
                                                 │  (Videos)       │
                                                 └─────────────────┘
```

### Useful Commands

```bash
# View application logs
az webapp log tail \
  --resource-group storymaker-rg \
  --name storymaker-app

# Restart the app
az webapp restart \
  --resource-group storymaker-rg \
  --name storymaker-app

# Delete all resources
az group delete --name storymaker-rg --yes
```

### Local Docker Testing

```bash
# Build the image
bun run docker:build
# or
docker build -t storymaker:test .

# Run locally (without blob storage)
bun run docker:run
# or
docker run -p 8080:8080 storymaker:test

# Test the API
curl http://localhost:8080/health

# Rebuild and restart
bun run docker:update
```

### Job Management

The web service automatically manages job lifecycle:

- **Job Cleanup**: Completed and failed jobs older than 24 hours are automatically deleted
- **Cleanup Interval**: Runs every hour
- **Storage**: Jobs persist in Azure Table Storage (if configured) or in-memory (development)

Job statuses:
- `pending`: Job created, waiting to be processed
- `processing`: Video generation in progress (includes `progress` field)
- `completed`: Video ready (includes `url` and optional `thumbnailUrl`)
- `failed`: Generation failed (includes `error` field)

## License

Private
