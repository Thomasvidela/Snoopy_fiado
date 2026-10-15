from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Despensa Snoopy - Libreta de Fiados"
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/fiados"
    JWT_SECRET: str = "fiados_super_secret_jwt_key_2026_change_in_production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 129600  # 90 días para operadores móviles
    STATIC_DIR: Optional[str] = None
    ENVIRONMENT: str = "production"
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_MINUTES: int = 15
    STORE_ACCESS_KEY: Optional[str] = None
    CORS_ORIGINS: List[str] = ["*"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
