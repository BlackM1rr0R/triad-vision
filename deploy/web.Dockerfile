# Triad Vision website — static build served by Caddy (automatic HTTPS), which also proxies /api.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --include=dev --no-audit --no-fund
COPY client ./client
# The salary calculator bundles the site's single payroll implementation (pure TS, no server dependencies).
COPY server/src/lib/budget/params.ts server/src/lib/budget/payroll.ts server/src/lib/budget/salary.ts ./server/src/lib/budget/
# Bundle only: the TypeScript check (`tsc -b`, ~2 GB heap) does not fit the 2 GB production server and runs in
# CI before every deploy anyway. Larger fixed heap for Vite (builds run one at a time). The second build is the
# server-side render of the public pages (dist-ssr, one self-contained Node module) for the `ssr` stage below.
RUN cd client && NODE_OPTIONS=--max-old-space-size=1792 npx vite build \
 && NODE_OPTIONS=--max-old-space-size=1792 npx vite build --ssr src/entry-server.tsx

# ---- SSR service (docker-compose.prod.yml `ssr`, target: ssr): renders the public pages' markup, which Caddy
# includes into index.html (client/ssr/server.mjs). React and the app are bundled: no node_modules here.
FROM node:22-bookworm-slim AS ssr
WORKDIR /app
ENV NODE_ENV=production PORT=4100 API_ORIGIN=http://api:4000
COPY --from=build --chown=root:node /app/client/dist-ssr ./dist-ssr
COPY --chown=root:node client/ssr/server.mjs ./ssr/server.mjs
USER node
EXPOSE 4100
CMD ["node", "ssr/server.mjs"]

# ---- the site (default target: the last stage) ----
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/client/dist /srv
