from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    port: int = Field(default=8000, validation_alias="AGENT_PORT")
    backend_origin: str = Field(
        default="http://localhost:3000", validation_alias="BACKEND_ORIGIN"
    )
    internal_service_token: SecretStr = Field(default="", validation_alias="INTERNAL_SERVICE_TOKEN")
    deepseek_api_key: SecretStr = Field(default="", validation_alias="DEEPSEEK_API_KEY")
    deepseek_base_url: str = Field(default="https://api.deepseek.com", validation_alias="DEEPSEEK_BASE_URL")
    deepseek_model: str = Field(default="deepseek-flash", validation_alias="DEEPSEEK_MODEL")
    deepseek_allowed_models: str = Field(default="", validation_alias="DEEPSEEK_ALLOWED_MODELS")
    model_timeout: float = Field(default=60, gt=0, validation_alias="MODEL_TIMEOUT_SECONDS")
    run_timeout: float = Field(default=180, gt=0, validation_alias="RUN_TIMEOUT_SECONDS")
    context_token_limit: int = Field(default=32768, ge=1024, validation_alias="CONTEXT_TOKEN_LIMIT")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()

