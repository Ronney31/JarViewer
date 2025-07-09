"""
Application configuration using Pydantic Settings
"""

from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )
    
    # Application
    ENVIRONMENT: str = Field(default="development", description="Environment")
    DEBUG: bool = Field(default=False, description="Debug mode")
    LOG_LEVEL: str = Field(default="INFO", description="Log level")
    
    # Security
    SECRET_KEY: str = Field(default="dev-secret-key-change-in-production", description="Secret key")
    CORS_ORIGINS: str = Field(default="http://localhost:3000", description="CORS origins (comma-separated)")
    ALLOWED_HOSTS: str = Field(default="localhost,127.0.0.1", description="Allowed hosts (comma-separated)")
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Convert CORS_ORIGINS string to list."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    @property
    def allowed_hosts_list(self) -> List[str]:
        """Convert ALLOWED_HOSTS string to list."""
        return [host.strip() for host in self.ALLOWED_HOSTS.split(",")]
    
    # File Processing
    MAX_FILE_SIZE: int = Field(default=500 * 1024 * 1024, description="Max file size in bytes (500MB)")
    MAX_EXTRACTION_SIZE: int = Field(default=1024 * 1024 * 1024, description="Max extraction size (1GB)")
    TEMP_DIR: str = Field(default="/tmp/jarviewer", description="Temporary directory")
    CLEANUP_INTERVAL: int = Field(default=3600, description="Cleanup interval in seconds")
    
    # Processing Limits
    MAX_CONCURRENT_OPERATIONS: int = Field(default=5, description="Max concurrent operations")
    EXTRACTION_TIMEOUT: int = Field(default=60, description="Extraction timeout in seconds")
    DECOMPILATION_TIMEOUT: int = Field(default=120, description="Decompilation timeout in seconds")
    MEMORY_LIMIT: str = Field(default="1GB", description="Memory limit")
    
    # CFR Decompiler
    CFR_JAR_PATH: str = Field(default="./lib/cfr-0.152.jar", description="CFR JAR path")
    CFR_OPTIONS: List[str] = Field(
        default=[
            "--silent", "true",
            "--recover", "true",
            "--removeboilerplate", "true",
            "--showversion", "false",
        ],
        description="CFR decompiler options"
    )
    
    # Monitoring
    ENABLE_METRICS: bool = Field(default=True, description="Enable Prometheus metrics")
    METRICS_PORT: int = Field(default=9090, description="Metrics port")
    
    # Caching (optional)
    REDIS_URL: str = Field(default="redis://localhost:6379", description="Redis URL")
    CACHE_TTL: int = Field(default=3600, description="Cache TTL in seconds")
    ENABLE_CACHE: bool = Field(default=False, description="Enable caching")


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
