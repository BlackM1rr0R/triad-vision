# Triad Vision API — build context is the repository root (npm workspaces).
FROM node:22-bookworm-slim

# Prisma's query engine needs OpenSSL; curl is used by the compose healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# Install with the lockfile first so this layer is cached between code changes.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
# Dev dependencies stay: the image runs `prisma migrate deploy` (prisma CLI) and the seed (tsx).
RUN npm ci --include=dev --no-audit --no-fund

COPY server ./server
RUN npx prisma generate --schema server/prisma/schema.prisma \
 && npm run build -w server

WORKDIR /app/server
# Uploaded files live on volumes mounted here (see docker-compose.prod.yml).
RUN mkdir -p /data/uploads/private /data/uploads/public /data/docs
ENV UPLOADS_DIR=/data/uploads DOCS_DIR=/data/docs PORT=4000
EXPOSE 4000

# Apply pending migrations on every start, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
