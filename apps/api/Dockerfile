# Minimal Dockerfile for BFF (GraphQL + REST)
# Switch to Debian-based image to ensure compatible OpenSSL for Prisma engines
FROM node:20-bookworm-slim AS base
WORKDIR /usr/src/app/apps/api

# Install system dependencies (OpenSSL for Prisma engines)
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
	   openssl \
	   ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Install deps
COPY apps/api/package*.json ./
RUN npm ci

# Build sim-core first
WORKDIR /usr/src/app/services/sim-core
COPY services/sim-core/package*.json ./
RUN npm ci
COPY services/sim-core/tsconfig.json ./
COPY services/sim-core/src ./src
RUN npm run build

# Back to API workdir
WORKDIR /usr/src/app/apps/api
# Copy sources
COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src
# Copy tests and vitest config for CI runs
COPY apps/api/tests ./tests
COPY apps/api/vitest.config.ts ./vitest.config.ts
# Copy GraphQL schema used at runtime
RUN mkdir -p /usr/src/app/packages/schema/graphql
COPY packages/schema/graphql/schema.graphql /usr/src/app/packages/schema/graphql/schema.graphql
 # Copy prisma schema and generate client
COPY apps/api/prisma ./prisma
RUN npx prisma generate

# Build
RUN npm run build

EXPOSE 4000
CMD ["node", "dist/index.js"]
