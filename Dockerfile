# Stage 1: Install dependencies
FROM oven/bun:1 AS base

WORKDIR /app

# Install system dependencies for Puppeteer (Chromium) and FFmpeg
RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    # Chromium dependencies
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    # Clean up
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to skip downloading Chromium (we use system Chromium)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Stage 2: Install dependencies
FROM base AS install

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Stage 3: Production image
FROM base AS production

WORKDIR /app

# Copy node_modules from install stage
COPY --from=install /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create videos directory for temporary storage
RUN mkdir -p /app/videos

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Expose the web service port
EXPOSE 8080

# Run the web service
CMD ["bun", "run", "src/web-service.ts"]
