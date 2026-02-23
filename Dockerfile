# MOTHER v7 Interface - Production Dockerfile
# Based on pnpm official Docker best practices
# https://pnpm.io/docker

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install Python 3 and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies globally
RUN pip3 install --no-cache-dir tiktoken openai --break-system-packages

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

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy built application
COPY --from=build /app/dist ./dist

# Copy package.json for pnpm start command
COPY --from=build /app/package.json ./

# Copy drizzle schema if exists (for database migrations)
COPY --from=build /app/drizzle ./drizzle

# Copy Python scripts for text processing
COPY --from=build /app/server/omniscient/pdf_processor.py ./server/omniscient/pdf_processor.py
RUN chmod +x ./server/omniscient/pdf_processor.py

# Create non-root user for security (Debian syntax for node:22-slim)
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --create-home nodejs && \
    chown -R nodejs:nodejs /app && \
    mkdir -p /home/nodejs/.cache && \
    chown -R nodejs:nodejs /home/nodejs

USER nodejs

# Cloud Run requires port 8080
EXPOSE 8080

# Start the application
CMD ["pnpm", "start"]
