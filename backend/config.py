"""
MeetingMind Backend Configuration
Centralized configuration management using environment variables
"""

import os
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from functools import lru_cache

logger = logging.getLogger(__name__)


def get_env_bool(env_var: str, default: bool = False) -> bool:
    """Parse boolean environment variable"""
    value = os.getenv(env_var, '').lower()
    if value in ('true', '1', 'yes', 'on'):
        return True
    elif value in ('false', '0', 'no', 'off'):
        return False
    return default


def get_env_int(env_var: str, default: int) -> int:
    """Parse integer environment variable with fallback"""
    try:
        return int(os.getenv(env_var, str(default)))
    except (ValueError, TypeError):
        return default


def get_env_float(env_var: str, default: float) -> float:
    """Parse float environment variable with fallback"""
    try:
        return float(os.getenv(env_var, str(default)))
    except (ValueError, TypeError):
        return default


def get_env_list(env_var: str, default: List[str]) -> List[str]:
    """Parse comma-separated list environment variable"""
    value = os.getenv(env_var)
    if not value:
        return default
    return [item.strip() for item in value.split(',') if item.strip()]


@dataclass
class APIConfig:
    """API configuration settings"""
    host: str = os.getenv('API_HOST', '0.0.0.0')
    port: int = get_env_int('API_PORT', 8000)
    reload: bool = get_env_bool('API_RELOAD', False)
    workers: int = get_env_int('API_WORKERS', 1)
    timeout: int = get_env_int('API_TIMEOUT', 30)
    max_request_size: int = get_env_int('API_MAX_REQUEST_SIZE', 10485760)  # 10MB


@dataclass
class DatabaseConfig:
    """Database configuration settings"""
    url: str = os.getenv('DATABASE_URL', 'sqlite:///./meetingmind.db')
    max_connections: int = get_env_int('DB_MAX_CONNECTIONS', 20)
    connection_timeout: int = get_env_int('DB_CONNECTION_TIMEOUT', 30)
    query_timeout: int = get_env_int('DB_QUERY_TIMEOUT', 15)
    retry_attempts: int = get_env_int('DB_RETRY_ATTEMPTS', 3)
    echo: bool = get_env_bool('DB_ECHO', False)
    
    # Connection pool settings
    pool_size: int = get_env_int('DB_POOL_SIZE', 10)
    max_overflow: int = get_env_int('DB_MAX_OVERFLOW', 20)
    pool_timeout: int = get_env_int('DB_POOL_TIMEOUT', 30)
    pool_recycle: int = get_env_int('DB_POOL_RECYCLE', 3600)


@dataclass
class MeetingConfig:
    """Meeting configuration settings"""
    max_participants: int = get_env_int('MEETING_MAX_PARTICIPANTS', 50)
    max_duration_minutes: int = get_env_int('MEETING_MAX_DURATION', 480)  # 8 hours
    auto_save_interval: int = get_env_int('MEETING_AUTO_SAVE_INTERVAL', 30000)
    summary_generation_delay: int = get_env_int('MEETING_SUMMARY_DELAY', 5000)
    
    # Action item detection
    action_item_keywords: List[str] = get_env_list(
        'MEETING_ACTION_KEYWORDS',
        ['action item', 'todo', 'follow up', 'next step', 'assign', 'due date', 'deadline', 'responsible for']
    )
    
    # Meeting cleanup
    cleanup_old_meetings_days: int = get_env_int('MEETING_CLEANUP_DAYS', 365)
    archive_completed_meetings_days: int = get_env_int('MEETING_ARCHIVE_DAYS', 90)


@dataclass
class AudioConfig:
    """Audio processing configuration"""
    sample_rate: int = get_env_int('AUDIO_SAMPLE_RATE', 16000)
    channels: int = get_env_int('AUDIO_CHANNELS', 1)
    bit_depth: int = get_env_int('AUDIO_BIT_DEPTH', 16)
    chunk_size: int = get_env_int('AUDIO_CHUNK_SIZE', 4096)
    max_recording_duration: int = get_env_int('AUDIO_MAX_RECORDING_DURATION', 10800000)  # 3 hours
    
    # Audio processing
    silence_threshold: float = get_env_float('AUDIO_SILENCE_THRESHOLD', 0.01)
    silence_duration: int = get_env_int('AUDIO_SILENCE_DURATION', 2000)
    
    # File formats
    supported_formats: List[str] = get_env_list(
        'AUDIO_SUPPORTED_FORMATS',
        ['wav', 'mp3', 'mp4', 'm4a', 'webm', 'ogg']
    )
    
    # Quality settings
    quality: str = os.getenv('AUDIO_QUALITY', 'standard')  # standard, high, ultra
    noise_reduction: bool = get_env_bool('AUDIO_NOISE_REDUCTION', True)


@dataclass
class AIConfig:
    """AI and ML configuration"""
    # Transcription
    min_transcription_length: int = get_env_int('AI_MIN_TRANSCRIPTION_LENGTH', 50)
    transcription_language: str = os.getenv('AI_TRANSCRIPTION_LANGUAGE', 'en')
    
    # Analysis intervals
    summary_update_interval: int = get_env_int('AI_SUMMARY_UPDATE_INTERVAL', 60000)
    sentiment_analysis_window: int = get_env_int('AI_SENTIMENT_WINDOW', 300000)
    
    # Confidence thresholds
    action_item_confidence: float = get_env_float('AI_ACTION_CONFIDENCE', 0.7)
    speaker_identification_threshold: float = get_env_float('AI_SPEAKER_THRESHOLD', 0.8)
    sentiment_confidence: float = get_env_float('AI_SENTIMENT_CONFIDENCE', 0.6)
    
    # Model settings
    model_cache_size: int = get_env_int('AI_MODEL_CACHE_SIZE', 100)
    model_timeout: int = get_env_int('AI_MODEL_TIMEOUT', 30)
    
    # External AI services
    openai_api_key: Optional[str] = os.getenv('OPENAI_API_KEY')
    assemblyai_api_key: Optional[str] = os.getenv('ASSEMBLYAI_API_KEY')
    azure_speech_key: Optional[str] = os.getenv('AZURE_SPEECH_KEY')
    azure_speech_region: Optional[str] = os.getenv('AZURE_SPEECH_REGION')


@dataclass
class SecurityConfig:
    """Security and authentication configuration"""
    # JWT settings
    jwt_secret_key: str = os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
    jwt_algorithm: str = os.getenv('JWT_ALGORITHM', 'HS256')
    jwt_expiry_seconds: int = get_env_int('SECURITY_JWT_EXPIRY', 3600)  # 1 hour
    refresh_token_expiry: int = get_env_int('SECURITY_REFRESH_EXPIRY', 604800)  # 7 days
    
    # Password requirements
    password_min_length: int = get_env_int('SECURITY_PASSWORD_MIN_LENGTH', 8)
    password_require_uppercase: bool = get_env_bool('SECURITY_PASSWORD_UPPERCASE', True)
    password_require_lowercase: bool = get_env_bool('SECURITY_PASSWORD_LOWERCASE', True)
    password_require_numbers: bool = get_env_bool('SECURITY_PASSWORD_NUMBERS', True)
    password_require_symbols: bool = get_env_bool('SECURITY_PASSWORD_SYMBOLS', False)
    
    # Rate limiting
    auth_rate_limit: int = get_env_int('SECURITY_AUTH_RATE_REQUESTS', 5)
    auth_rate_window: int = get_env_int('SECURITY_AUTH_RATE_WINDOW', 900)  # 15 minutes
    api_rate_limit: int = get_env_int('SECURITY_API_RATE_REQUESTS', 100)
    api_rate_window: int = get_env_int('SECURITY_API_RATE_WINDOW', 60)  # 1 minute
    upload_rate_limit: int = get_env_int('SECURITY_UPLOAD_RATE_REQUESTS', 10)
    upload_rate_window: int = get_env_int('SECURITY_UPLOAD_RATE_WINDOW', 60)  # 1 minute
    
    # CORS settings
    cors_origins: List[str] = get_env_list('CORS_ORIGINS', ['http://localhost:3000'])
    cors_allow_credentials: bool = get_env_bool('CORS_ALLOW_CREDENTIALS', True)
    
    # Session security
    secure_cookies: bool = get_env_bool('SECURITY_SECURE_COOKIES', False)
    samesite_cookies: str = os.getenv('SECURITY_SAMESITE_COOKIES', 'lax')


@dataclass
class RedisConfig:
    """Redis configuration for caching and sessions"""
    url: str = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    max_connections: int = get_env_int('REDIS_MAX_CONNECTIONS', 20)
    connection_timeout: int = get_env_int('REDIS_CONNECTION_TIMEOUT', 5)
    
    # Cache settings
    default_cache_ttl: int = get_env_int('REDIS_DEFAULT_TTL', 3600)  # 1 hour
    session_ttl: int = get_env_int('REDIS_SESSION_TTL', 86400)  # 24 hours
    
    # Key prefixes
    cache_prefix: str = os.getenv('REDIS_CACHE_PREFIX', 'meetingmind:cache:')
    session_prefix: str = os.getenv('REDIS_SESSION_PREFIX', 'meetingmind:session:')


@dataclass
class LoggingConfig:
    """Logging configuration"""
    level: str = os.getenv('LOG_LEVEL', 'INFO')
    format: str = os.getenv('LOG_FORMAT', '%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    # File logging
    log_to_file: bool = get_env_bool('LOG_TO_FILE', False)
    log_file_path: str = os.getenv('LOG_FILE_PATH', 'meetingmind.log')
    log_file_max_size: int = get_env_int('LOG_FILE_MAX_SIZE', 10485760)  # 10MB
    log_file_backup_count: int = get_env_int('LOG_FILE_BACKUP_COUNT', 5)
    
    # Structured logging
    structured_logging: bool = get_env_bool('LOG_STRUCTURED', False)
    log_request_body: bool = get_env_bool('LOG_REQUEST_BODY', False)
    log_response_body: bool = get_env_bool('LOG_RESPONSE_BODY', False)


@dataclass
class FeatureFlags:
    """Feature flags for enabling/disabling functionality"""
    ai_insights: bool = get_env_bool('FEATURE_AI_INSIGHTS', True)
    real_time_transcription: bool = get_env_bool('FEATURE_REAL_TIME_TRANSCRIPTION', True)
    sentiment_analysis: bool = get_env_bool('FEATURE_SENTIMENT_ANALYSIS', True)
    action_item_detection: bool = get_env_bool('FEATURE_ACTION_ITEM_DETECTION', True)
    speaker_identification: bool = get_env_bool('FEATURE_SPEAKER_IDENTIFICATION', False)
    meeting_analytics: bool = get_env_bool('FEATURE_MEETING_ANALYTICS', True)
    calendar_integration: bool = get_env_bool('FEATURE_CALENDAR_INTEGRATION', False)
    multi_language_support: bool = get_env_bool('FEATURE_MULTI_LANGUAGE_SUPPORT', False)
    
    # Experimental features
    advanced_ai_insights: bool = get_env_bool('FEATURE_ADVANCED_AI_INSIGHTS', False)
    meeting_summaries: bool = get_env_bool('FEATURE_MEETING_SUMMARIES', True)
    export_functionality: bool = get_env_bool('FEATURE_EXPORT_FUNCTIONALITY', True)
    integrations: bool = get_env_bool('FEATURE_INTEGRATIONS', False)


@dataclass
class MonitoringConfig:
    """Monitoring and observability configuration"""
    # Metrics
    enable_metrics: bool = get_env_bool('MONITORING_ENABLE_METRICS', True)
    metrics_port: int = get_env_int('MONITORING_METRICS_PORT', 8001)
    
    # Health checks
    health_check_interval: int = get_env_int('MONITORING_HEALTH_CHECK_INTERVAL', 30)
    
    # Performance monitoring
    enable_performance_tracking: bool = get_env_bool('MONITORING_ENABLE_PERFORMANCE', True)
    slow_query_threshold: float = get_env_float('MONITORING_SLOW_QUERY_THRESHOLD', 1.0)
    
    # External monitoring
    sentry_dsn: Optional[str] = os.getenv('SENTRY_DSN')
    datadog_api_key: Optional[str] = os.getenv('DATADOG_API_KEY')


@dataclass
class Config:
    """Main configuration class combining all settings"""
    # Environment
    environment: str = os.getenv('ENVIRONMENT', 'development')
    debug: bool = get_env_bool('DEBUG', False)
    testing: bool = get_env_bool('TESTING', False)
    
    # Component configurations
    api: APIConfig = APIConfig()
    database: DatabaseConfig = DatabaseConfig()
    meeting: MeetingConfig = MeetingConfig()
    audio: AudioConfig = AudioConfig()
    ai: AIConfig = AIConfig()
    security: SecurityConfig = SecurityConfig()
    redis: RedisConfig = RedisConfig()
    logging: LoggingConfig = LoggingConfig()
    features: FeatureFlags = FeatureFlags()
    monitoring: MonitoringConfig = MonitoringConfig()
    
    def __post_init__(self):
        """Validate configuration after initialization"""
        self._validate_config()
    
    def _validate_config(self):
        """Validate configuration values"""
        # Validate required settings in production
        if self.environment == 'production':
            if self.security.jwt_secret_key == 'your-secret-key-change-in-production':
                raise ValueError("JWT_SECRET_KEY must be set in production")
            
            if not self.security.secure_cookies:
                logger.warning("Secure cookies disabled in production - this is a security risk")
        
        # Validate meeting limits
        if self.meeting.max_participants <= 0:
            raise ValueError("MEETING_MAX_PARTICIPANTS must be positive")
        
        if self.meeting.max_duration_minutes <= 0:
            raise ValueError("MEETING_MAX_DURATION must be positive")
        
        # Validate audio settings
        if self.audio.sample_rate not in [8000, 16000, 22050, 44100, 48000]:
            print(f"WARNING: Unusual audio sample rate: {self.audio.sample_rate}")
        
        # Validate AI thresholds
        if not 0 <= self.ai.action_item_confidence <= 1:
            raise ValueError("AI_ACTION_CONFIDENCE must be between 0 and 1")
        
        if not 0 <= self.ai.speaker_identification_threshold <= 1:
            raise ValueError("AI_SPEAKER_THRESHOLD must be between 0 and 1")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary for debugging"""
        def convert_value(value: Any) -> Any:
            """
            Recursively convert configuration objects to basic Python types.
            
            This function handles nested configuration objects by converting:
            - Objects with __dict__ to dictionaries
            - Lists by converting each item recursively
            - Other values are returned as-is
            
            Args:
                value: The value to convert (object, list, or primitive)
                
            Returns:
                Any: Converted value as basic Python type (dict, list, or primitive)
            """
            if hasattr(value, '__dict__'):
                return {k: convert_value(v) for k, v in value.__dict__.items()}
            elif isinstance(value, list):
                return [convert_value(item) for item in value]
            else:
                return value
        
        return convert_value(self)
    
    def is_production(self) -> bool:
        """Check if running in production environment"""
        return self.environment.lower() == 'production'
    
    def is_development(self) -> bool:
        """Check if running in development environment"""
        return self.environment.lower() == 'development'
    
    def is_testing(self) -> bool:
        """Check if running in testing environment"""
        return self.testing or self.environment.lower() == 'testing'


@lru_cache()
def get_config() -> Config:
    """Get cached configuration instance"""
    return Config()


# Export commonly used configurations
config = get_config()
api_config = config.api
db_config = config.database
meeting_config = config.meeting
audio_config = config.audio
ai_config = config.ai
security_config = config.security
features = config.features


# Configuration validation on import
if __name__ == '__main__':
    # Print current configuration for debugging
    import json
    print("Current Configuration:")
    print(json.dumps(config.to_dict(), indent=2, default=str))