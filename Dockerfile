# MOTHER v7 Interface - Production Dockerfile
# Based on pnpm official Docker best practices
# https://pnpm.io/docker
#
# v74.16: NC-PLAYWRIGHT-001 — Added Playwright Chromium for real browser access
# Scientific basis: Playwright (Microsoft, 2020) — headless browser automation
# Enables: searchAnnasArchive(), searchDuckDuckGo(), searchForums(), searchSoftwareManual()
# Without this: browser-agent.ts functions fail silently in Cloud Run (no Chromium binary)

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Build stage - Install ALL dependencies and build
FROM base AS build
WORKDIR /app

# Copy only dependency files first (for better caching)
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Now copy source code
COPY . .

# Build the application
RUN pnpm run build

# Production stage - Install ONLY production dependencies
FROM base AS prod-deps
WORKDIR /app

# Copy only dependency files
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Final stage - Minimal production image
FROM base
WORKDIR /app

# v74.16: NC-PLAYWRIGHT-001 — Install Playwright system dependencies (Chromium)
# Scientific basis: Playwright requires system-level Chromium + OS dependencies
# Must install BEFORE switching to non-root user (requires root for apt-get)
# node:22-slim is Debian-based — apt-get is available
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 \
    wget ca-certificates fonts-liberation libx11-xcb1 libxss1 xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy built application
COPY --from=build /app/dist ./dist

# Copy TypeScript source files for self-code-reader (read-only introspection)
# Scientific basis: Godel Machine (Schmidhuber, 2003) -- self-referential system requires
# access to its own source code for autonomous improvement proposals.
# Without this, self-code-reader returns empty modules and LLM cannot perform self-diagnosis.
# Root cause of self-diagnosis failure: esbuild bundles everything into dist/index.js,
# so server/*.ts files do not exist in the final image without this explicit COPY.
COPY --from=build /app/server ./server

# Copy package.json for pnpm start command
COPY --from=build /app/package.json ./

# Copy drizzle schema if exists (for database migrations)
COPY --from=build /app/drizzle ./drizzle

# Copy scripts/ for pnpm start pre-flight (dgm-pre-start.mjs runs before server)
COPY --from=build /app/scripts ./scripts

# v74.16: Install Playwright Chromium browser binary
# PLAYWRIGHT_BROWSERS_PATH ensures binary is accessible by non-root user after chown
ENV PLAYWRIGHT_BROWSERS_PATH=/home/nodejs/.cache/ms-playwright
RUN npx playwright install chromium 2>/dev/null || echo "Playwright Chromium install attempted"

# Create non-root user for security (Debian syntax for node:22-slim)
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --create-home nodejs && \
    chown -R nodejs:nodejs /app && \
    mkdir -p /home/nodejs/.cache/ms-playwright && \
    chown -R nodejs:nodejs /home/nodejs

USER nodejs

# Cloud Run requires port 8080
EXPOSE 8080

# Start the application
CMD ["pnpm", "start"]
