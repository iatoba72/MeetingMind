# API Endpoints for Settings Import/Export
# RESTful API for importing and exporting settings

from fastapi import APIRouter, HTTPException, File, UploadFile, Query, Body
from fastapi.responses import StreamingResponse, FileResponse
from typing import Dict, List, Any, Optional, Union
from pydantic import BaseModel, Field
from datetime import datetime
import tempfile
import os
from pathlib import Path
import logging

from .import_export import (
    SettingsImportExport, ExportFormat, ImportSource, ValidationLevel,
    ImportExportOptions, ImportExportResult, get_import_export_manager
)
from .settings_models import SettingsScope
from .settings_manager import get_settings_manager

# Pydantic models for API

class ExportOptionsModel(BaseModel):
    """Export options for API"""
    format: ExportFormat = ExportFormat.JSON
    pretty_print: bool = True
    include_metadata: bool = True
    include_defaults: bool = False
    
    categories: Optional[List[str]] = None
    scopes: Optional[List[str]] = None
    keys: Optional[List[str]] = None
    exclude_keys: Optional[List[str]] = None
    exclude_sensitive: bool = True
    
    validation_level: ValidationLevel = ValidationLevel.STRICT
    validate_references: bool = True
    transform_values: bool = True
    
    include_version_info: bool = True
    target_version: Optional[str] = None
    
    compress: bool = False
    conflict_resolution: str = "merge"
    merge_strategy: str = "deep"

class ImportOptionsModel(BaseModel):
    """Import options for API"""
    format: Optional[ExportFormat] = None  # Auto-detect if None
    validation_level: ValidationLevel = ValidationLevel.STRICT
    validate_references: bool = True
    transform_values: bool = True
    
    backup_before_import: bool = True
    dry_run: bool = False
    
    conflict_resolution: str = "merge"
    merge_strategy: str = "deep"

class ImportDataModel(BaseModel):
    """Import data for API"""
    data: Dict[str, Any]
    options: Optional[ImportOptionsModel] = None

class ExportResultModel(BaseModel):
    """Export result for API"""
    success: bool
    format: str
    processed_count: int
    success_count: int
    error_count: int
    warning_count: int
    errors: List[str]
    warnings: List[str]
    started_at: datetime
    completed_at: Optional[datetime]
    duration_seconds: Optional[float]
    checksum: Optional[str]

class ImportResultModel(BaseModel):
    """Import result for API"""
    success: bool
    format: str
    processed_count: int
    success_count: int
    error_count: int
    warning_count: int
    skipped_count: int
    errors: List[str]
    warnings: List[str]
    imported_settings: Dict[str, Any]
    started_at: datetime
    completed_at: Optional[datetime]
    duration_seconds: Optional[float]

# API Router
router = APIRouter(prefix="/api/settings", tags=["Settings Import/Export"])

@router.post("/export/{scope}/{scope_id}")
async def export_settings(
    scope: SettingsScope,
    scope_id: str,
    options: ExportOptionsModel = Body(default=ExportOptionsModel())
) -> ExportResultModel:
    """Export settings for a scope"""
    try:
        import_export = get_import_export_manager()
        
        # Convert Pydantic model to internal options
        export_options = ImportExportOptions(
            format=options.format,
            pretty_print=options.pretty_print,
            include_metadata=options.include_metadata,
            include_defaults=options.include_defaults,
            categories=options.categories,
            scopes=[SettingsScope(s) for s in options.scopes] if options.scopes else None,
            keys=options.keys,
            exclude_keys=options.exclude_keys,
            exclude_sensitive=options.exclude_sensitive,
            validation_level=options.validation_level,
            validate_references=options.validate_references,
            transform_values=options.transform_values,
            include_version_info=options.include_version_info,
            target_version=options.target_version,
            compress=options.compress,
            conflict_resolution=options.conflict_resolution,
            merge_strategy=options.merge_strategy
        )
        
        result = await import_export.export_settings(scope, scope_id, export_options)
        
        return ExportResultModel(
            success=result.success,
            format=result.format.value,
            processed_count=result.processed_count,
            success_count=result.success_count,
            error_count=result.error_count,
            warning_count=result.warning_count,
            errors=result.errors,
            warnings=result.warnings,
            started_at=result.started_at,
            completed_at=result.completed_at,
            duration_seconds=result.duration.total_seconds() if result.duration else None,
            checksum=result.checksum
        )
        
    except Exception as e:
        logging.error(f"Export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@router.post("/export/{scope}/{scope_id}/download")
async def export_settings_file(
    scope: SettingsScope,
    scope_id: str,
    options: ExportOptionsModel = Body(default=ExportOptionsModel())
):
    """Export settings and download as file"""
    try:
        import_export = get_import_export_manager()
        
        # Convert options
        export_options = ImportExportOptions(
            format=options.format,
            pretty_print=options.pretty_print,
            include_metadata=options.include_metadata,
            include_defaults=options.include_defaults,
            categories=options.categories,
            scopes=[SettingsScope(s) for s in options.scopes] if options.scopes else None,
            keys=options.keys,
            exclude_keys=options.exclude_keys,
            exclude_sensitive=options.exclude_sensitive,
            validation_level=options.validation_level,
            validate_references=options.validate_references,
            transform_values=options.transform_values,
            include_version_info=options.include_version_info,
            target_version=options.target_version,
            compress=options.compress,
            conflict_resolution=options.conflict_resolution,
            merge_strategy=options.merge_strategy
        )
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{options.format.value}") as tmp_file:
            result = await import_export.export_to_file(tmp_file.name, scope, scope_id, export_options)
            
            if not result.success:
                os.unlink(tmp_file.name)
                raise HTTPException(status_code=400, detail=f"Export failed: {'; '.join(result.errors)}")
            
            # Determine filename and media type
            filename = f"meetingmind_settings_{scope.value}_{scope_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{options.format.value}"
            
            media_type_map = {
                ExportFormat.JSON: "application/json",
                ExportFormat.YAML: "application/x-yaml",
                ExportFormat.TOML: "application/toml",
                ExportFormat.CSV: "text/csv",
                ExportFormat.XML: "application/xml",
                ExportFormat.ENV: "text/plain",
                ExportFormat.PROPERTIES: "text/plain",
                ExportFormat.ZIP: "application/zip"
            }
            
            media_type = media_type_map.get(options.format, "application/octet-stream")
            
            return FileResponse(
                path=tmp_file.name,
                filename=filename,
                media_type=media_type,
                background=None  # File will be deleted by system cleanup
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Export download failed: {e}")
        raise HTTPException(status_code=500, detail=f"Export download failed: {str(e)}")

@router.post("/import/{scope}/{scope_id}")
async def import_settings(
    scope: SettingsScope,
    scope_id: str,
    data: ImportDataModel
) -> ImportResultModel:
    """Import settings from data"""
    try:
        import_export = get_import_export_manager()
        
        # Convert options
        import_options = ImportExportOptions()
        if data.options:
            import_options.format = data.options.format or ExportFormat.JSON
            import_options.validation_level = data.options.validation_level
            import_options.validate_references = data.options.validate_references
            import_options.transform_values = data.options.transform_values
            import_options.backup_before_import = data.options.backup_before_import
            import_options.dry_run = data.options.dry_run
            import_options.conflict_resolution = data.options.conflict_resolution
            import_options.merge_strategy = data.options.merge_strategy
        
        result = await import_export.import_settings(data.data, scope, scope_id, import_options)
        
        return ImportResultModel(
            success=result.success,
            format=result.format.value,
            processed_count=result.processed_count,
            success_count=result.success_count,
            error_count=result.error_count,
            warning_count=result.warning_count,
            skipped_count=result.skipped_count,
            errors=result.errors,
            warnings=result.warnings,
            imported_settings=result.imported_settings,
            started_at=result.started_at,
            completed_at=result.completed_at,
            duration_seconds=result.duration.total_seconds() if result.duration else None
        )
        
    except Exception as e:
        logging.error(f"Import failed: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

@router.post("/import/{scope}/{scope_id}/upload")
async def import_settings_file(
    scope: SettingsScope,
    scope_id: str,
    file: UploadFile = File(...),
    validation_level: ValidationLevel = Query(ValidationLevel.STRICT),
    backup_before_import: bool = Query(True),
    dry_run: bool = Query(False),
    conflict_resolution: str = Query("merge")
) -> ImportResultModel:
    """Import settings from uploaded file"""
    try:
        import_export = get_import_export_manager()
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Set up import options
            import_options = ImportExportOptions(
                validation_level=validation_level,
                backup_before_import=backup_before_import,
                dry_run=dry_run,
                conflict_resolution=conflict_resolution
            )
            
            try:
                result = await import_export.import_from_file(
                    tmp_file.name, scope, scope_id, import_options
                )
                
                return ImportResultModel(
                    success=result.success,
                    format=result.format.value,
                    processed_count=result.processed_count,
                    success_count=result.success_count,
                    error_count=result.error_count,
                    warning_count=result.warning_count,
                    skipped_count=result.skipped_count,
                    errors=result.errors,
                    warnings=result.warnings,
                    imported_settings=result.imported_settings,
                    started_at=result.started_at,
                    completed_at=result.completed_at,
                    duration_seconds=result.duration.total_seconds() if result.duration else None
                )
                
            finally:
                # Clean up temporary file
                os.unlink(tmp_file.name)
                
    except Exception as e:
        logging.error(f"Import upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Import upload failed: {str(e)}")

@router.get("/formats")
async def get_supported_formats():
    """Get list of supported import/export formats"""
    return {
        "export_formats": [
            {
                "value": format.value,
                "name": format.value.upper(),
                "description": _get_format_description(format),
                "file_extension": f".{format.value}",
                "supports_metadata": format in [ExportFormat.JSON, ExportFormat.YAML, ExportFormat.XML, ExportFormat.ZIP]
            }
            for format in ExportFormat
        ],
        "validation_levels": [
            {
                "value": level.value,
                "name": level.value.title(),
                "description": _get_validation_description(level)
            }
            for level in ValidationLevel
        ]
    }

@router.get("/export/{scope}/{scope_id}/preview")
async def preview_export(
    scope: SettingsScope,
    scope_id: str,
    format: ExportFormat = Query(ExportFormat.JSON),
    include_metadata: bool = Query(True),
    exclude_sensitive: bool = Query(True),
    keys: Optional[str] = Query(None),  # Comma-separated list
    categories: Optional[str] = Query(None)  # Comma-separated list
):
    """Preview export without actually exporting"""
    try:
        import_export = get_import_export_manager()
        
        # Parse query parameters
        key_list = keys.split(',') if keys else None
        category_list = categories.split(',') if categories else None
        
        options = ImportExportOptions(
            format=format,
            include_metadata=include_metadata,
            exclude_sensitive=exclude_sensitive,
            keys=key_list,
            categories=category_list,
            dry_run=True
        )
        
        result = await import_export.export_settings(scope, scope_id, options)
        
        # Return preview data (limited)
        preview_data = result.exported_data or {}
        if 'settings' in preview_data:
            # Limit preview to first 10 settings
            settings = preview_data['settings']
            if len(settings) > 10:
                limited_settings = dict(list(settings.items())[:10])
                limited_settings['_preview_note'] = f"Showing 10 of {len(settings)} settings"
                preview_data['settings'] = limited_settings
        
        return {
            "success": result.success,
            "format": format.value,
            "processed_count": result.processed_count,
            "errors": result.errors,
            "preview_data": preview_data
        }
        
    except Exception as e:
        logging.error(f"Export preview failed: {e}")
        raise HTTPException(status_code=500, detail=f"Export preview failed: {str(e)}")

@router.post("/validate")
async def validate_import_data(
    data: Dict[str, Any] = Body(...),
    validation_level: ValidationLevel = Query(ValidationLevel.STRICT)
):
    """Validate import data without importing"""
    try:
        import_export = get_import_export_manager()
        
        # Use validator directly
        validation_errors = import_export.validator.validate_import_data(
            data.get('settings', data),
            ImportExportOptions(validation_level=validation_level)
        )
        
        return {
            "valid": len(validation_errors) == 0,
            "errors": validation_errors,
            "settings_count": len(data.get('settings', data)),
            "validation_level": validation_level.value
        }
        
    except Exception as e:
        logging.error(f"Validation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")

@router.get("/templates/{template_name}")
async def get_export_template(template_name: str):
    """Get predefined export templates"""
    templates = {
        "minimal": {
            "format": ExportFormat.JSON.value,
            "include_metadata": False,
            "include_defaults": False,
            "exclude_sensitive": True,
            "categories": ["appearance", "notifications"]
        },
        "complete": {
            "format": ExportFormat.ZIP.value,
            "include_metadata": True,
            "include_defaults": True,
            "exclude_sensitive": False,
            "validation_level": ValidationLevel.STRICT.value
        },
        "user_preferences": {
            "format": ExportFormat.JSON.value,
            "include_metadata": True,
            "exclude_sensitive": True,
            "categories": ["appearance", "notifications", "accessibility"],
            "scopes": ["user"]
        },
        "team_config": {
            "format": ExportFormat.YAML.value,
            "include_metadata": True,
            "exclude_sensitive": True,
            "scopes": ["team", "organization"],
            "categories": ["collaboration", "recording", "transcription"]
        }
    }
    
    if template_name not in templates:
        raise HTTPException(status_code=404, detail=f"Template '{template_name}' not found")
    
    return templates[template_name]

# Helper functions

def _get_format_description(format: ExportFormat) -> str:
    """Get description for export format"""
    descriptions = {
        ExportFormat.JSON: "JSON format - recommended for re-importing",
        ExportFormat.YAML: "YAML format - human-readable configuration",
        ExportFormat.TOML: "TOML format - configuration file format",
        ExportFormat.CSV: "CSV format - for spreadsheet applications",
        ExportFormat.XML: "XML format - structured markup",
        ExportFormat.ENV: "Environment variables format",
        ExportFormat.PROPERTIES: "Java properties format",
        ExportFormat.ZIP: "ZIP archive with multiple formats"
    }
    return descriptions.get(format, "Unknown format")

def _get_validation_description(level: ValidationLevel) -> str:
    """Get description for validation level"""
    descriptions = {
        ValidationLevel.STRICT: "Fail on any validation error",
        ValidationLevel.LENIENT: "Warn on validation errors but continue",
        ValidationLevel.SKIP: "Skip validation entirely"
    }
    return descriptions.get(level, "Unknown validation level")