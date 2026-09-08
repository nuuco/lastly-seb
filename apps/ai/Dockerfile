# apps/ai 를 컨텍스트로 빌드한다:
#   docker build -t lastly-ai apps/ai

FROM python:3.12-slim AS builder

WORKDIR /app
ENV PIP_NO_CACHE_DIR=1

# 의존성 목록만 먼저 복사해 캐시를 살린다.
COPY pyproject.toml ./
COPY src ./src
RUN pip install --prefix=/install .


FROM python:3.12-slim AS runner

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY --from=builder /install /usr/local
COPY src ./src

# 루트 권한으로 돌리지 않는다.
RUN useradd --create-home --uid 1001 lastly
USER lastly

# 호스팅 서비스가 PORT를 주입한다. 값이 없을 때만 8000을 쓴다.
ENV PORT=8000
EXPOSE 8000

# $PORT를 읽어야 하므로 셸 형식으로 둔다.
CMD uvicorn lastly_ai.main:app --host 0.0.0.0 --port ${PORT:-8000}
