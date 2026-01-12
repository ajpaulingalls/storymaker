# StoryMaker

A Bun CLI application that generates portrait video stories from Al Jazeera article data using Puppeteer for browser automation and screen recording.

## Prerequisites

- [Bun](https://bun.sh) v1.0.0+
- [FFmpeg](https://ffmpeg.org/) (for MP4 conversion)

## Installation

```bash
bun install
```

## Usage

```bash
bun run index.ts \
  --template <template-name> \
  --site <site-id> \
  --postType <post-type> \
  --postSlug <post-slug> \
  --output <output-file.mp4>
```

### Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `--template` | Name of the template folder in `templates/` | `default` |
| `--site` | WordPress site identifier | `aje` |
| `--postType` | Post type for GraphQL query | `post` |
| `--postSlug` | Article slug for GraphQL query | `some-article-slug` |
| `--output` | Output video file path | `./output/story.mp4` |

### Example

```bash
bun run index.ts \
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
│   └── server.ts               # Local template server
├── templates/
│   ├── shared/
│   │   └── story.js            # Shared JS for data fetching & animations
│   └── default/
│       └── index.html          # Default template
└── output/                     # Generated videos (created automatically)
```

## How It Works

1. **CLI parses arguments** and validates required parameters
2. **Local server starts** to serve HTML templates with query parameters
3. **Puppeteer launches** a browser with a 1080x1920 viewport (portrait video)
4. **Page loads** and fetches article data from Al Jazeera GraphQL API
5. **Content renders** and page signals `storyReady()` via exposed function
6. **Recording starts** using Puppeteer's screencast API
7. **Animation plays** (slide-down effect)
8. **Page signals `storyDone()`** when animation completes
9. **Recording stops** and WebM is converted to MP4 via FFmpeg

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

## Video Output

- **Resolution**: 1080x1920 (9:16 portrait, optimized for social media stories)
- **Format**: MP4 (H.264 codec)
- **Intermediate**: WebM (automatically cleaned up after conversion)

## License

Private
