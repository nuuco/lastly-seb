FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONPATH=/app/src

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e . || pip install --no-cache-dir \
    fastapi uvicorn[standard] pydantic pydantic-settings anthropic asyncpg numpy httpx structlog

COPY src ./src

EXPOSE 8000
CMD ["uvicorn", "lastly_ai.main:app", "--host", "0.0.0.0", "--port", "8000"]
