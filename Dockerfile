# syntax=docker/dockerfile:1.7
# Public image: nothing secret may be copied in here. All secrets (DATABASE_URL,
# JWT secrets, OAuth and payment keys) are injected at runtime by Dokploy.

ARG NODE_IMAGE=node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache openssl
ENV CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /app

# Full dependency tree for compiling TypeScript
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

# Production dependencies only (prisma CLI included for migrations)
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund && npx prisma generate && npm cache clean --force

FROM base AS runtime
RUN apk add --no-cache tini
ENV NODE_ENV=production \
    PORT=8080 \
    UPLOADS_DIR=/app/uploads
# Code stays root-owned and read-only for the app user; only uploads is writable
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
COPY prisma ./prisma
COPY --chmod=755 scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN mkdir -p /app/uploads && chown node:node /app/uploads

ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}
LABEL org.opencontainers.image.source="https://github.com/hamawebdev/backend"

USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/app/scripts/docker-entrypoint.sh"]
CMD ["node", "build/app.js"]
