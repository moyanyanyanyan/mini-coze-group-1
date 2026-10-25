from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


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
    model_provider: Literal["deepseek", "siliconflow", "openai_compatible"] | None = Field(default=None, validation_alias="MODEL_PROVIDER")
    model_trust_env: bool = Field(default=True, validation_alias="MODEL_TRUST_ENV")
    backend_service_url: str = Field(default="http://localhost:3000", validation_alias="BACKEND_SERVICE_URL")
    plugins_service_token: SecretStr = Field(default="", validation_alias="PLUGINS_SERVICE_TOKEN")
    provider_timeout: float = Field(default=15, gt=0, validation_alias="PROVIDER_TIMEOUT_SECONDS")
    model_timeout: float = Field(default=60, gt=0, validation_alias="MODEL_TIMEOUT_SECONDS")
    run_timeout: float = Field(default=180, gt=0, validation_alias="RUN_TIMEOUT_SECONDS")
    context_token_limit: int = Field(default=32768, ge=1024, validation_alias="CONTEXT_TOKEN_LIMIT")

    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, extra="ignore")

    @property
    def effective_model_provider(self) -> str:
        if self.model_provider:
            return self.model_provider
        host = urlsplit(self.deepseek_base_url).hostname
        if host in {"api.siliconflow.cn", "api.siliconflow.com"}:
            return "siliconflow"
        if host == "api.deepseek.com":
            return "deepseek"
        return "openai_compatible"


@lru_cache
def get_settings() -> Settings:
    return Settings()

