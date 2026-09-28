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

# Commit being built, for /health: the GIT_SHA build arg (CI), otherwise read from
# the build context's .git (Dokploy builds from a clone and passes no build args).
# .dockerignore lets in only .git/HEAD, .git/refs/heads/ and .git/packed-refs (commit
# ids and ref names, no credentials), and they are only bind-mounted here: nothing
# from .git is copied into an image layer, only the resulting /version file.
FROM ${NODE_IMAGE} AS version
ARG GIT_SHA
RUN --mount=type=bind,target=/ctx \
    sha="${GIT_SHA:-}"; \
    if [ -z "$sha" ] || [ "$sha" = "unknown" ]; then \
      sha=""; \
      if [ -f /ctx/.git/HEAD ]; then \
        head="$(head -n 1 /ctx/.git/HEAD)"; \
        case "$head" in \
          "ref: "*) \
            ref="${head#ref: }"; \
            if [ -f "/ctx/.git/$ref" ]; then \
              sha="$(head -n 1 "/ctx/.git/$ref")"; \
            elif [ -f /ctx/.git/packed-refs ]; then \
              sha="$(grep -v '^[#^]' /ctx/.git/packed-refs | awk -v ref="$ref" '$2 == ref { print $1; exit }')"; \
            fi ;; \
          *) sha="$head" ;; \
        esac; \
      fi; \
    fi; \
    printf '%s' "$sha" | grep -Eq '^[0-9a-f]{40}([0-9a-f]{24})?$' || sha=unknown; \
    echo "$sha" > /version; \
    echo "Building commit $sha"

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

# The entrypoint exports GIT_SHA from this file unless the environment sets one
COPY --from=version /version /app/.git-sha
LABEL org.opencontainers.image.source="https://github.com/hamawebdev/backend"

USER node
EXPOSE 8080
# busybox wget starts instantly (a node process can take seconds on a loaded host);
# the start period covers migrations, which run before the server listens
HEALTHCHECK --interval=15s --timeout=10s --start-period=300s --retries=3 \
  CMD wget -q -O /dev/null -T 8 "http://127.0.0.1:${PORT:-8080}/api/v1/health" || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/app/scripts/docker-entrypoint.sh"]
CMD ["node", "build/app.js"]
