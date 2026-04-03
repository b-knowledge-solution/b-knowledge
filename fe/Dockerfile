# ============================================================
# Stage 1 — Build
# ============================================================
# Build the React/Vite SPA into static files.
# VITE_API_BASE_URL is left empty so all /api calls are
# relative — nginx in the production stage proxies them to
# the backend container on the Docker network.
FROM node:24-alpine AS builder

# Accept API base URL as a build arg; empty = relative paths (recommended for Docker)
ARG VITE_API_BASE_URL=""

WORKDIR /app

# Copy workspace root manifests so npm workspaces resolves correctly
COPY package.json package-lock.json* ./

# Copy only the fe workspace package.json so npm install is layer-cached
COPY fe/package.json ./fe/

# Install all deps (including devDeps needed by Vite build)
RUN npm install --workspace=fe

# Copy fe source (tsconfig, src, public, index.html, vite config)
COPY fe/ ./fe/

# Produce optimised production bundle in fe/dist/
RUN VITE_API_BASE_URL="${VITE_API_BASE_URL}" npm run build:prod --workspace=fe

# ============================================================
# Stage 2 — Production (nginx)
# ============================================================
FROM nginx:stable-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom config that handles SPA routing + /api proxy to backend
COPY docker/nginx/frontend-docker.conf /etc/nginx/conf.d/frontend.conf

# Copy compiled assets from builder stage
COPY --from=builder /app/fe/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Healthcheck via /health endpoint defined in frontend-docker.conf
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
