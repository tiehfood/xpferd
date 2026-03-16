FROM node:22-alpine AS base
RUN apk add --no-cache python3 make g++
RUN corepack enable
WORKDIR /app

ARG VERSION=dev
ENV VERSION=${VERSION}

# Install all dependencies (including devDeps for build)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build client and server
RUN node build-client.js
RUN npx tsc -p tsconfig.server.json

# Prune to production deps (native addons already compiled)
RUN CI=true pnpm prune --prod

# Production stage
FROM node:22-alpine AS production
RUN apk add --no-cache tini
WORKDIR /app

COPY --from=base /app/package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server/index.js"]
