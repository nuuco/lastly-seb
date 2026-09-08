# 모노레포 루트를 컨텍스트로 빌드한다:
#   docker build -f apps/api/Dockerfile -t lastly-api .

FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# 의존성 목록만 먼저 복사해 캐시를 살린다. 소스가 바뀌어도 install을 다시 하지 않는다.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile --filter @lastly/api...

COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
# '...' 를 붙여 의존 패키지(contracts)까지 함께 빌드한다.
# contracts는 런타임 값(zod 스키마)이라 dist가 없으면 api가 실행 시 죽는다.
RUN pnpm --filter @lastly/api... build


# @supabase/supabase-js 는 네이티브 WebSocket 을 쓴다. Node 22 부터 들어갔으므로
# 20 에서는 SupabaseClient 를 만드는 순간 죽는다.
FROM node:22-slim AS runner

WORKDIR /repo
ENV NODE_ENV=production

# 빌드 결과를 통째로 옮긴다.
#
# node_modules 를 조각내어 옮기지 않는 이유: pnpm 은 apps/api/node_modules 안에
# ../../node_modules/.pnpm/... 을 가리키는 심볼릭 링크를 둔다. 디렉터리별로 나눠 복사하면
# 이 링크가 끊기고, 실행할 때 reflect-metadata 같은 모듈을 못 찾는다.
#
# pnpm prune --prod 도 쓰지 않는다. 워크스페이스 패키지의 node_modules 까지
# 비워버려 같은 증상을 만든다. 이미지가 조금 커지는 대신 확실히 뜬다.
COPY --from=builder --chown=node:node /repo /repo

USER node

# 호스팅 서비스가 PORT를 주입한다. 값이 없을 때만 4000을 쓴다.
ENV PORT=4000
EXPOSE 4000

CMD ["node", "apps/api/dist/main"]
