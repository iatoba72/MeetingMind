# Settings Management System

A comprehensive, professional settings management system for MeetingMind with hierarchical configuration, hot-reload capabilities, version control, and testing laboratory.

## Overview

The settings management system provides:

- **Hierarchical Settings Structure**: Global, Organization, Team, and User level settings
- **Hot-reload Configuration**: Real-time settings updates without restart
- **Settings Import/Export**: Backup and transfer configurations
- **Visual Configuration Editor**: User-friendly interface for settings management
- **Configuration Versioning**: Track changes and rollback capabilities
- **Settings Validation**: Comprehensive validation and migration support
- **Config Laboratory**: Testing environment for configuration changes

## Architecture

### Core Components

#### 1. Settings Models (`settings_models.py`)
- **SettingsDefinition**: Schema for setting definitions with validation rules
- **SettingsValue**: Individual setting values with metadata
- **SettingsScope**: Hierarchical scope enumeration (Global → Organization → Team → User → Session)
- **SettingsRegistry**: Central registry for all setting definitions
- **Validation Framework**: Built-in validation rules and custom validators

#### 2. Settings Manager (`settings_manager.py`)
- **Hierarchical Resolution**: Automatic inheritance from higher scopes
- **Hot-reload Support**: File system watching with debounced updates
- **Caching System**: TTL-based caching for performance
- **Event System**: Change listeners and hot-reload callbacks
- **Persistence**: File-based storage with JSON format

#### 3. Version Manager (`versioning.py`)
- **Version Tracking**: Automatic versioning of configuration changes
- **Rollback Support**: Safe rollback to previous configurations
- **Change Diffing**: Detailed comparison between versions
- **Branch Support**: Create configuration branches for testing
- **History Tracking**: Complete audit trail of changes

#### 4. Settings API (`settings_api.py`)
- **REST Endpoints**: Complete CRUD operations for settings
- **Bulk Operations**: Efficient batch updates
- **Validation API**: Real-time validation endpoints
- **Import/Export**: File-based configuration transfer
- **Version Control**: API for version management and rollback

#### 5. Default Settings (`default_settings.py`)
- **Comprehensive Defaults**: 40+ pre-configured settings
- **Categorized Organization**: Logical grouping of related settings
- **Validation Rules**: Built-in validation for all default settings
- **UI Metadata**: Component hints and help text

## Frontend Components

### 1. Settings Editor (`SettingsEditor.tsx`)
- **Visual Interface**: Intuitive settings configuration
- **Real-time Validation**: Immediate feedback on invalid values
- **Category Organization**: Collapsible setting categories
- **Search and Filtering**: Easy navigation through large setting sets
- **Pending Changes**: Batch updates with preview
- **Version History**: Access to configuration history

### 2. Config Laboratory (`ConfigLaboratory.tsx`)
- **Experiment Creation**: Test configuration changes safely
- **Test Suites**: Pre-built tests for common scenarios
- **Multi-environment Testing**: Desktop, tablet, and mobile environments
- **Performance Monitoring**: Measure impact of setting changes
- **Accessibility Testing**: Validate WCAG compliance
- **Results Dashboard**: Comprehensive test results and metrics

### 3. Settings Container (`SettingsContainer.tsx`)
- **Unified Interface**: Single entry point for all settings features
- **Tab Navigation**: Switch between configuration and testing
- **Scope Management**: Easy switching between setting scopes

## Usage Examples

### Basic Settings Management

```python
from settings import get_settings_manager

# Get settings manager
settings = get_settings_manager()

# Set a user preference
await settings.set_value(
    key="theme",
    value="dark",
    scope=SettingsScope.USER,
    scope_id="user_123",
    set_by="user_interface"
)

# Get setting with hierarchical resolution
theme = await settings.get_value(
    key="theme",
    scope=SettingsScope.USER,
    scope_id="user_123"
)

# Get all settings for a scope
all_settings = await settings.get_all_values(
    scope=SettingsScope.TEAM,
    scope_id="team_456"
)
```

### Version Management

```python
from settings.versioning import get_version_manager

# Get version manager
versions = get_version_manager()

# Create a version snapshot
version_id = await versions.create_version(
    scope=SettingsScope.TEAM,
    scope_id="team_456",
    description="Pre-deployment configuration",
    created_by="admin",
    tags=["deployment", "backup"]
)

# Rollback to previous version
success = await versions.rollback_to_version(
    version_id=version_id,
    rolled_back_by="admin",
    create_backup=True
)

# Compare versions
diff = await versions.compare_versions(
    from_version_id="version_1",
    to_version_id="version_2"
)
```

### Config Laboratory

```python
# Create experiment via API
experiment = {
    "name": "Dark Theme Performance Test",
    "description": "Test performance impact of dark theme",
    "settings": {
        "theme": "dark",
        "font_size": 16,
        "compact_mode": True
    },
    "created_by": "developer"
}

# Run experiment with multiple test suites
await run_experiment(
    experiment_id=experiment["id"],
    test_suite_ids=["performance", "accessibility"],
    environment_ids=["desktop-1080p", "tablet-ipad"]
)
```

### Custom Setting Definitions

```python
from settings.models import SettingsDefinition, SettingsType, SettingsCategory

# Register custom setting
settings_registry.register(SettingsDefinition(
    key="custom_feature_enabled",
    name="Custom Feature",
    description="Enable experimental custom feature",
    type=SettingsType.BOOLEAN,
    category=SettingsCategory.ADVANCED,
    scope=SettingsScope.ORGANIZATION,
    default_value=False,
    validation_rules=[
        SettingsValidationRule("custom_validator", {}, "Custom validation failed")
    ],
    ui_component="toggle",
    help_text="This feature is experimental and may affect performance",
    requires_restart=True
))
```

## API Endpoints

### Settings Management
- `GET /api/settings/definitions` - Get all setting definitions
- `GET /api/settings/values/{scope}/{scope_id}` - Get settings for scope
- `PUT /api/settings/values/{scope}/{scope_id}/{key}` - Set setting value
- `POST /api/settings/values/{scope}/{scope_id}/bulk` - Bulk update settings
- `POST /api/settings/export/{scope}/{scope_id}` - Export settings
- `POST /api/settings/import/{scope}/{scope_id}` - Import settings
- `POST /api/settings/validate/{scope}/{scope_id}` - Validate settings

### Version Management
- `POST /api/settings/versions/{scope}/{scope_id}` - Create version
- `GET /api/settings/versions/{scope}/{scope_id}` - Get version history
- `POST /api/settings/versions/{version_id}/rollback` - Rollback to version
- `GET /api/settings/versions/{from_id}/compare/{to_id}` - Compare versions

### Config Laboratory
- `GET /api/config-lab/experiments` - Get all experiments
- `POST /api/config-lab/experiments` - Create experiment
- `POST /api/config-lab/experiments/{id}/run` - Run experiment
- `GET /api/config-lab/test-suites` - Get available test suites
- `GET /api/config-lab/environments` - Get test environments

## Configuration

### Environment Variables
```bash
# Settings configuration
SETTINGS_CONFIG_DIR=./config
SETTINGS_ENABLE_HOT_RELOAD=true
SETTINGS_CACHE_TTL=300

# Version management
SETTINGS_MAX_VERSIONS=100
SETTINGS_RETENTION_DAYS=90

# Config lab
CONFIG_LAB_ENABLED=true
CONFIG_LAB_TIMEOUT=30000
```

### File Structure
```
config/
├── global/
│   └── global.json
├── organization/
│   ├── org_1.json
│   └── org_2.json
├── team/
│   ├── team_1.json
│   └── team_2.json
├── user/
│   ├── user_123.json
│   └── user_456.json
├── versions/
│   ├── version_uuid_1.json
│   └── version_uuid_2.json
└── snapshots/
    ├── snapshot_uuid_1.json
    └── snapshot_uuid_2.json
```

## Features in Detail

### Hierarchical Resolution
Settings are resolved in the following order (highest to lowest priority):
1. Session scope (temporary, in-memory)
2. User scope (individual user preferences)
3. Team scope (team-specific settings)
4. Organization scope (company-wide settings)
5. Global scope (system defaults)

### Hot-reload
- File system watching with debounced updates
- Real-time setting updates without application restart
- Configurable per setting with `hot_reload` flag
- Event system for custom hot-reload handlers

### Validation System
- Built-in validators (min/max values, regex patterns, enum values)
- Custom validation functions
- JSON schema support
- Type coercion and sanitization

### Version Control
- Automatic versioning on setting changes
- Complete audit trail with change metadata
- Safe rollback with backup creation
- Branch support for testing configurations
- Diff visualization between versions

### Config Laboratory
- Safe testing environment for configuration changes
- Automated test suites for common scenarios
- Multi-environment testing (desktop, tablet, mobile)
- Performance and accessibility testing
- Visual results dashboard with metrics

## Best Practices

### Setting Design
1. Use clear, descriptive setting names and descriptions
2. Provide appropriate default values
3. Include validation rules to prevent invalid configurations
4. Set appropriate scopes based on setting purpose
5. Use help text to guide users

### Performance
1. Enable caching for frequently accessed settings
2. Use hot-reload sparingly for performance-critical settings
3. Batch setting updates when possible
4. Monitor version storage growth and configure retention

### Security
1. Mark sensitive settings with the `sensitive` flag
2. Validate all setting inputs to prevent injection attacks
3. Use appropriate scopes to limit setting access
4. Regularly audit setting permissions

### Testing
1. Use Config Laboratory to test setting changes
2. Create comprehensive test suites for critical settings
3. Test across multiple environments and devices
4. Monitor performance impact of setting changes

## Troubleshooting

### Common Issues

1. **Settings not updating**: Check hot-reload configuration and file permissions
2. **Validation errors**: Review validation rules and input formats
3. **Performance issues**: Monitor cache hit rates and setting resolution times
4. **Version conflicts**: Use version comparison to identify conflicting changes

### Debugging

Enable debug logging:
```python
import logging
logging.getLogger("SettingsManager").setLevel(logging.DEBUG)
logging.getLogger("SettingsVersionManager").setLevel(logging.DEBUG)
```

Check system statistics:
```python
stats = settings.get_stats()
version_stats = versions.get_stats()
print(f"Total settings: {stats['total_values']}")
print(f"Cache hit rate: {stats['cache']['hit_rate']}")
```

## Contributing

When adding new settings:
1. Define the setting in `default_settings.py`
2. Add appropriate validation rules
3. Include UI metadata for the editor
4. Add tests in the Config Laboratory
5. Update documentation

## Migration

The system includes automatic migration support for setting schema changes:
1. Create migration functions in `migrations.py`
2. Version migration scripts
3. Test migrations in Config Laboratory
4. Deploy with rollback plan