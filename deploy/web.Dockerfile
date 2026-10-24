# Triad Vision website — static build served by Caddy (automatic HTTPS), which also proxies /api.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --include=dev --no-audit --no-fund
COPY client ./client
# Bundle only: the TypeScript check (`tsc -b`, ~2 GB heap) does not fit the 2 GB production server and runs in
# CI before every deploy anyway. Larger fixed heap for Vite (builds run one at a time).
RUN cd client && NODE_OPTIONS=--max-old-space-size=1792 npx vite build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/client/dist /srv
