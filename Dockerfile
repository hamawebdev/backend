# -----------------------------
# DEV STAGE
# -----------------------------
FROM node:22-alpine AS dev
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 8080

# Dev command
CMD ["npm", "run", "dev"]

# -----------------------------
# BUILD STAGE
# -----------------------------
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Generate Prisma client (required for TypeScript types)
RUN npx prisma generate

# Build the backend
RUN npm run build

# -----------------------------
# -----------------------------
# PRODUCTION STAGE
# -----------------------------
FROM node:22-alpine AS server
WORKDIR /app

# Copy build output
COPY --from=builder /app/build ./build

# Copy Prisma schema for runtime client generation
COPY --from=builder /app/prisma ./prisma

# Copy package.json to install production deps
COPY --from=builder /app/package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Generate Prisma client for runtime
RUN npx prisma generate

EXPOSE 8080

# Run migrations first, then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
