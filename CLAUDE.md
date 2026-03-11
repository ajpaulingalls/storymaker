# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StoryMaker generates portrait video stories (1080x1920, 9:16) from Al Jazeera article data. It uses Puppeteer for browser automation with frame-by-frame capture and FFmpeg for video encoding. Runs as both a CLI tool and a web service API.

**Runtime**: Bun (v1.0+) with TypeScript. No build step needed — Bun runs `.ts` files directly.

## Commands

```bash
bun install              # Install dependencies (also installs git hooks via lefthook)
bun run start            # CLI mode (requires --template, --site, --postType, --postSlug, --output)
bun run serve            # Web service on port 8080
bun run debug            # Debug/preview server on port 3333
bun run lint             # Run ESLint
bun run lint:fix         # Run ESLint with auto-fix
bun run format           # Format all files with Prettier
bun run format:check     # Check formatting without writing
bun run docker:build     # Build Docker image
bun run docker:run       # Run Docker container (uses .env file)
bun run docker:update    # Stop, rebuild, and run Docker container
```

There are no test commands configured. Linting and formatting run automatically on pre-commit via Lefthook.

## Architecture

### Entry Points

- `index.ts` — CLI entry point. Parses args, starts a local template server, records video, exits.
- `src/web-service.ts` — Web service entry point. Exposes REST API with async job queue for video generation.
- `src/debug-server.ts` — Template preview UI for development. Serves a full customization panel at localhost:3333.

### Core Pipeline

1. **Template Server** (`src/server.ts`) — Serves HTML templates with query parameters to Puppeteer.
2. **Recorder** (`src/recorder.ts`) — The most complex module. Launches Puppeteer at 1080x1920, injects a **virtual clock** that overrides `setTimeout`, `setInterval`, `requestAnimationFrame`, and `Date.now()`. Advances time deterministically frame-by-frame (1000/fps ms per frame) for precise animation capture. Screenshots are JPEG (quality 85). FFmpeg stitches frames into H.264 MP4 at 25fps and generates a thumbnail from the last frame.
3. **Article Fetcher** (`src/article-fetcher.ts`) — Fetches from Al Jazeera's GraphQL API. Supports posts and liveblog updates. Extracts additional images from HTML content. Optional AI summarization via Cortex API.

### Template System

Templates live in `templates/`, each with an `index.html`. Shared resources in `templates/shared/`:

- `story.js` — Data fetching, rendering lifecycle, animation hooks
- `components.js` — Reusable UI components (logo, badges, text)
- `base.css` — Base styles and animations

Templates interact via:

- `window.StoryMaker.initStory({ renderContent, animateContent })` — Register render/animation callbacks
- `window.getStoryDuration()` — Return total animation duration in ms
- Page calls `storyReady()` (Puppeteer-exposed function) to signal recording can begin

Templates: default, breaking, cinematic, headline, kenBurns, minimal, quote, split, narrative, categories, doubleImage, liveUpdates.

### Storage & Jobs (Web Service)

- **Job Store** (`src/job-store.ts`) — Dual implementation: `InMemoryJobStore` for dev, `AzureTableJobStore` for production. Same interface.
- **Blob Storage** (`src/blob-storage.ts`) — Optional Azure Blob Storage for video/thumbnail persistence. Falls back to local `videos/` directory.
- Jobs auto-cleanup after 24 hours (hourly sweep).

### Web Service API

- `POST /api/create-video` — Queue video generation, returns `{ jobId }` (202)
- `GET /api/job/{jobId}` — Poll job status (pending/processing/completed/failed)
- `GET /health` — Health check

### URL Utilities

`src/urlUtils.ts` — Parses Al Jazeera URLs to extract site, postType, and postSlug. Handles both AJE (English) and AJA (Arabic/RTL) sites.

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

- `SOCIAL_PULSE_*` — External Social Pulse API integration
- `CORTEX_API_URL`, `CORTEX_API_KEY` — AI summarization service
- `AZURE_STORAGE_CONNECTION_STRING` — Enables Azure Blob + Table storage (optional for dev)
- `PUPPETEER_EXECUTABLE_PATH` — Override Chromium path (Docker sets to `/usr/bin/chromium`)

## Deployment

Deploys to Azure App Service via GitHub Actions. Two workflows:

- `.github/workflows/infrastructure.yml` — Manual trigger to provision Azure resources
- `.github/workflows/deploy.yml` — Auto-deploys on push to `main` (builds Docker image, pushes to ACR)

## Key Patterns

- All templates target a fixed 1080x1920 viewport — no responsive design needed.
- RTL support for Arabic (AJA site) is built into templates and components.
- The virtual clock in `recorder.ts` is critical for deterministic animation capture — any changes to timing/animation code must account for this.
- Console logging uses prefixed tags (`[Recorder]`, `[Job Store]`, `[Page]`, etc.) for traceability.
- Frontend templates are vanilla HTML/CSS/JS with no framework — DOM manipulation only.
