# Settings Models and Data Structures
# Hierarchical settings system with validation and versioning

from typing import Dict, List, Any, Optional, Union, Type, Callable
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from enum import Enum
import json
import uuid
from datetime import datetime
import jsonschema
from jsonschema import validate, ValidationError
import copy

class SettingsScope(Enum):
    """Settings scope levels in hierarchy"""
    GLOBAL = "global"
    ORGANIZATION = "organization" 
    TEAM = "team"
    USER = "user"
    SESSION = "session"

class SettingsType(Enum):
    """Types of settings values"""
    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"
    ENUM = "enum"
    COLOR = "color"
    FILE_PATH = "file_path"
    URL = "url"
    EMAIL = "email"
    PASSWORD = "password"
    JSON = "json"

class SettingsCategory(Enum):
    """Categories for organizing settings"""
    APPEARANCE = "appearance"
    COLLABORATION = "collaboration"
    NOTIFICATIONS = "notifications"
    AUDIO_VIDEO = "audio_video"
    RECORDING = "recording"
    TRANSCRIPTION = "transcription"
    AI_FEATURES = "ai_features"
    INTEGRATIONS = "integrations"
    SECURITY = "security"
    PERFORMANCE = "performance"
    ACCESSIBILITY = "accessibility"
    PLUGINS = "plugins"
    ADVANCED = "advanced"

@dataclass
class SettingsValidationRule:
    """Validation rule for settings values"""
    rule_type: str
    parameters: Dict[str, Any] = field(default_factory=dict)
    error_message: str = ""
    
    def validate(self, value: Any) -> tuple[bool, Optional[str]]:
        """Validate a value against this rule"""
        try:
            if self.rule_type == "required":
                if value is None or value == "":
                    return False, self.error_message or "This field is required"
                    
            elif self.rule_type == "min_length":
                min_len = self.parameters.get("min", 0)
                if isinstance(value, str) and len(value) < min_len:
                    return False, self.error_message or f"Minimum length is {min_len}"
                    
            elif self.rule_type == "max_length":
                max_len = self.parameters.get("max", float('inf'))
                if isinstance(value, str) and len(value) > max_len:
                    return False, self.error_message or f"Maximum length is {max_len}"
                    
            elif self.rule_type == "min_value":
                min_val = self.parameters.get("min", float('-inf'))
                if isinstance(value, (int, float)) and value < min_val:
                    return False, self.error_message or f"Minimum value is {min_val}"
                    
            elif self.rule_type == "max_value":
                max_val = self.parameters.get("max", float('inf'))
                if isinstance(value, (int, float)) and value > max_val:
                    return False, self.error_message or f"Maximum value is {max_val}"
                    
            elif self.rule_type == "pattern":
                import re
                pattern = self.parameters.get("pattern", "")
                if isinstance(value, str) and not re.match(pattern, value):
                    return False, self.error_message or "Value doesn't match required pattern"
                    
            elif self.rule_type == "in":
                allowed = self.parameters.get("values", [])
                if value not in allowed:
                    return False, self.error_message or f"Value must be one of: {allowed}"
                    
            elif self.rule_type == "custom":
                validator = self.parameters.get("validator")
                if validator and callable(validator):
                    return validator(value)
                    
            return True, None
            
        except Exception as e:
            return False, f"Validation error: {str(e)}"

@dataclass
class SettingsDefinition:
    """Definition of a settings field"""
    key: str
    name: str
    description: str
    type: SettingsType
    category: SettingsCategory
    scope: SettingsScope
    default_value: Any
    
    # Validation
    validation_rules: List[SettingsValidationRule] = field(default_factory=list)
    schema: Optional[Dict[str, Any]] = None
    
    # UI Configuration
    ui_component: str = "input"  # input, textarea, select, checkbox, slider, etc.
    ui_props: Dict[str, Any] = field(default_factory=dict)
    help_text: Optional[str] = None
    placeholder: Optional[str] = None
    
    # Behavior
    requires_restart: bool = False
    hot_reload: bool = True
    sensitive: bool = False  # For passwords, tokens, etc.
    deprecated: bool = False
    
    # Hierarchy
    inheritable: bool = True
    override_allowed: bool = True
    
    # Versioning
    version_added: str = "1.0.0"
    version_deprecated: Optional[str] = None
    
    # Dependencies
    depends_on: List[str] = field(default_factory=list)
    affects: List[str] = field(default_factory=list)
    
    def validate_value(self, value: Any) -> tuple[bool, List[str]]:
        """Validate a value against this definition"""
        errors = []
        
        # Type validation
        if not self._validate_type(value):
            errors.append(f"Invalid type for {self.key}. Expected {self.type.value}")
            return False, errors
        
        # Custom validation rules
        for rule in self.validation_rules:
            valid, error = rule.validate(value)
            if not valid and error:
                errors.append(error)
        
        # JSON Schema validation
        if self.schema:
            try:
                validate(instance=value, schema=self.schema)
            except ValidationError as e:
                errors.append(f"Schema validation failed: {e.message}")
        
        return len(errors) == 0, errors
    
    def _validate_type(self, value: Any) -> bool:
        """Validate the type of a value"""
        if value is None:
            return True
            
        type_map = {
            SettingsType.STRING: str,
            SettingsType.INTEGER: int,
            SettingsType.FLOAT: (int, float),
            SettingsType.BOOLEAN: bool,
            SettingsType.ARRAY: list,
            SettingsType.OBJECT: dict,
            SettingsType.ENUM: str,
            SettingsType.COLOR: str,
            SettingsType.FILE_PATH: str,
            SettingsType.URL: str,
            SettingsType.EMAIL: str,
            SettingsType.PASSWORD: str,
            SettingsType.JSON: (dict, list, str)
        }
        
        expected_type = type_map.get(self.type)
        if expected_type:
            return isinstance(value, expected_type)
        
        return True
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "key": self.key,
            "name": self.name,
            "description": self.description,
            "type": self.type.value,
            "category": self.category.value,
            "scope": self.scope.value,
            "default_value": self.default_value,
            "validation_rules": [
                {
                    "rule_type": rule.rule_type,
                    "parameters": rule.parameters,
                    "error_message": rule.error_message
                }
                for rule in self.validation_rules
            ],
            "schema": self.schema,
            "ui_component": self.ui_component,
            "ui_props": self.ui_props,
            "help_text": self.help_text,
            "placeholder": self.placeholder,
            "requires_restart": self.requires_restart,
            "hot_reload": self.hot_reload,
            "sensitive": self.sensitive,
            "deprecated": self.deprecated,
            "inheritable": self.inheritable,
            "override_allowed": self.override_allowed,
            "version_added": self.version_added,
            "version_deprecated": self.version_deprecated,
            "depends_on": self.depends_on,
            "affects": self.affects
        }

@dataclass
class SettingsValue:
    """A settings value with metadata"""
    key: str
    value: Any
    scope: SettingsScope
    scope_id: str  # organization_id, team_id, user_id, etc.
    
    # Metadata
    set_by: str
    set_at: datetime
    source: str = "manual"  # manual, import, migration, default
    
    # Versioning
    version: int = 1
    previous_value: Any = None
    
    # Validation state
    is_valid: bool = True
    validation_errors: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "key": self.key,
            "value": self.value,
            "scope": self.scope.value,
            "scope_id": self.scope_id,
            "set_by": self.set_by,
            "set_at": self.set_at.isoformat(),
            "source": self.source,
            "version": self.version,
            "previous_value": self.previous_value,
            "is_valid": self.is_valid,
            "validation_errors": self.validation_errors
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SettingsValue':
        """Create from dictionary"""
        return cls(
            key=data["key"],
            value=data["value"],
            scope=SettingsScope(data["scope"]),
            scope_id=data["scope_id"],
            set_by=data["set_by"],
            set_at=datetime.fromisoformat(data["set_at"]),
            source=data.get("source", "manual"),
            version=data.get("version", 1),
            previous_value=data.get("previous_value"),
            is_valid=data.get("is_valid", True),
            validation_errors=data.get("validation_errors", [])
        )

@dataclass
class SettingsSnapshot:
    """A snapshot of settings at a point in time"""
    snapshot_id: str
    name: str
    description: str
    scope: SettingsScope
    scope_id: str
    
    # Content
    settings: Dict[str, Any]  # key -> value
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Versioning
    created_at: datetime = field(default_factory=datetime.utcnow)
    created_by: str = ""
    version: str = "1.0.0"
    
    # Relationships
    parent_snapshot_id: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "snapshot_id": self.snapshot_id,
            "name": self.name,
            "description": self.description,
            "scope": self.scope.value,
            "scope_id": self.scope_id,
            "settings": self.settings,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
            "created_by": self.created_by,
            "version": self.version,
            "parent_snapshot_id": self.parent_snapshot_id,
            "tags": self.tags
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SettingsSnapshot':
        """Create from dictionary"""
        return cls(
            snapshot_id=data["snapshot_id"],
            name=data["name"],
            description=data["description"],
            scope=SettingsScope(data["scope"]),
            scope_id=data["scope_id"],
            settings=data["settings"],
            metadata=data.get("metadata", {}),
            created_at=datetime.fromisoformat(data["created_at"]),
            created_by=data.get("created_by", ""),
            version=data.get("version", "1.0.0"),
            parent_snapshot_id=data.get("parent_snapshot_id"),
            tags=data.get("tags", [])
        )

class SettingsMigration(ABC):
    """Base class for settings migrations"""
    
    def __init__(self, from_version: str, to_version: str):
        self.from_version = from_version
        self.to_version = to_version
    
    @abstractmethod
    def migrate(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Migrate settings from one version to another"""
        pass
    
    @abstractmethod
    def rollback(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Rollback migration"""
        pass
    
    def can_migrate(self, current_version: str) -> bool:
        """Check if this migration can be applied"""
        return current_version == self.from_version

@dataclass
class SettingsChangeEvent:
    """Event fired when settings change"""
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    # Change details
    key: str = ""
    old_value: Any = None
    new_value: Any = None
    scope: SettingsScope = SettingsScope.USER
    scope_id: str = ""
    
    # Context
    changed_by: str = ""
    change_reason: str = ""
    source: str = "manual"
    
    # Propagation
    affects_scopes: List[SettingsScope] = field(default_factory=list)
    requires_restart: bool = False
    hot_reload: bool = True
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "event_id": self.event_id,
            "timestamp": self.timestamp.isoformat(),
            "key": self.key,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "scope": self.scope.value,
            "scope_id": self.scope_id,
            "changed_by": self.changed_by,
            "change_reason": self.change_reason,
            "source": self.source,
            "affects_scopes": [scope.value for scope in self.affects_scopes],
            "requires_restart": self.requires_restart,
            "hot_reload": self.hot_reload
        }

class SettingsRegistry:
    """Registry for all settings definitions"""
    
    def __init__(self):
        self._definitions: Dict[str, SettingsDefinition] = {}
        self._categories: Dict[SettingsCategory, List[str]] = {}
        self._scopes: Dict[SettingsScope, List[str]] = {}
        
    def register(self, definition: SettingsDefinition):
        """Register a settings definition"""
        self._definitions[definition.key] = definition
        
        # Update category index
        if definition.category not in self._categories:
            self._categories[definition.category] = []
        self._categories[definition.category].append(definition.key)
        
        # Update scope index
        if definition.scope not in self._scopes:
            self._scopes[definition.scope] = []
        self._scopes[definition.scope].append(definition.key)
    
    def get_definition(self, key: str) -> Optional[SettingsDefinition]:
        """Get a settings definition by key"""
        return self._definitions.get(key)
    
    def get_by_category(self, category: SettingsCategory) -> List[SettingsDefinition]:
        """Get all settings in a category"""
        keys = self._categories.get(category, [])
        return [self._definitions[key] for key in keys if key in self._definitions]
    
    def get_by_scope(self, scope: SettingsScope) -> List[SettingsDefinition]:
        """Get all settings for a scope"""
        keys = self._scopes.get(scope, [])
        return [self._definitions[key] for key in keys if key in self._definitions]
    
    def get_all(self) -> List[SettingsDefinition]:
        """Get all settings definitions"""
        return list(self._definitions.values())
    
    def validate_value(self, key: str, value: Any) -> tuple[bool, List[str]]:
        """Validate a value against its definition"""
        definition = self.get_definition(key)
        if not definition:
            return False, [f"Unknown setting: {key}"]
        
        return definition.validate_value(value)
    
    def get_default_value(self, key: str) -> Any:
        """Get the default value for a setting"""
        definition = self.get_definition(key)
        return definition.default_value if definition else None
    
    def export_schema(self) -> Dict[str, Any]:
        """Export all definitions as JSON schema"""
        schema = {
            "type": "object",
            "properties": {},
            "definitions": {}
        }
        
        for definition in self._definitions.values():
            schema["properties"][definition.key] = {
                "type": definition.type.value,
                "description": definition.description,
                "default": definition.default_value
            }
            
            if definition.schema:
                schema["definitions"][definition.key] = definition.schema
        
        return schema
    
    def to_dict(self) -> Dict[str, Any]:
        """Export registry to dictionary"""
        return {
            "definitions": {
                key: definition.to_dict() 
                for key, definition in self._definitions.items()
            }
        }

# Global settings registry instance
settings_registry = SettingsRegistry()