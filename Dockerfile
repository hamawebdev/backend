# -----------------------------
# BUILD STAGE
# -----------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Install build dependencies for Prisma/Node
RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
RUN npm install

# Copy source and prisma schema
COPY . .

# Generate Prisma client for build-time types
RUN npx prisma generate

# Build the project (assumes output goes to /build)
RUN npm run build

# -----------------------------
# PRODUCTION STAGE
# -----------------------------
FROM node:22-alpine AS server
WORKDIR /app

# 1. Install required system libraries for Prisma runtime
RUN apk add --no-cache openssl libc6-compat

# 2. Copy only what is needed from the builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

# 3. Install production-only dependencies
RUN npm install --omit=dev

# 4. Re-generate Prisma client for the production environment
RUN npx prisma generate

# 5. Expose the port defined in your .env
EXPOSE 8080

# 6. Run db push to sync schema to Postgres, then start the app
# Using 'node build/app.js' directly is more reliable than 'npm run' in Docker
CMD ["sh", "-c", "npx prisma db push && node build/app.js"]