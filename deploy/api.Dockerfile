# ---- build: compile the API ------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
# Prisma picks its query engine by the openssl it finds at generate time — must match the runtime (openssl 3).
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
# Only the server workspace: the site's toolchain (vite, esbuild, three…) never enters this image.
RUN npm ci --workspace server --include=dev --no-audit --no-fund
# Passport OCR language data (~3 MB): fetched at build time so the API never downloads at runtime.
# Copied before the source so the layer stays cached across deploys.
COPY server/scripts/fetch-ocr-data.mjs server/scripts/
RUN node server/scripts/fetch-ocr-data.mjs
COPY server ./server
# The production server has 2 GB RAM: a full `tsc` run (Prisma's generated types included) needs ~2.5 GB, so
# the image transpiles with esbuild instead (scripts/build-prod.mjs, file by file, little memory). Types are
# checked in CI (npm run typecheck) before every deploy. esbuild comes with the dev tooling (vite).
RUN npx prisma generate --schema server/prisma/schema.prisma \
 && node server/scripts/build-prod.mjs \
 && npm uninstall --workspace server vitest @vitest/coverage-v8 supertest @types/supertest --no-audit --no-fund \
 && rm -rf node_modules/vite node_modules/vitest node_modules/@vitest node_modules/rollup node_modules/@rollup
# ^ test tooling never runs in production; dropping it removes vite and its bundled esbuild binary
#   (npm leaves vite behind as "extraneous" after the uninstall, hence the explicit removal).

# ---- runtime -----------------------------------------------------------------------------------
FROM node:22-bookworm-slim
# Security patches for the Debian base, plus the few tools the API needs (openssl for Prisma, curl for
# the health check). npm is updated too: the copy bundled with Node lags behind on its own CVE fixes.
RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g npm@latest --no-audit --no-fund \
 && npm cache clean --force
WORKDIR /app
ENV NODE_ENV=production
# Prisma CLI and tsx stay installed: migrations run on start and the deploy runs the (idempotent) seed.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
# root owns the code (the app cannot modify it); group `node` may read it. The server's umask (027) unpacks
# the source as root-only, so without the group the API user could not even read its own Prisma schema.
COPY --from=build --chown=root:node /app/server ./server
WORKDIR /app/server
RUN mkdir -p /data/uploads/private /data/uploads/public /data/docs \
 && chown -R node:node /data
ENV UPLOADS_DIR=/data/uploads DOCS_DIR=/data/docs PORT=4000 NPM_CONFIG_UPDATE_NOTIFIER=false
# Never run the API as root: a bug in the app must not mean root inside the container.
USER node
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
