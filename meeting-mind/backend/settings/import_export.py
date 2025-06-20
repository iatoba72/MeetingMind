# Settings Import/Export System
# Advanced import/export with multiple formats, validation, and transformation

import asyncio
import json
import yaml
import toml
import csv
import xml.etree.ElementTree as ET
from typing import Dict, List, Any, Optional, Union, TextIO, BinaryIO
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from enum import Enum
import logging
import hashlib
import io
import zipfile
import tempfile
from contextlib import asynccontextmanager

from .settings_models import SettingsScope, SettingsDefinition, SettingsValue, settings_registry
from .settings_manager import get_settings_manager

class ExportFormat(Enum):
    """Supported export formats"""
    JSON = "json"
    YAML = "yaml"
    TOML = "toml"
    CSV = "csv"
    XML = "xml"
    ENV = "env"
    PROPERTIES = "properties"
    ZIP = "zip"  # Archive with multiple formats

class ImportSource(Enum):
    """Sources for importing settings"""
    FILE = "file"
    URL = "url"
    TEXT = "text"
    DATABASE = "database"
    API = "api"

class ValidationLevel(Enum):
    """Validation strictness levels"""
    STRICT = "strict"      # Fail on any validation error
    LENIENT = "lenient"    # Warn on validation errors but continue
    SKIP = "skip"          # Skip validation entirely

@dataclass
class ImportExportOptions:
    """Options for import/export operations"""
    # Format options
    format: ExportFormat = ExportFormat.JSON
    pretty_print: bool = True
    include_metadata: bool = True
    include_defaults: bool = False
    
    # Filtering
    categories: Optional[List[str]] = None
    scopes: Optional[List[SettingsScope]] = None
    keys: Optional[List[str]] = None
    exclude_keys: Optional[List[str]] = None
    exclude_sensitive: bool = True
    
    # Validation
    validation_level: ValidationLevel = ValidationLevel.STRICT
    validate_references: bool = True
    transform_values: bool = True
    
    # Versioning
    include_version_info: bool = True
    target_version: Optional[str] = None
    
    # Advanced
    compress: bool = False
    encrypt: bool = False
    encryption_key: Optional[str] = None
    backup_before_import: bool = True
    dry_run: bool = False
    
    # Conflict resolution
    conflict_resolution: str = "merge"  # merge, overwrite, skip, prompt
    merge_strategy: str = "deep"       # deep, shallow

@dataclass
class ImportExportResult:
    """Result of import/export operation"""
    success: bool
    operation: str  # import/export
    format: ExportFormat
    source_target: str
    
    # Statistics
    processed_count: int = 0
    success_count: int = 0
    error_count: int = 0
    warning_count: int = 0
    skipped_count: int = 0
    
    # Details
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    
    # Data
    exported_data: Optional[Dict[str, Any]] = None
    imported_settings: Dict[str, Any] = field(default_factory=dict)
    
    # Metadata
    started_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    duration: Optional[timedelta] = None
    checksum: Optional[str] = None
    
    def finalize(self):
        """Finalize the result"""
        self.completed_at = datetime.utcnow()
        self.duration = self.completed_at - self.started_at
        self.success = self.error_count == 0

class SettingsTransformer:
    """Transform settings between different formats and versions"""
    
    def __init__(self):
        self.logger = logging.getLogger("SettingsTransformer")
    
    def transform_for_export(self, 
                           settings: Dict[str, Any], 
                           format: ExportFormat,
                           options: ImportExportOptions) -> Dict[str, Any]:
        """Transform settings for export"""
        result = {}
        
        for key, value in settings.items():
            definition = settings_registry.get_definition(key)
            
            # Skip if filtered out
            if not self._should_include_setting(key, definition, options):
                continue
            
            # Transform value based on format
            transformed_value = self._transform_value_for_export(value, definition, format)
            result[key] = transformed_value
        
        return result
    
    def transform_for_import(self, 
                           data: Dict[str, Any], 
                           format: ExportFormat,
                           options: ImportExportOptions) -> Dict[str, Any]:
        """Transform data for import"""
        result = {}
        
        for key, value in data.items():
            definition = settings_registry.get_definition(key)
            
            # Transform value from import format
            try:
                transformed_value = self._transform_value_for_import(value, definition, format)
                result[key] = transformed_value
            except Exception as e:
                self.logger.warning(f"Failed to transform {key}: {e}")
                if options.validation_level == ValidationLevel.STRICT:
                    raise
                continue
        
        return result
    
    def _should_include_setting(self, 
                              key: str, 
                              definition: Optional[SettingsDefinition],
                              options: ImportExportOptions) -> bool:
        """Check if setting should be included"""
        # Filter by keys
        if options.keys and key not in options.keys:
            return False
        
        if options.exclude_keys and key in options.exclude_keys:
            return False
        
        if not definition:
            return not options.validation_level == ValidationLevel.STRICT
        
        # Filter by category
        if options.categories and definition.category.value not in options.categories:
            return False
        
        # Filter by scope
        if options.scopes and definition.scope not in options.scopes:
            return False
        
        # Filter sensitive
        if options.exclude_sensitive and definition.sensitive:
            return False
        
        return True
    
    def _transform_value_for_export(self, 
                                  value: Any, 
                                  definition: Optional[SettingsDefinition],
                                  format: ExportFormat) -> Any:
        """Transform value for export format"""
        if value is None:
            return None
        
        # Format-specific transformations
        if format == ExportFormat.ENV:
            return str(value)
        elif format == ExportFormat.CSV:
            if isinstance(value, (dict, list)):
                return json.dumps(value)
            return str(value)
        elif format == ExportFormat.XML:
            if isinstance(value, bool):
                return "true" if value else "false"
            return str(value)
        
        return value
    
    def _transform_value_for_import(self, 
                                  value: Any, 
                                  definition: Optional[SettingsDefinition],
                                  format: ExportFormat) -> Any:
        """Transform value for import"""
        if value is None:
            return None
        
        if not definition:
            return value
        
        # Format-specific parsing
        if format == ExportFormat.ENV or format == ExportFormat.CSV:
            return self._parse_string_value(value, definition)
        elif format == ExportFormat.XML:
            return self._parse_xml_value(value, definition)
        
        return value
    
    def _parse_string_value(self, value: str, definition: SettingsDefinition) -> Any:
        """Parse string value to appropriate type"""
        if definition.type.value == "boolean":
            return value.lower() in ("true", "1", "yes", "on")
        elif definition.type.value == "integer":
            return int(value)
        elif definition.type.value == "float":
            return float(value)
        elif definition.type.value in ("array", "object"):
            return json.loads(value)
        
        return value
    
    def _parse_xml_value(self, value: str, definition: SettingsDefinition) -> Any:
        """Parse XML value to appropriate type"""
        if value == "true":
            return True
        elif value == "false":
            return False
        
        return self._parse_string_value(value, definition)

class SettingsValidator:
    """Validate settings during import/export"""
    
    def __init__(self):
        self.logger = logging.getLogger("SettingsValidator")
    
    def validate_export_data(self, 
                           data: Dict[str, Any], 
                           options: ImportExportOptions) -> List[str]:
        """Validate data before export"""
        errors = []
        
        for key, value in data.items():
            definition = settings_registry.get_definition(key)
            if definition:
                valid, validation_errors = definition.validate_value(value)
                if not valid:
                    errors.extend([f"{key}: {error}" for error in validation_errors])
        
        return errors
    
    def validate_import_data(self, 
                           data: Dict[str, Any], 
                           options: ImportExportOptions) -> List[str]:
        """Validate data before import"""
        errors = []
        
        # Check for unknown settings
        for key in data.keys():
            if not settings_registry.get_definition(key):
                error = f"Unknown setting: {key}"
                if options.validation_level == ValidationLevel.STRICT:
                    errors.append(error)
                else:
                    self.logger.warning(error)
        
        # Validate values
        for key, value in data.items():
            definition = settings_registry.get_definition(key)
            if definition:
                valid, validation_errors = definition.validate_value(value)
                if not valid and options.validation_level != ValidationLevel.SKIP:
                    errors.extend([f"{key}: {error}" for error in validation_errors])
        
        return errors

class SettingsImportExport:
    """Main class for settings import/export operations"""
    
    def __init__(self):
        self.transformer = SettingsTransformer()
        self.validator = SettingsValidator()
        self.logger = logging.getLogger("SettingsImportExport")
    
    async def export_settings(self,
                            scope: SettingsScope,
                            scope_id: str,
                            options: ImportExportOptions = None) -> ImportExportResult:
        """Export settings to specified format"""
        options = options or ImportExportOptions()
        result = ImportExportResult(
            success=False,
            operation="export",
            format=options.format,
            source_target=f"{scope.value}:{scope_id}"
        )
        
        try:
            settings_manager = get_settings_manager()
            
            # Get all settings for scope
            all_settings = await settings_manager.get_all_values(scope, scope_id)
            result.processed_count = len(all_settings)
            
            # Transform for export
            transformed_settings = self.transformer.transform_for_export(
                all_settings, options.format, options
            )
            
            # Validate
            if options.validation_level != ValidationLevel.SKIP:
                validation_errors = self.validator.validate_export_data(
                    transformed_settings, options
                )
                if validation_errors:
                    result.errors.extend(validation_errors)
                    if options.validation_level == ValidationLevel.STRICT:
                        return result
            
            # Create export data structure
            export_data = {
                "format_version": "1.0",
                "exported_at": datetime.utcnow().isoformat(),
                "scope": scope.value,
                "scope_id": scope_id,
                "settings": transformed_settings
            }
            
            if options.include_metadata:
                export_data["metadata"] = await self._get_metadata(
                    scope, scope_id, list(transformed_settings.keys())
                )
            
            if options.include_version_info:
                export_data["version_info"] = {
                    "meetingmind_version": "1.0.0",
                    "export_options": {
                        "format": options.format.value,
                        "include_defaults": options.include_defaults,
                        "validation_level": options.validation_level.value
                    }
                }
            
            # Generate checksum
            result.checksum = self._generate_checksum(export_data)
            export_data["checksum"] = result.checksum
            
            result.exported_data = export_data
            result.success_count = len(transformed_settings)
            result.success = True
            
        except Exception as e:
            result.errors.append(f"Export failed: {str(e)}")
            self.logger.error(f"Export failed: {e}")
        
        finally:
            result.finalize()
        
        return result
    
    async def import_settings(self,
                            data: Dict[str, Any],
                            scope: SettingsScope,
                            scope_id: str,
                            options: ImportExportOptions = None) -> ImportExportResult:
        """Import settings from data"""
        options = options or ImportExportOptions()
        result = ImportExportResult(
            success=False,
            operation="import",
            format=options.format,
            source_target=f"{scope.value}:{scope_id}"
        )
        
        try:
            settings_manager = get_settings_manager()
            
            # Extract settings from data
            settings_to_import = data.get("settings", data)
            result.processed_count = len(settings_to_import)
            
            # Backup existing settings if requested
            backup_data = None
            if options.backup_before_import:
                backup_result = await self.export_settings(scope, scope_id)
                if backup_result.success:
                    backup_data = backup_result.exported_data
            
            # Transform for import
            transformed_settings = self.transformer.transform_for_import(
                settings_to_import, options.format, options
            )
            
            # Validate
            if options.validation_level != ValidationLevel.SKIP:
                validation_errors = self.validator.validate_import_data(
                    transformed_settings, options
                )
                if validation_errors:
                    result.errors.extend(validation_errors)
                    if options.validation_level == ValidationLevel.STRICT:
                        return result
                    result.warning_count = len(validation_errors)
            
            # Apply settings
            if not options.dry_run:
                for key, value in transformed_settings.items():
                    try:
                        success = await settings_manager.set_value(
                            key=key,
                            value=value,
                            scope=scope,
                            scope_id=scope_id,
                            set_by="import",
                            source="import"
                        )
                        
                        if success:
                            result.success_count += 1
                            result.imported_settings[key] = value
                        else:
                            result.error_count += 1
                            result.errors.append(f"Failed to set {key}")
                            
                    except Exception as e:
                        result.error_count += 1
                        result.errors.append(f"Error setting {key}: {str(e)}")
                        
                        if options.validation_level == ValidationLevel.STRICT:
                            # Rollback on strict mode
                            if backup_data:
                                await self._restore_backup(backup_data, scope, scope_id)
                            raise
            else:
                # Dry run - just count what would be imported
                result.success_count = len(transformed_settings)
                result.imported_settings = transformed_settings
            
            result.success = result.error_count == 0
            
        except Exception as e:
            result.errors.append(f"Import failed: {str(e)}")
            self.logger.error(f"Import failed: {e}")
        
        finally:
            result.finalize()
        
        return result
    
    async def export_to_file(self,
                           file_path: str,
                           scope: SettingsScope,
                           scope_id: str,
                           options: ImportExportOptions = None) -> ImportExportResult:
        """Export settings to file"""
        options = options or ImportExportOptions()
        
        # Export settings
        result = await self.export_settings(scope, scope_id, options)
        
        if result.success and result.exported_data:
            try:
                # Format data for file
                formatted_data = await self._format_for_file(
                    result.exported_data, options.format, options
                )
                
                # Write to file
                path = Path(file_path)
                path.parent.mkdir(parents=True, exist_ok=True)
                
                if options.format == ExportFormat.ZIP:
                    await self._write_zip_file(path, result.exported_data, options)
                else:
                    mode = 'w' if options.format in [ExportFormat.JSON, ExportFormat.YAML, 
                                                   ExportFormat.TOML, ExportFormat.CSV, 
                                                   ExportFormat.XML, ExportFormat.ENV, 
                                                   ExportFormat.PROPERTIES] else 'wb'
                    
                    with open(path, mode, encoding='utf-8' if mode == 'w' else None) as f:
                        f.write(formatted_data)
                
                result.source_target = str(path)
                self.logger.info(f"Settings exported to {file_path}")
                
            except Exception as e:
                result.success = False
                result.errors.append(f"Failed to write file: {str(e)}")
        
        return result
    
    async def import_from_file(self,
                             file_path: str,
                             scope: SettingsScope,
                             scope_id: str,
                             options: ImportExportOptions = None) -> ImportExportResult:
        """Import settings from file"""
        options = options or ImportExportOptions()
        
        try:
            path = Path(file_path)
            if not path.exists():
                result = ImportExportResult(
                    success=False,
                    operation="import",
                    format=options.format,
                    source_target=str(path)
                )
                result.errors.append(f"File not found: {file_path}")
                return result
            
            # Detect format if not specified
            if options.format == ExportFormat.JSON and path.suffix:
                format_map = {
                    '.json': ExportFormat.JSON,
                    '.yaml': ExportFormat.YAML,
                    '.yml': ExportFormat.YAML,
                    '.toml': ExportFormat.TOML,
                    '.csv': ExportFormat.CSV,
                    '.xml': ExportFormat.XML,
                    '.env': ExportFormat.ENV,
                    '.properties': ExportFormat.PROPERTIES,
                    '.zip': ExportFormat.ZIP
                }
                options.format = format_map.get(path.suffix, ExportFormat.JSON)
            
            # Read and parse file
            if options.format == ExportFormat.ZIP:
                data = await self._read_zip_file(path)
            else:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                data = await self._parse_file_content(content, options.format)
            
            # Import settings
            result = await self.import_settings(data, scope, scope_id, options)
            result.source_target = str(path)
            
            return result
            
        except Exception as e:
            result = ImportExportResult(
                success=False,
                operation="import",
                format=options.format,
                source_target=file_path
            )
            result.errors.append(f"Failed to read file: {str(e)}")
            return result
    
    async def _format_for_file(self, 
                             data: Dict[str, Any], 
                             format: ExportFormat,
                             options: ImportExportOptions) -> Union[str, bytes]:
        """Format data for file output"""
        if format == ExportFormat.JSON:
            return json.dumps(data, indent=2 if options.pretty_print else None, 
                            ensure_ascii=False, default=str)
        
        elif format == ExportFormat.YAML:
            return yaml.dump(data, default_flow_style=False, 
                           indent=2 if options.pretty_print else None)
        
        elif format == ExportFormat.TOML:
            # TOML requires flattening of nested structures
            flat_data = self._flatten_for_toml(data)
            return toml.dumps(flat_data)
        
        elif format == ExportFormat.CSV:
            return self._format_as_csv(data)
        
        elif format == ExportFormat.XML:
            return self._format_as_xml(data, options.pretty_print)
        
        elif format == ExportFormat.ENV:
            return self._format_as_env(data)
        
        elif format == ExportFormat.PROPERTIES:
            return self._format_as_properties(data)
        
        else:
            return json.dumps(data, indent=2, ensure_ascii=False, default=str)
    
    async def _parse_file_content(self, content: str, format: ExportFormat) -> Dict[str, Any]:
        """Parse file content based on format"""
        if format == ExportFormat.JSON:
            return json.loads(content)
        
        elif format == ExportFormat.YAML:
            return yaml.safe_load(content)
        
        elif format == ExportFormat.TOML:
            return toml.loads(content)
        
        elif format == ExportFormat.CSV:
            return self._parse_csv_content(content)
        
        elif format == ExportFormat.XML:
            return self._parse_xml_content(content)
        
        elif format == ExportFormat.ENV:
            return self._parse_env_content(content)
        
        elif format == ExportFormat.PROPERTIES:
            return self._parse_properties_content(content)
        
        else:
            return json.loads(content)
    
    def _format_as_csv(self, data: Dict[str, Any]) -> str:
        """Format data as CSV"""
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow(['key', 'value', 'type', 'category', 'scope'])
        
        settings = data.get('settings', {})
        metadata = data.get('metadata', {})
        
        for key, value in settings.items():
            meta = metadata.get(key, {})
            definition = settings_registry.get_definition(key)
            
            row = [
                key,
                json.dumps(value) if isinstance(value, (dict, list)) else str(value),
                definition.type.value if definition else 'string',
                definition.category.value if definition else 'unknown',
                definition.scope.value if definition else 'user'
            ]
            writer.writerow(row)
        
        return output.getvalue()
    
    def _parse_csv_content(self, content: str) -> Dict[str, Any]:
        """Parse CSV content"""
        reader = csv.DictReader(io.StringIO(content))
        settings = {}
        
        for row in reader:
            key = row['key']
            value = row['value']
            
            # Try to parse JSON values
            try:
                if value.startswith(('{', '[')):
                    value = json.loads(value)
                elif row.get('type') == 'boolean':
                    value = value.lower() in ('true', '1', 'yes')
                elif row.get('type') == 'integer':
                    value = int(value)
                elif row.get('type') == 'float':
                    value = float(value)
            except:
                pass  # Keep as string
            
            settings[key] = value
        
        return {"settings": settings}
    
    def _format_as_xml(self, data: Dict[str, Any], pretty: bool = True) -> str:
        """Format data as XML"""
        root = ET.Element("settings")
        
        # Add metadata
        if 'exported_at' in data:
            root.set('exported_at', data['exported_at'])
        if 'scope' in data:
            root.set('scope', data['scope'])
        if 'scope_id' in data:
            root.set('scope_id', data['scope_id'])
        
        settings = data.get('settings', {})
        for key, value in settings.items():
            setting_elem = ET.SubElement(root, "setting")
            setting_elem.set("key", key)
            
            definition = settings_registry.get_definition(key)
            if definition:
                setting_elem.set("type", definition.type.value)
                setting_elem.set("category", definition.category.value)
            
            # Handle different value types
            if isinstance(value, (dict, list)):
                setting_elem.text = json.dumps(value)
            elif isinstance(value, bool):
                setting_elem.text = "true" if value else "false"
            else:
                setting_elem.text = str(value)
        
        if pretty:
            self._indent_xml(root)
        
        return ET.tostring(root, encoding='unicode')
    
    def _parse_xml_content(self, content: str) -> Dict[str, Any]:
        """Parse XML content"""
        root = ET.fromstring(content)
        settings = {}
        
        for setting in root.findall('setting'):
            key = setting.get('key')
            value_text = setting.text or ''
            setting_type = setting.get('type', 'string')
            
            # Parse value based on type
            if setting_type == 'boolean':
                value = value_text.lower() == 'true'
            elif setting_type == 'integer':
                value = int(value_text)
            elif setting_type == 'float':
                value = float(value_text)
            elif setting_type in ('array', 'object'):
                value = json.loads(value_text)
            else:
                value = value_text
            
            settings[key] = value
        
        return {
            "settings": settings,
            "scope": root.get('scope', 'user'),
            "scope_id": root.get('scope_id', 'default'),
            "exported_at": root.get('exported_at')
        }
    
    def _format_as_env(self, data: Dict[str, Any]) -> str:
        """Format data as environment variables"""
        lines = []
        lines.append("# MeetingMind Settings Export")
        lines.append(f"# Exported at: {data.get('exported_at', 'unknown')}")
        lines.append(f"# Scope: {data.get('scope', 'unknown')}:{data.get('scope_id', 'unknown')}")
        lines.append("")
        
        settings = data.get('settings', {})
        for key, value in sorted(settings.items()):
            # Convert key to env var format
            env_key = f"MEETINGMIND_{key.upper()}"
            
            # Convert value to string
            if isinstance(value, bool):
                env_value = "true" if value else "false"
            elif isinstance(value, (dict, list)):
                env_value = json.dumps(value)
            else:
                env_value = str(value)
            
            # Escape quotes
            if '"' in env_value:
                env_value = env_value.replace('"', '\\"')
            
            lines.append(f'{env_key}="{env_value}"')
        
        return '\n'.join(lines)
    
    def _parse_env_content(self, content: str) -> Dict[str, Any]:
        """Parse environment variables content"""
        settings = {}
        
        for line in content.split('\n'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            if '=' in line:
                key, value = line.split('=', 1)
                
                # Remove MEETINGMIND_ prefix and convert to lowercase
                if key.startswith('MEETINGMIND_'):
                    key = key[12:].lower()
                
                # Remove quotes
                value = value.strip('"\'')
                
                # Try to parse special values
                if value.lower() in ('true', 'false'):
                    value = value.lower() == 'true'
                elif value.startswith(('{', '[')):
                    try:
                        value = json.loads(value)
                    except:
                        pass
                
                settings[key] = value
        
        return {"settings": settings}
    
    def _format_as_properties(self, data: Dict[str, Any]) -> str:
        """Format data as Java properties"""
        lines = []
        lines.append("# MeetingMind Settings Export")
        lines.append(f"# Exported at: {data.get('exported_at', 'unknown')}")
        lines.append("")
        
        settings = data.get('settings', {})
        for key, value in sorted(settings.items()):
            # Convert value to string
            if isinstance(value, bool):
                prop_value = "true" if value else "false"
            elif isinstance(value, (dict, list)):
                prop_value = json.dumps(value)
            else:
                prop_value = str(value)
            
            # Escape special characters
            prop_value = prop_value.replace('\\', '\\\\').replace('\n', '\\n')
            
            lines.append(f"{key}={prop_value}")
        
        return '\n'.join(lines)
    
    def _parse_properties_content(self, content: str) -> Dict[str, Any]:
        """Parse Java properties content"""
        settings = {}
        
        for line in content.split('\n'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            if '=' in line:
                key, value = line.split('=', 1)
                
                # Unescape special characters
                value = value.replace('\\\\', '\\').replace('\\n', '\n')
                
                # Try to parse special values
                if value.lower() in ('true', 'false'):
                    value = value.lower() == 'true'
                elif value.startswith(('{', '[')):
                    try:
                        value = json.loads(value)
                    except:
                        pass
                
                settings[key] = value
        
        return {"settings": settings}
    
    def _flatten_for_toml(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Flatten nested dict for TOML format"""
        flat = {}
        
        def flatten(obj, prefix=''):
            for key, value in obj.items():
                new_key = f"{prefix}.{key}" if prefix else key
                
                if isinstance(value, dict) and key != 'settings':
                    flatten(value, new_key)
                else:
                    flat[new_key] = value
        
        flatten(data)
        return flat
    
    def _indent_xml(self, elem, level=0):
        """Add indentation to XML elements"""
        i = "\n" + level * "  "
        if len(elem):
            if not elem.text or not elem.text.strip():
                elem.text = i + "  "
            if not elem.tail or not elem.tail.strip():
                elem.tail = i
            for elem in elem:
                self._indent_xml(elem, level + 1)
            if not elem.tail or not elem.tail.strip():
                elem.tail = i
        else:
            if level and (not elem.tail or not elem.tail.strip()):
                elem.tail = i
    
    async def _write_zip_file(self, 
                            path: Path, 
                            data: Dict[str, Any], 
                            options: ImportExportOptions):
        """Write settings as ZIP archive with multiple formats"""
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as zf:
            # JSON format
            json_data = await self._format_for_file(data, ExportFormat.JSON, options)
            zf.writestr("settings.json", json_data)
            
            # YAML format
            yaml_data = await self._format_for_file(data, ExportFormat.YAML, options)
            zf.writestr("settings.yaml", yaml_data)
            
            # ENV format
            env_data = await self._format_for_file(data, ExportFormat.ENV, options)
            zf.writestr("settings.env", env_data)
            
            # CSV format
            csv_data = await self._format_for_file(data, ExportFormat.CSV, options)
            zf.writestr("settings.csv", csv_data)
            
            # Add README
            readme = f"""# MeetingMind Settings Export
            
Exported at: {data.get('exported_at', 'unknown')}
Scope: {data.get('scope', 'unknown')}:{data.get('scope_id', 'unknown')}
Format version: {data.get('format_version', '1.0')}

## Files:
- settings.json: JSON format (recommended for re-import)
- settings.yaml: YAML format (human-readable)
- settings.env: Environment variables format
- settings.csv: CSV format (for spreadsheet applications)

## Import:
Use the JSON file for best compatibility when importing back to MeetingMind.
"""
            zf.writestr("README.md", readme)
    
    async def _read_zip_file(self, path: Path) -> Dict[str, Any]:
        """Read settings from ZIP archive"""
        with zipfile.ZipFile(path, 'r') as zf:
            # Try to read JSON first
            if "settings.json" in zf.namelist():
                content = zf.read("settings.json").decode('utf-8')
                return await self._parse_file_content(content, ExportFormat.JSON)
            
            # Fallback to YAML
            elif "settings.yaml" in zf.namelist():
                content = zf.read("settings.yaml").decode('utf-8')
                return await self._parse_file_content(content, ExportFormat.YAML)
            
            else:
                raise ValueError("No supported settings file found in ZIP archive")
    
    async def _get_metadata(self, 
                          scope: SettingsScope, 
                          scope_id: str, 
                          keys: List[str]) -> Dict[str, Any]:
        """Get metadata for settings"""
        settings_manager = get_settings_manager()
        metadata = {}
        
        for key in keys:
            composite_key = settings_manager._make_key(scope, scope_id, key)
            if composite_key in settings_manager.values:
                value_obj = settings_manager.values[composite_key]
                metadata[key] = {
                    "set_by": value_obj.set_by,
                    "set_at": value_obj.set_at.isoformat(),
                    "version": value_obj.version,
                    "source": value_obj.source,
                    "is_valid": value_obj.is_valid
                }
        
        return metadata
    
    def _generate_checksum(self, data: Dict[str, Any]) -> str:
        """Generate checksum for data integrity"""
        json_str = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(json_str.encode()).hexdigest()
    
    async def _restore_backup(self, 
                            backup_data: Dict[str, Any], 
                            scope: SettingsScope, 
                            scope_id: str):
        """Restore settings from backup"""
        options = ImportExportOptions(validation_level=ValidationLevel.LENIENT)
        await self.import_settings(backup_data, scope, scope_id, options)

# Global import/export manager instance
import_export_manager: Optional[SettingsImportExport] = None

def get_import_export_manager() -> SettingsImportExport:
    """Get global import/export manager instance"""
    global import_export_manager
    if import_export_manager is None:
        import_export_manager = SettingsImportExport()
    return import_export_manager