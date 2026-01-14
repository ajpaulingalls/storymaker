# StoryMaker

A Bun application that generates portrait video stories from Al Jazeera article data using Puppeteer for browser automation and screen recording. Available as both a CLI tool and a web service API.

## Prerequisites

- [Bun](https://bun.sh) v1.0.0+
- [FFmpeg](https://ffmpeg.org/) (for MP4 conversion)

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
| `/api/create-video` | POST | Create a video from article data |
| `/videos/{filename}` | GET | Serve generated videos |
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

#### Response

```json
{
  "success": true,
  "url": "http://localhost:8080/videos/1705234567890-abc123.mp4"
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
│   ├── recorder.ts             # Puppeteer setup and video recording
│   ├── server.ts               # Template server (CLI & web service)
│   ├── web-service.ts          # Web service API entry point
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
2. **Template server** serves the requested template with query parameters
3. **Puppeteer launches** a browser with a 1080x1920 viewport (portrait video)
4. **Page loads** and fetches article data from Al Jazeera GraphQL API
5. **Content renders** and page signals `storyReady()` via exposed function
6. **Recording starts** using Puppeteer's screencast API
7. **Animation plays** according to the template
8. **Page signals `storyDone()`** when animation completes
9. **Recording stops** and WebM is converted to MP4 via FFmpeg
10. **Video URL returned** in the API response

### CLI Flow

1. **CLI parses arguments** and validates required parameters
2. **Local server starts** to serve HTML templates with query parameters
3. Steps 3-9 same as web service flow
4. **Server stops** after video generation

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
- **Format**: MP4 (H.264 codec)
- **Intermediate**: WebM (automatically cleaned up after conversion)

## License

Private
