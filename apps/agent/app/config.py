from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    port: int = Field(default=8000, validation_alias="AGENT_PORT")
    backend_origin: str = Field(
        default="http://localhost:3000", validation_alias="BACKEND_ORIGIN"
    )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()

