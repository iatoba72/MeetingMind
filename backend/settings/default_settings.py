# Default Settings Definitions
# Define all MeetingMind settings with validation and metadata

from typing import List
from .settings_models import (
    SettingsDefinition, SettingsValidationRule, SettingsType, 
    SettingsCategory, SettingsScope, settings_registry
)

def register_default_settings():
    """Register all default MeetingMind settings"""
    
    # Appearance Settings
    settings_registry.register(SettingsDefinition(
        key="theme",
        name="Theme",
        description="Application color theme",
        type=SettingsType.ENUM,
        category=SettingsCategory.APPEARANCE,
        scope=SettingsScope.USER,
        default_value="light",
        validation_rules=[
            SettingsValidationRule("in", {"values": ["light", "dark", "auto"]}, "Theme must be light, dark, or auto")
        ],
        ui_component="select",
        ui_props={"options": [
            {"value": "light", "label": "Light"},
            {"value": "dark", "label": "Dark"}, 
            {"value": "auto", "label": "Auto (System)"}
        ]},
        help_text="Choose the color theme for the application",
        hot_reload=True
    ))
    
    settings_registry.register(SettingsDefinition(
        key="font_size",
        name="Font Size",
        description="Base font size for the application",
        type=SettingsType.INTEGER,
        category=SettingsCategory.APPEARANCE,
        scope=SettingsScope.USER,
        default_value=14,
        validation_rules=[
            SettingsValidationRule("min_value", {"min": 10}, "Font size must be at least 10px"),
            SettingsValidationRule("max_value", {"max": 24}, "Font size must be at most 24px")
        ],
        ui_component="slider",
        ui_props={"min": 10, "max": 24, "step": 1, "suffix": "px"},
        help_text="Adjust the base font size for better readability",
        hot_reload=True
    ))
    
    settings_registry.register(SettingsDefinition(
        key="sidebar_width",
        name="Sidebar Width",
        description="Width of the application sidebar",
        type=SettingsType.INTEGER,
        category=SettingsCategory.APPEARANCE,
        scope=SettingsScope.USER,
        default_value=280,
        validation_rules=[
            SettingsValidationRule("min_value", {"min": 200}, "Sidebar width must be at least 200px"),
            SettingsValidationRule("max_value", {"max": 500}, "Sidebar width must be at most 500px")
        ],
        ui_component="slider",
        ui_props={"min": 200, "max": 500, "step": 10, "suffix": "px"},
        hot_reload=True
    ))
    
    settings_registry.register(SettingsDefinition(
        key="compact_mode",
        name="Compact Mode",
        description="Enable compact interface mode",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.APPEARANCE,
        scope=SettingsScope.USER,
        default_value=False,
        ui_component="toggle",
        help_text="Reduce spacing and padding for a more compact interface",
        hot_reload=True
    ))
    
    # Collaboration Settings
    settings_registry.register(SettingsDefinition(
        key="auto_save_interval",
        name="Auto-save Interval",
        description="Automatic save interval in seconds",
        type=SettingsType.INTEGER,
        category=SettingsCategory.COLLABORATION,
        scope=SettingsScope.TEAM,
        default_value=30,
        validation_rules=[
            SettingsValidationRule("min_value", {"min": 5}, "Auto-save interval must be at least 5 seconds"),
            SettingsValidationRule("max_value", {"max": 300}, "Auto-save interval must be at most 5 minutes")
        ],
        ui_component="select",
        ui_props={"options": [
            {"value": 5, "label": "5 seconds"},
            {"value": 15, "label": "15 seconds"},
            {"value": 30, "label": "30 seconds"},
            {"value": 60, "label": "1 minute"},
            {"value": 120, "label": "2 minutes"},
            {"value": 300, "label": "5 minutes"}
        ]},
        help_text="How often to automatically save changes"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="show_cursors",
        name="Show User Cursors",
        description="Display other users' cursors in real-time",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.COLLABORATION,
        scope=SettingsScope.USER,
        default_value=True,
        ui_component="toggle",
        help_text="Show colored cursors of other users during collaboration",
        hot_reload=True
    ))
    
    settings_registry.register(SettingsDefinition(
        key="show_selections",
        name="Show User Selections",
        description="Display other users' text selections",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.COLLABORATION,
        scope=SettingsScope.USER,
        default_value=True,
        ui_component="toggle",
        help_text="Highlight text selections made by other users",
        hot_reload=True
    ))
    
    settings_registry.register(SettingsDefinition(
        key="typing_indicator_timeout",
        name="Typing Indicator Timeout",
        description="How long to show typing indicators (seconds)",
        type=SettingsType.INTEGER,
        category=SettingsCategory.COLLABORATION,
        scope=SettingsScope.GLOBAL,
        default_value=3,
        validation_rules=[
            SettingsValidationRule("min_value", {"min": 1}, "Timeout must be at least 1 second"),
            SettingsValidationRule("max_value", {"max": 10}, "Timeout must be at most 10 seconds")
        ],
        ui_component="slider",
        ui_props={"min": 1, "max": 10, "step": 1, "suffix": "s"}
    ))
    
    # Notifications Settings
    settings_registry.register(SettingsDefinition(
        key="desktop_notifications",
        name="Desktop Notifications",
        description="Enable desktop notifications",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.NOTIFICATIONS,
        scope=SettingsScope.USER,
        default_value=True,
        ui_component="toggle",
        help_text="Show notifications in your system's notification area"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="email_notifications",
        name="Email Notifications",
        description="Enable email notifications",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.NOTIFICATIONS,
        scope=SettingsScope.USER,
        default_value=True,
        ui_component="toggle",
        help_text="Receive notifications via email"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="notification_sound",
        name="Notification Sound",
        description="Play sound for notifications",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.NOTIFICATIONS,
        scope=SettingsScope.USER,
        default_value=True,
        ui_component="toggle",
        help_text="Play a sound when notifications appear"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="notification_frequency",
        name="Notification Frequency",
        description="How often to send digest notifications",
        type=SettingsType.ENUM,
        category=SettingsCategory.NOTIFICATIONS,
        scope=SettingsScope.USER,
        default_value="daily",
        validation_rules=[
            SettingsValidationRule("in", {"values": ["immediate", "hourly", "daily", "weekly", "never"]})
        ],
        ui_component="select",
        ui_props={"options": [
            {"value": "immediate", "label": "Immediate"},
            {"value": "hourly", "label": "Hourly digest"},
            {"value": "daily", "label": "Daily digest"},
            {"value": "weekly", "label": "Weekly digest"},
            {"value": "never", "label": "Never"}
        ]}
    ))
    
    # Audio/Video Settings
    settings_registry.register(SettingsDefinition(
        key="default_microphone",
        name="Default Microphone",
        description="Default microphone device",
        type=SettingsType.STRING,
        category=SettingsCategory.AUDIO_VIDEO,
        scope=SettingsScope.USER,
        default_value="default",
        ui_component="device_select",
        ui_props={"device_type": "microphone"},
        help_text="Select your preferred microphone for meetings"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="default_camera",
        name="Default Camera",
        description="Default camera device",
        type=SettingsType.STRING,
        category=SettingsCategory.AUDIO_VIDEO,
        scope=SettingsScope.USER,
        default_value="default",
        ui_component="device_select",
        ui_props={"device_type": "camera"},
        help_text="Select your preferred camera for meetings"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="auto_mute_on_join",
        name="Auto-mute on Join",
        description="Automatically mute microphone when joining meetings",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.AUDIO_VIDEO,
        scope=SettingsScope.USER,
        default_value=True,
        ui_component="toggle",
        help_text="Start meetings with microphone muted to avoid background noise"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="video_quality",
        name="Video Quality",
        description="Default video quality setting",
        type=SettingsType.ENUM,
        category=SettingsCategory.AUDIO_VIDEO,
        scope=SettingsScope.USER,
        default_value="auto",
        validation_rules=[
            SettingsValidationRule("in", {"values": ["low", "medium", "high", "auto"]})
        ],
        ui_component="select",
        ui_props={"options": [
            {"value": "low", "label": "Low (360p)"},
            {"value": "medium", "label": "Medium (720p)"},
            {"value": "high", "label": "High (1080p)"},
            {"value": "auto", "label": "Auto"}
        ]},
        help_text="Choose video quality (higher quality uses more bandwidth)"
    ))
    
    # Recording Settings
    settings_registry.register(SettingsDefinition(
        key="auto_record_meetings",
        name="Auto-record Meetings",
        description="Automatically record all meetings",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.RECORDING,
        scope=SettingsScope.TEAM,
        default_value=False,
        ui_component="toggle",
        help_text="Automatically start recording when meetings begin",
        requires_restart=False
    ))
    
    settings_registry.register(SettingsDefinition(
        key="recording_quality",
        name="Recording Quality",
        description="Quality setting for meeting recordings",
        type=SettingsType.ENUM,
        category=SettingsCategory.RECORDING,
        scope=SettingsScope.ORGANIZATION,
        default_value="high",
        validation_rules=[
            SettingsValidationRule("in", {"values": ["low", "medium", "high"]})
        ],
        ui_component="select",
        ui_props={"options": [
            {"value": "low", "label": "Low (saves storage)"},
            {"value": "medium", "label": "Medium (balanced)"},
            {"value": "high", "label": "High (best quality)"}
        ]}
    ))
    
    settings_registry.register(SettingsDefinition(
        key="recording_storage_limit",
        name="Recording Storage Limit",
        description="Maximum storage per user in GB",
        type=SettingsType.INTEGER,
        category=SettingsCategory.RECORDING,
        scope=SettingsScope.ORGANIZATION,
        default_value=10,
        validation_rules=[
            SettingsValidationRule("min_value", {"min": 1}, "Storage limit must be at least 1GB"),
            SettingsValidationRule("max_value", {"max": 1000}, "Storage limit must be at most 1000GB")
        ],
        ui_component="input",
        ui_props={"type": "number", "suffix": "GB"},
        help_text="Maximum recording storage allowed per user"
    ))
    
    # Transcription Settings
    settings_registry.register(SettingsDefinition(
        key="auto_transcribe",
        name="Auto-transcribe Meetings",
        description="Automatically transcribe meeting audio",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.TRANSCRIPTION,
        scope=SettingsScope.TEAM,
        default_value=True,
        ui_component="toggle",
        help_text="Generate text transcripts during meetings"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="transcription_language",
        name="Transcription Language",
        description="Default language for transcription",
        type=SettingsType.ENUM,
        category=SettingsCategory.TRANSCRIPTION,
        scope=SettingsScope.USER,
        default_value="en-US",
        validation_rules=[
            SettingsValidationRule("in", {"values": ["en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "ja-JP", "zh-CN"]})
        ],
        ui_component="select",
        ui_props={"options": [
            {"value": "en-US", "label": "English (US)"},
            {"value": "en-GB", "label": "English (UK)"},
            {"value": "es-ES", "label": "Spanish"},
            {"value": "fr-FR", "label": "French"},
            {"value": "de-DE", "label": "German"},
            {"value": "ja-JP", "label": "Japanese"},
            {"value": "zh-CN", "label": "Chinese (Simplified)"}
        ]}
    ))
    
    settings_registry.register(SettingsDefinition(
        key="speaker_identification",
        name="Speaker Identification",
        description="Identify different speakers in transcripts",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.TRANSCRIPTION,
        scope=SettingsScope.TEAM,
        default_value=True,
        ui_component="toggle",
        help_text="Automatically identify and label different speakers"
    ))
    
    # AI Features Settings
    settings_registry.register(SettingsDefinition(
        key="ai_meeting_summaries",
        name="AI Meeting Summaries",
        description="Generate AI-powered meeting summaries",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.AI_FEATURES,
        scope=SettingsScope.TEAM,
        default_value=True,
        ui_component="toggle",
        help_text="Automatically generate meeting summaries using AI"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="ai_action_items",
        name="AI Action Item Detection",
        description="Automatically detect action items using AI",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.AI_FEATURES,
        scope=SettingsScope.TEAM,
        default_value=True,
        ui_component="toggle",
        help_text="Use AI to identify and extract action items from meetings"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="ai_sentiment_analysis",
        name="AI Sentiment Analysis",
        description="Analyze meeting sentiment with AI",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.AI_FEATURES,
        scope=SettingsScope.TEAM,
        default_value=False,
        ui_component="toggle",
        help_text="Analyze the emotional tone and sentiment of meetings"
    ))
    
    # Integration Settings
    settings_registry.register(SettingsDefinition(
        key="calendar_integration",
        name="Calendar Integration",
        description="Enable calendar integration",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.INTEGRATIONS,
        scope=SettingsScope.USER,
        default_value=True,
        ui_component="toggle",
        help_text="Sync meetings with your calendar application"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="slack_integration",
        name="Slack Integration",
        description="Enable Slack integration",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.INTEGRATIONS,
        scope=SettingsScope.TEAM,
        default_value=False,
        ui_component="toggle",
        help_text="Send meeting notifications and summaries to Slack"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="webhook_url",
        name="Webhook URL",
        description="URL for sending meeting webhooks",
        type=SettingsType.URL,
        category=SettingsCategory.INTEGRATIONS,
        scope=SettingsScope.TEAM,
        default_value="",
        validation_rules=[
            SettingsValidationRule("pattern", {
                "pattern": r"^https?://.*"
            }, "Webhook URL must start with http:// or https://")
        ],
        ui_component="input",
        ui_props={"type": "url", "placeholder": "https://example.com/webhook"},
        help_text="Send meeting events to this webhook URL",
        sensitive=True
    ))
    
    # Security Settings
    settings_registry.register(SettingsDefinition(
        key="require_meeting_passwords",
        name="Require Meeting Passwords",
        description="Require passwords for all meetings",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.SECURITY,
        scope=SettingsScope.ORGANIZATION,
        default_value=False,
        ui_component="toggle",
        help_text="Force all meetings to have password protection"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="session_timeout",
        name="Session Timeout",
        description="User session timeout in minutes",
        type=SettingsType.INTEGER,
        category=SettingsCategory.SECURITY,
        scope=SettingsScope.ORGANIZATION,
        default_value=480,  # 8 hours
        validation_rules=[
            SettingsValidationRule("min_value", {"min": 15}, "Session timeout must be at least 15 minutes"),
            SettingsValidationRule("max_value", {"max": 1440}, "Session timeout must be at most 24 hours")
        ],
        ui_component="select",
        ui_props={"options": [
            {"value": 15, "label": "15 minutes"},
            {"value": 30, "label": "30 minutes"},
            {"value": 60, "label": "1 hour"},
            {"value": 240, "label": "4 hours"},
            {"value": 480, "label": "8 hours"},
            {"value": 1440, "label": "24 hours"}
        ]},
        requires_restart=True
    ))
    
    settings_registry.register(SettingsDefinition(
        key="two_factor_auth",
        name="Two-Factor Authentication",
        description="Require 2FA for all users",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.SECURITY,
        scope=SettingsScope.ORGANIZATION,
        default_value=False,
        ui_component="toggle",
        help_text="Require users to enable two-factor authentication",
        requires_restart=True
    ))
    
    # Performance Settings
    settings_registry.register(SettingsDefinition(
        key="max_concurrent_meetings",
        name="Max Concurrent Meetings",
        description="Maximum number of concurrent meetings",
        type=SettingsType.INTEGER,
        category=SettingsCategory.PERFORMANCE,
        scope=SettingsScope.ORGANIZATION,
        default_value=100,
        validation_rules=[
            SettingsValidationRule("min_value", {"min": 1}, "Must allow at least 1 meeting"),
            SettingsValidationRule("max_value", {"max": 1000}, "Cannot exceed 1000 meetings")
        ],
        ui_component="input",
        ui_props={"type": "number"},
        help_text="Limit concurrent meetings to manage server resources",
        requires_restart=True
    ))
    
    settings_registry.register(SettingsDefinition(
        key="cache_duration",
        name="Cache Duration",
        description="How long to cache data (minutes)",
        type=SettingsType.INTEGER,
        category=SettingsCategory.PERFORMANCE,
        scope=SettingsScope.GLOBAL,
        default_value=60,
        validation_rules=[
            SettingsValidationRule("min_value", {"min": 1}, "Cache duration must be at least 1 minute"),
            SettingsValidationRule("max_value", {"max": 1440}, "Cache duration must be at most 24 hours")
        ],
        ui_component="slider",
        ui_props={"min": 1, "max": 1440, "step": 5, "suffix": " min"},
        hot_reload=True
    ))
    
    # Accessibility Settings
    settings_registry.register(SettingsDefinition(
        key="high_contrast",
        name="High Contrast Mode",
        description="Enable high contrast colors",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.ACCESSIBILITY,
        scope=SettingsScope.USER,
        default_value=False,
        ui_component="toggle",
        help_text="Use high contrast colors for better visibility",
        hot_reload=True
    ))
    
    settings_registry.register(SettingsDefinition(
        key="reduce_motion",
        name="Reduce Motion",
        description="Reduce animations and transitions",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.ACCESSIBILITY,
        scope=SettingsScope.USER,
        default_value=False,
        ui_component="toggle",
        help_text="Minimize animations for users sensitive to motion",
        hot_reload=True
    ))
    
    settings_registry.register(SettingsDefinition(
        key="screen_reader_support",
        name="Screen Reader Support",
        description="Enhanced screen reader compatibility",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.ACCESSIBILITY,
        scope=SettingsScope.USER,
        default_value=False,
        ui_component="toggle",
        help_text="Enable enhanced support for screen readers",
        hot_reload=True
    ))
    
    # Plugin Settings
    settings_registry.register(SettingsDefinition(
        key="plugins_enabled",
        name="Enable Plugins",
        description="Allow plugins to be installed and used",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.PLUGINS,
        scope=SettingsScope.ORGANIZATION,
        default_value=True,
        ui_component="toggle",
        help_text="Enable the plugin system",
        requires_restart=True
    ))
    
    settings_registry.register(SettingsDefinition(
        key="plugin_auto_update",
        name="Auto-update Plugins",
        description="Automatically update plugins to latest versions",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.PLUGINS,
        scope=SettingsScope.ORGANIZATION,
        default_value=False,
        ui_component="toggle",
        help_text="Automatically update plugins when new versions are available"
    ))
    
    # Advanced Settings
    settings_registry.register(SettingsDefinition(
        key="debug_mode",
        name="Debug Mode",
        description="Enable debug logging and features",
        type=SettingsType.BOOLEAN,
        category=SettingsCategory.ADVANCED,
        scope=SettingsScope.GLOBAL,
        default_value=False,
        ui_component="toggle",
        help_text="Enable detailed logging for troubleshooting",
        requires_restart=True
    ))
    
    settings_registry.register(SettingsDefinition(
        key="api_rate_limit",
        name="API Rate Limit",
        description="API requests per minute per user",
        type=SettingsType.INTEGER,
        category=SettingsCategory.ADVANCED,
        scope=SettingsScope.ORGANIZATION,
        default_value=1000,
        validation_rules=[
            SettingsValidationRule("min_value", {"min": 10}, "Rate limit must be at least 10 requests/minute"),
            SettingsValidationRule("max_value", {"max": 10000}, "Rate limit cannot exceed 10,000 requests/minute")
        ],
        ui_component="input",
        ui_props={"type": "number", "suffix": " req/min"},
        help_text="Limit API usage to prevent abuse"
    ))
    
    settings_registry.register(SettingsDefinition(
        key="log_level",
        name="Log Level",
        description="Application logging level",
        type=SettingsType.ENUM,
        category=SettingsCategory.ADVANCED,
        scope=SettingsScope.GLOBAL,
        default_value="INFO",
        validation_rules=[
            SettingsValidationRule("in", {"values": ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]})
        ],
        ui_component="select",
        ui_props={"options": [
            {"value": "DEBUG", "label": "Debug (Very Verbose)"},
            {"value": "INFO", "label": "Info (Normal)"},
            {"value": "WARNING", "label": "Warning (Important)"},
            {"value": "ERROR", "label": "Error (Critical Only)"},
            {"value": "CRITICAL", "label": "Critical (Minimal)"}
        ]},
        requires_restart=True
    ))

# Register settings on module import
register_default_settings()