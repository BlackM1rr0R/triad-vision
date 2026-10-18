# Triad Vision website — static build served by Caddy (automatic HTTPS), which also proxies /api.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --include=dev --no-audit --no-fund
COPY client ./client
# Larger fixed heap for the Vite/TypeScript build (the server has 2 GB RAM + swap; builds run one at a time).
RUN NODE_OPTIONS=--max-old-space-size=1792 npm run build -w client

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/client/dist /srv
