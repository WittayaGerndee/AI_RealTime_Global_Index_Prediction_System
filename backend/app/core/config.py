from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Real-Time Global Index Prediction System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "super_secret_development_key_change_in_production"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres_secure_password@localhost:5432/global_index_ai"
    SYNC_DATABASE_URL: Optional[str] = "postgresql://postgres:postgres_secure_password@localhost:5432/global_index_ai"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Market Data
    MARKET_DATA_PROVIDER: str = "mock_replay" # twelve_data, itick, mock_replay
    TWELVE_DATA_API_KEY: Optional[str] = ""
    ITICK_API_KEY: Optional[str] = ""
    PREDICTION_INTERVAL_SECONDS: int = 5
    MOCK_REPLAY_SPEED: float = 1.0

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
