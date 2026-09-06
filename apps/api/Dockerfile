# 모노레포 루트를 컨텍스트로 빌드한다: docker build -f apps/api/Dockerfile .
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile --filter @lastly/api...

COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
# '...' 를 붙여 의존 패키지(contracts)까지 함께 빌드한다.
RUN pnpm --filter @lastly/api... build

FROM node:20-slim AS runner

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/apps/api/package.json ./apps/api/

EXPOSE 4000
CMD ["node", "apps/api/dist/main"]
