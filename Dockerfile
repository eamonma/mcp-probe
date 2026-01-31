# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY packages/server/package.json ./packages/server/
COPY packages/dashboard/package.json ./packages/dashboard/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY packages/server/src ./packages/server/src
COPY packages/server/tsconfig.json ./packages/server/
COPY packages/dashboard/src ./packages/dashboard/src
COPY packages/dashboard/tsconfig.json ./packages/dashboard/
COPY packages/dashboard/vite.config.ts ./packages/dashboard/
COPY packages/dashboard/index.html ./packages/dashboard/
COPY tsconfig.json ./

# Build dashboard and server
RUN npm run build

# Production stage
FROM node:20-alpine AS production

ARG BUILD_ID=unknown
ENV BUILD_ID=$BUILD_ID

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY packages/server/package.json ./packages/server/
COPY packages/dashboard/package.json ./packages/dashboard/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/dashboard/dist ./packages/dashboard/dist

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV OBSERVABILITY=true

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start server
CMD ["node", "packages/server/dist/index.js"]
