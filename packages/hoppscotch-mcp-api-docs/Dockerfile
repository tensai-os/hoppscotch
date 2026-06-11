# Build from the Hoppscotch monorepo root:
#   docker build -f packages/hoppscotch-mcp-api-docs/Dockerfile .
#
# Requires: package.json, pnpm-lock.yaml, pnpm-workspace.yaml at repo root,
# and packages/hoppscotch-mcp-api-docs (this package).

FROM node:22-bookworm-slim AS builder
WORKDIR /repo

ENV CI=1
ENV HUSKY=0

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/hoppscotch-mcp-api-docs ./packages/hoppscotch-mcp-api-docs

RUN pnpm install --frozen-lockfile --filter hoppscotch-mcp-api-docs... --ignore-scripts
RUN pnpm --filter hoppscotch-mcp-api-docs run build
RUN pnpm --filter hoppscotch-mcp-api-docs deploy --prod --legacy /out

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /out/ /app/

RUN chown -R node:node /app

USER node

EXPOSE 8790

CMD ["node", "dist/index.js"]
