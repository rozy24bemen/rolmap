# Minimal Dockerfile for BFF (GraphQL + REST)
FROM node:20-alpine AS base
WORKDIR /usr/src/app/apps/api

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
