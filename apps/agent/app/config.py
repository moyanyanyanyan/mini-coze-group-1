from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    port: int = Field(default=8000, validation_alias="AGENT_PORT")
    backend_origin: str = Field(
        default="http://localhost:3000", validation_alias="BACKEND_ORIGIN"
    )
    internal_service_token: SecretStr = Field(default="", validation_alias="INTERNAL_SERVICE_TOKEN")
    embedding_model: str = Field(default="BAAI/bge-small-zh-v1.5", validation_alias="EMBEDDING_MODEL")
    embedding_model_revision: str = Field(
        default="7999e1d3359715c523056ef9478215996d62a620",
        validation_alias="EMBEDDING_MODEL_REVISION",
    )
    deepseek_api_key: SecretStr = Field(default="", validation_alias="DEEPSEEK_API_KEY")
    deepseek_base_url: str = Field(default="https://api.deepseek.com", validation_alias="DEEPSEEK_BASE_URL")
    deepseek_model: str = Field(default="deepseek-flash", validation_alias="DEEPSEEK_MODEL")
    deepseek_allowed_models: str = Field(default="deepseek-chat", validation_alias="DEEPSEEK_ALLOWED_MODELS")
    model_timeout: float = Field(default=60, gt=0, validation_alias="MODEL_TIMEOUT_SECONDS")
    run_timeout: float = Field(default=180, gt=0, validation_alias="RUN_TIMEOUT_SECONDS")
    context_token_limit: int = Field(default=32768, ge=1024, validation_alias="CONTEXT_TOKEN_LIMIT")

    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()

