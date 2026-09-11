from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """환경변수는 모노레포 루트의 .env 를 공유한다."""

    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM 자격은 요청마다 caller 로 실려 온다. 서버는 키를 보관하지 않는다.
    ai_model: str = "claude-opus-5"

    database_url: str = "postgresql://postgres:postgres@localhost:54322/postgres"

    # apps/api 만 호출할 수 있게 막는 내부 토큰.
    internal_token: str = "dev-internal-token"

    # 임베딩 차원 — supabase 마이그레이션의 vector(N) 과 반드시 일치해야 한다.
    embedding_dim: int = 1536

    # 개인 이력이 이만큼 쌓이면 커뮤니티 통계 대신 개인 주기를 쓴다.
    personal_history_threshold: int = 3

    # Voyage AI 임베딩 키. 비우면 임베딩 없이 트라이그램 매칭만 쓴다.
    voyage_api_key: str = ""

    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
