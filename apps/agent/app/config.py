from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    port: int = Field(default=8000, validation_alias="AGENT_PORT")
    backend_origin: str = Field(
        default="http://localhost:3000", validation_alias="BACKEND_ORIGIN"
    )
    internal_service_token: str = Field(default="", validation_alias="INTERNAL_SERVICE_TOKEN")
    embedding_model: str = Field(default="BAAI/bge-small-zh-v1.5", validation_alias="EMBEDDING_MODEL")
    embedding_model_revision: str = Field(
        default="7999e1d3359715c523056ef9478215996d62a620",
        validation_alias="EMBEDDING_MODEL_REVISION",
    )

    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()

