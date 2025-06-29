# Plugin API Framework
# Comprehensive plugin system with hooks, events, and extensibility

from typing import Dict, List, Any, Optional, Callable, Union, Type
from abc import ABC, abstractmethod
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime
import asyncio
import json
import uuid
import inspect
from functools import wraps

class PluginEventType(Enum):
    """Types of events that plugins can hook into"""
    # Meeting lifecycle events
    MEETING_CREATED = "meeting.created"
    MEETING_STARTED = "meeting.started"
    MEETING_ENDED = "meeting.ended"
    MEETING_UPDATED = "meeting.updated"
    MEETING_DELETED = "meeting.deleted"
    
    # Participant events
    PARTICIPANT_JOINED = "participant.joined"
    PARTICIPANT_LEFT = "participant.left"
    PARTICIPANT_MUTED = "participant.muted"
    PARTICIPANT_UNMUTED = "participant.unmuted"
    
    # Transcription events
    TRANSCRIPTION_STARTED = "transcription.started"
    TRANSCRIPTION_SEGMENT = "transcription.segment"
    TRANSCRIPTION_COMPLETED = "transcription.completed"
    TRANSCRIPTION_UPDATED = "transcription.updated"
    
    # AI insights events
    INSIGHTS_GENERATED = "insights.generated"
    INSIGHTS_UPDATED = "insights.updated"
    ACTION_ITEM_CREATED = "action_item.created"
    ACTION_ITEM_UPDATED = "action_item.updated"
    
    # Translation events
    TRANSLATION_REQUESTED = "translation.requested"
    TRANSLATION_COMPLETED = "translation.completed"
    LANGUAGE_DETECTED = "language.detected"
    
    # System events
    SYSTEM_STARTUP = "system.startup"
    SYSTEM_SHUTDOWN = "system.shutdown"
    USER_LOGIN = "user.login"
    USER_LOGOUT = "user.logout"
    
    # Custom events (plugins can define their own)
    CUSTOM = "custom"

class PluginPriority(Enum):
    """Plugin execution priority levels"""
    CRITICAL = 0    # System-critical plugins (auth, security)
    HIGH = 1        # Important business logic
    NORMAL = 2      # Standard plugins
    LOW = 3         # Background tasks, analytics
    BACKGROUND = 4  # Non-blocking background operations

class PluginCapability(Enum):
    """Plugin capability categories for permissions"""
    # Data access capabilities
    READ_MEETINGS = "read:meetings"
    WRITE_MEETINGS = "write:meetings"
    READ_PARTICIPANTS = "read:participants"
    WRITE_PARTICIPANTS = "write:participants"
    READ_TRANSCRIPTS = "read:transcripts"
    WRITE_TRANSCRIPTS = "write:transcripts"
    READ_INSIGHTS = "read:insights"
    WRITE_INSIGHTS = "write:insights"
    
    # System capabilities
    NETWORK_ACCESS = "network:access"
    FILE_SYSTEM = "filesystem:access"
    DATABASE_ACCESS = "database:access"
    
    # UI capabilities
    UI_COMPONENTS = "ui:components"
    UI_ROUTES = "ui:routes"
    UI_NOTIFICATIONS = "ui:notifications"
    
    # Integration capabilities
    WEBHOOK_ENDPOINTS = "webhook:endpoints"
    API_ENDPOINTS = "api:endpoints"
    EXTERNAL_APIS = "external:apis"
    
    # Advanced capabilities
    REAL_TIME_EVENTS = "realtime:events"
    BACKGROUND_TASKS = "background:tasks"
    ADMIN_ACCESS = "admin:access"

@dataclass
class PluginEvent:
    """Event data structure passed to plugin hooks"""
    event_type: PluginEventType
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=datetime.utcnow)
    source: str = "system"
    data: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    correlation_id: Optional[str] = None
    user_id: Optional[str] = None
    meeting_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary for serialization"""
        return {
            'event_type': self.event_type.value,
            'event_id': self.event_id,
            'timestamp': self.timestamp.isoformat(),
            'source': self.source,
            'data': self.data,
            'metadata': self.metadata,
            'correlation_id': self.correlation_id,
            'user_id': self.user_id,
            'meeting_id': self.meeting_id
        }

@dataclass
class PluginResult:
    """Result returned from plugin execution"""
    success: bool
    data: Any = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    should_continue: bool = True  # Whether to continue processing other plugins
    
    @classmethod
    def success_result(cls, data: Any = None, **metadata) -> 'PluginResult':
        return cls(success=True, data=data, metadata=metadata)
    
    @classmethod
    def error_result(cls, error: str, should_continue: bool = True) -> 'PluginResult':
        return cls(success=False, error=error, should_continue=should_continue)
    
    @classmethod
    def stop_processing(cls, data: Any = None) -> 'PluginResult':
        return cls(success=True, data=data, should_continue=False)

@dataclass
class PluginManifest:
    """Plugin manifest describing plugin metadata and requirements"""
    name: str
    version: str
    description: str
    author: str
    email: str
    license: str = "MIT"
    
    # Plugin configuration
    entry_point: str = "main.py"
    main_class: str = "Plugin"
    
    # Requirements and dependencies
    python_version: str = ">=3.8"
    dependencies: List[str] = field(default_factory=list)
    plugin_dependencies: List[str] = field(default_factory=list)
    
    # Capabilities and permissions
    capabilities: List[PluginCapability] = field(default_factory=list)
    optional_capabilities: List[PluginCapability] = field(default_factory=list)
    
    # Event hooks
    event_hooks: List[PluginEventType] = field(default_factory=list)
    custom_events: List[str] = field(default_factory=list)
    
    # API endpoints
    api_endpoints: List[Dict[str, str]] = field(default_factory=list)
    webhook_endpoints: List[Dict[str, str]] = field(default_factory=list)
    
    # UI components
    ui_components: List[Dict[str, str]] = field(default_factory=list)
    ui_routes: List[Dict[str, str]] = field(default_factory=list)
    
    # Configuration schema
    config_schema: Dict[str, Any] = field(default_factory=dict)
    default_config: Dict[str, Any] = field(default_factory=dict)
    
    # Marketplace information
    tags: List[str] = field(default_factory=list)
    category: str = "general"
    homepage: Optional[str] = None
    repository: Optional[str] = None
    documentation: Optional[str] = None
    
    # Security and sandboxing
    sandbox_level: str = "strict"  # strict, moderate, permissive
    trusted: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert manifest to dictionary"""
        return {
            'name': self.name,
            'version': self.version,
            'description': self.description,
            'author': self.author,
            'email': self.email,
            'license': self.license,
            'entry_point': self.entry_point,
            'main_class': self.main_class,
            'python_version': self.python_version,
            'dependencies': self.dependencies,
            'plugin_dependencies': self.plugin_dependencies,
            'capabilities': [cap.value for cap in self.capabilities],
            'optional_capabilities': [cap.value for cap in self.optional_capabilities],
            'event_hooks': [event.value for event in self.event_hooks],
            'custom_events': self.custom_events,
            'api_endpoints': self.api_endpoints,
            'webhook_endpoints': self.webhook_endpoints,
            'ui_components': self.ui_components,
            'ui_routes': self.ui_routes,
            'config_schema': self.config_schema,
            'default_config': self.default_config,
            'tags': self.tags,
            'category': self.category,
            'homepage': self.homepage,
            'repository': self.repository,
            'documentation': self.documentation,
            'sandbox_level': self.sandbox_level,
            'trusted': self.trusted
        }

class PluginContext:
    """Context object providing plugins access to system resources"""
    
    def __init__(self, plugin_id: str, capabilities: List[PluginCapability]):
        self.plugin_id = plugin_id
        self.capabilities = capabilities
        self._logger = None
        self._database = None
        self._config = {}
        self._event_emitter = None
    
    def has_capability(self, capability: PluginCapability) -> bool:
        """Check if plugin has specific capability"""
        return capability in self.capabilities
    
    def require_capability(self, capability: PluginCapability):
        """Require specific capability or raise exception"""
        if not self.has_capability(capability):
            raise PermissionError(f"Plugin {self.plugin_id} lacks required capability: {capability.value}")
    
    def log(self, level: str, message: str, **kwargs):
        """Log message with plugin context"""
        if self._logger:
            self._logger.log(level, f"[{self.plugin_id}] {message}", **kwargs)
    
    def get_config(self, key: str = None, default: Any = None) -> Any:
        """Get plugin configuration"""
        if key is None:
            return self._config
        return self._config.get(key, default)
    
    def set_config(self, key: str, value: Any):
        """Set plugin configuration"""
        self._config[key] = value
    
    def emit_event(self, event_type: Union[PluginEventType, str], data: Dict[str, Any] = None):
        """Emit custom event"""
        if self._event_emitter:
            if isinstance(event_type, str):
                event_type = PluginEventType.CUSTOM
            
            event = PluginEvent(
                event_type=event_type,
                source=self.plugin_id,
                data=data or {}
            )
            self._event_emitter.emit(event)
    
    async def get_database_session(self):
        """Get database session (requires DATABASE_ACCESS capability)"""
        self.require_capability(PluginCapability.DATABASE_ACCESS)
        return self._database.get_session() if self._database else None
    
    async def make_http_request(self, url: str, method: str = 'GET', **kwargs):
        """Make HTTP request (requires NETWORK_ACCESS capability)"""
        self.require_capability(PluginCapability.NETWORK_ACCESS)
        # HTTP request implementation would go here
        pass

class BasePlugin(ABC):
    """Base class for all plugins"""
    
    def __init__(self, context: PluginContext):
        self.context = context
        self.manifest = self.get_manifest()
        self._initialized = False
        self._hooks = {}
    
    @abstractmethod
    def get_manifest(self) -> PluginManifest:
        """Return plugin manifest"""
        raise NotImplementedError("Subclasses must implement get_manifest method")
    
    async def initialize(self) -> bool:
        """Initialize plugin (called during plugin loading)"""
        self._initialized = True
        return True
    
    async def cleanup(self):
        """Cleanup plugin resources (called during plugin unloading)"""
        self._initialized = False
    
    def is_initialized(self) -> bool:
        """Check if plugin is initialized"""
        return self._initialized
    
    def register_hook(self, event_type: PluginEventType, handler: Callable, priority: PluginPriority = PluginPriority.NORMAL):
        """Register event hook"""
        if event_type not in self._hooks:
            self._hooks[event_type] = []
        
        self._hooks[event_type].append({
            'handler': handler,
            'priority': priority,
            'plugin_id': self.context.plugin_id
        })
    
    def get_hooks(self) -> Dict[PluginEventType, List[Dict]]:
        """Get all registered hooks"""
        return self._hooks
    
    async def handle_event(self, event: PluginEvent) -> PluginResult:
        """Handle incoming event (override in subclasses)"""
        return PluginResult.success_result()
    
    def get_api_routes(self) -> List[Dict[str, Any]]:
        """Get API routes provided by this plugin"""
        return []
    
    def get_ui_components(self) -> List[Dict[str, Any]]:
        """Get UI components provided by this plugin"""
        return []

def plugin_hook(event_type: PluginEventType, priority: PluginPriority = PluginPriority.NORMAL):
    """Decorator for plugin event handlers"""
    def decorator(func):
        func._plugin_hook = True
        func._event_type = event_type
        func._priority = priority
        return func
    return decorator

def requires_capability(capability: PluginCapability):
    """Decorator to require specific capability"""
    def decorator(func):
        @wraps(func)
        async def wrapper(self, *args, **kwargs):
            if hasattr(self, 'context'):
                self.context.require_capability(capability)
            return await func(self, *args, **kwargs)
        return wrapper
    return decorator

class PluginAPI:
    """Main API interface for plugins to interact with the system"""
    
    def __init__(self):
        self._event_handlers = {}
        self._plugins = {}
        self._contexts = {}
    
    def register_plugin(self, plugin: BasePlugin, context: PluginContext):
        """Register a plugin with the API"""
        plugin_id = context.plugin_id
        self._plugins[plugin_id] = plugin
        self._contexts[plugin_id] = context
        
        # Register plugin hooks
        for event_type, handlers in plugin.get_hooks().items():
            if event_type not in self._event_handlers:
                self._event_handlers[event_type] = []
            self._event_handlers[event_type].extend(handlers)
    
    def unregister_plugin(self, plugin_id: str):
        """Unregister a plugin from the API"""
        if plugin_id in self._plugins:
            # Remove event handlers
            for event_type, handlers in self._event_handlers.items():
                self._event_handlers[event_type] = [
                    h for h in handlers if h['plugin_id'] != plugin_id
                ]
            
            del self._plugins[plugin_id]
            del self._contexts[plugin_id]
    
    async def emit_event(self, event: PluginEvent) -> List[PluginResult]:
        """Emit event to all registered handlers"""
        results = []
        
        # Get handlers for this event type
        handlers = self._event_handlers.get(event.event_type, [])
        
        # Sort by priority
        handlers.sort(key=lambda h: h['priority'].value)
        
        # Execute handlers
        for handler_info in handlers:
            try:
                handler = handler_info['handler']
                plugin_id = handler_info['plugin_id']
                plugin = self._plugins.get(plugin_id)
                
                if plugin and plugin.is_initialized():
                    # Execute handler
                    if inspect.iscoroutinefunction(handler):
                        result = await handler(event)
                    else:
                        result = handler(event)
                    
                    if not isinstance(result, PluginResult):
                        result = PluginResult.success_result(result)
                    
                    results.append(result)
                    
                    # Stop processing if handler says so
                    if not result.should_continue:
                        break
                        
            except Exception as e:
                error_result = PluginResult.error_result(str(e))
                results.append(error_result)
                # Continue processing other plugins
        
        return results
    
    def get_plugin_info(self, plugin_id: str) -> Optional[Dict[str, Any]]:
        """Get information about a specific plugin"""
        plugin = self._plugins.get(plugin_id)
        if plugin:
            return {
                'id': plugin_id,
                'manifest': plugin.manifest.to_dict(),
                'initialized': plugin.is_initialized(),
                'capabilities': [cap.value for cap in self._contexts[plugin_id].capabilities]
            }
        return None
    
    def list_plugins(self) -> List[Dict[str, Any]]:
        """List all registered plugins"""
        return [
            self.get_plugin_info(plugin_id)
            for plugin_id in self._plugins.keys()
        ]
    
    def get_plugins_by_capability(self, capability: PluginCapability) -> List[str]:
        """Get list of plugin IDs that have specific capability"""
        return [
            plugin_id for plugin_id, context in self._contexts.items()
            if context.has_capability(capability)
        ]

# Global plugin API instance
plugin_api = PluginAPI()

# Event factory functions for common events
def create_meeting_event(event_type: PluginEventType, meeting_data: Dict[str, Any], user_id: str = None) -> PluginEvent:
    """Create meeting-related event"""
    return PluginEvent(
        event_type=event_type,
        data=meeting_data,
        user_id=user_id,
        meeting_id=meeting_data.get('id')
    )

def create_transcription_event(event_type: PluginEventType, transcript_data: Dict[str, Any], meeting_id: str) -> PluginEvent:
    """Create transcription-related event"""
    return PluginEvent(
        event_type=event_type,
        data=transcript_data,
        meeting_id=meeting_id
    )

def create_user_event(event_type: PluginEventType, user_data: Dict[str, Any]) -> PluginEvent:
    """Create user-related event"""
    return PluginEvent(
        event_type=event_type,
        data=user_data,
        user_id=user_data.get('id')
    )

# Utility functions for plugin development
def validate_manifest(manifest_dict: Dict[str, Any]) -> List[str]:
    """Validate plugin manifest and return list of errors"""
    errors = []
    
    required_fields = ['name', 'version', 'description', 'author', 'email']
    for field in required_fields:
        if field not in manifest_dict:
            errors.append(f"Missing required field: {field}")
    
    # Validate capabilities
    if 'capabilities' in manifest_dict:
        for cap in manifest_dict['capabilities']:
            try:
                PluginCapability(cap)
            except ValueError:
                errors.append(f"Invalid capability: {cap}")
    
    # Validate event hooks
    if 'event_hooks' in manifest_dict:
        for hook in manifest_dict['event_hooks']:
            try:
                PluginEventType(hook)
            except ValueError:
                errors.append(f"Invalid event hook: {hook}")
    
    return errors

def create_plugin_manifest(**kwargs) -> PluginManifest:
    """Helper function to create plugin manifest"""
    return PluginManifest(**kwargs)