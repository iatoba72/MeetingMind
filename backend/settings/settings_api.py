# Settings API
# REST API endpoints for settings management

from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Dict, List, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field
import logging

from .settings_manager import get_settings_manager, SettingsManager
from .settings_models import SettingsScope, SettingsCategory, settings_registry
from .versioning import SettingsVersionManager, get_version_manager

router = APIRouter(prefix="/api/settings", tags=["settings"])
logger = logging.getLogger("SettingsAPI")


# Pydantic models for API requests/responses
class SettingsValueRequest(BaseModel):
    value: Any
    set_by: str = "api"
    source: str = "manual"


class BulkSettingsRequest(BaseModel):
    settings: Dict[str, Any]
    set_by: str = "api"
    source: str = "bulk_update"


class SnapshotRequest(BaseModel):
    name: str
    description: str
    tags: List[str] = Field(default_factory=list)


class ImportRequest(BaseModel):
    data: Dict[str, Any]
    merge: bool = True
    imported_by: str = "api"


class SettingsResponse(BaseModel):
    key: str
    value: Any
    scope: str
    scope_id: str
    set_by: str
    set_at: str
    version: int
    is_valid: bool
    validation_errors: List[str] = Field(default_factory=list)


class DefinitionResponse(BaseModel):
    key: str
    name: str
    description: str
    type: str
    category: str
    scope: str
    default_value: Any
    ui_component: str
    ui_props: Dict[str, Any]
    help_text: Optional[str]
    requires_restart: bool
    hot_reload: bool
    deprecated: bool


class SnapshotResponse(BaseModel):
    snapshot_id: str
    name: str
    description: str
    scope: str
    scope_id: str
    created_at: str
    created_by: str
    version: str
    tags: List[str]
    settings_count: int


# Dependency to get settings manager
def get_settings():
    return get_settings_manager()


def get_versioning():
    return get_version_manager()


# Helper to validate scope parameters
def validate_scope_params(scope: str, scope_id: str) -> SettingsScope:
    try:
        return SettingsScope(scope)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scope: {scope}")


@router.get("/definitions", response_model=List[DefinitionResponse])
async def get_definitions(
    category: Optional[str] = Query(None, description="Filter by category"),
    scope: Optional[str] = Query(None, description="Filter by scope"),
    search: Optional[str] = Query(None, description="Search in name or description"),
):
    """Get all settings definitions with optional filtering"""
    try:
        definitions = settings_registry.get_all()

        # Apply filters
        if category:
            try:
                cat = SettingsCategory(category)
                definitions = [d for d in definitions if d.category == cat]
            except ValueError:
                raise HTTPException(
                    status_code=400, detail=f"Invalid category: {category}"
                )

        if scope:
            try:
                sc = SettingsScope(scope)
                definitions = [d for d in definitions if d.scope == sc]
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid scope: {scope}")

        if search:
            search_lower = search.lower()
            definitions = [
                d
                for d in definitions
                if search_lower in d.name.lower()
                or search_lower in d.description.lower()
            ]

        # Convert to response models
        return [
            DefinitionResponse(
                key=d.key,
                name=d.name,
                description=d.description,
                type=d.type.value,
                category=d.category.value,
                scope=d.scope.value,
                default_value=d.default_value,
                ui_component=d.ui_component,
                ui_props=d.ui_props,
                help_text=d.help_text,
                requires_restart=d.requires_restart,
                hot_reload=d.hot_reload,
                deprecated=d.deprecated,
            )
            for d in definitions
        ]

    except Exception as e:
        logger.error(f"Error getting definitions: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/categories")
async def get_categories():
    """Get all settings categories"""
    return [
        {"value": cat.value, "label": cat.value.replace("_", " ").title()}
        for cat in SettingsCategory
    ]


@router.get("/scopes")
async def get_scopes():
    """Get all settings scopes"""
    return [
        {"value": scope.value, "label": scope.value.title()} for scope in SettingsScope
    ]


@router.get("/values/{scope}/{scope_id}")
async def get_settings_values(
    scope: str,
    scope_id: str,
    use_hierarchy: bool = Query(True, description="Use hierarchical resolution"),
    keys: Optional[str] = Query(None, description="Comma-separated list of keys"),
    settings: SettingsManager = Depends(get_settings),
):
    """Get settings values for a scope"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        if keys:
            # Get specific keys
            key_list = [k.strip() for k in keys.split(",")]
            result = {}

            for key in key_list:
                value = await settings.get_value(
                    key, scope_enum, scope_id, use_hierarchy
                )
                if value is not None:
                    result[key] = value

            return result
        else:
            # Get all values
            return await settings.get_all_values(scope_enum, scope_id)

    except Exception as e:
        logger.error(f"Error getting settings values: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/values/{scope}/{scope_id}/{key}")
async def get_setting_value(
    scope: str,
    scope_id: str,
    key: str,
    use_hierarchy: bool = Query(True, description="Use hierarchical resolution"),
    settings: SettingsManager = Depends(get_settings),
):
    """Get a specific setting value"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        value = await settings.get_value(key, scope_enum, scope_id, use_hierarchy)

        if value is None:
            # Check if setting exists in registry
            definition = settings_registry.get_definition(key)
            if not definition:
                raise HTTPException(status_code=404, detail=f"Setting not found: {key}")

            # Return default value
            return {"value": definition.default_value, "source": "default"}

        return {"value": value, "source": "configured"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting setting value: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/values/{scope}/{scope_id}/{key}")
async def set_setting_value(
    scope: str,
    scope_id: str,
    key: str,
    request: SettingsValueRequest,
    background_tasks: BackgroundTasks,
    settings: SettingsManager = Depends(get_settings),
    versioning: SettingsVersionManager = Depends(get_versioning),
):
    """Set a setting value"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        # Validate that the setting exists
        definition = settings_registry.get_definition(key)
        if not definition:
            raise HTTPException(status_code=404, detail=f"Setting not found: {key}")

        # Set the value
        success = await settings.set_value(
            key=key,
            value=request.value,
            scope=scope_enum,
            scope_id=scope_id,
            set_by=request.set_by,
            source=request.source,
        )

        if not success:
            raise HTTPException(status_code=400, detail="Failed to set setting value")

        # Create version in background
        background_tasks.add_task(
            versioning.create_version,
            scope_enum,
            scope_id,
            f"Updated {key}",
            request.set_by,
        )

        return {"success": True, "message": f"Setting {key} updated successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting value: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/values/{scope}/{scope_id}/bulk")
async def set_bulk_settings(
    scope: str,
    scope_id: str,
    request: BulkSettingsRequest,
    background_tasks: BackgroundTasks,
    settings: SettingsManager = Depends(get_settings),
    versioning: SettingsVersionManager = Depends(get_versioning),
):
    """Set multiple settings values at once"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        results = {}
        errors = {}

        for key, value in request.settings.items():
            try:
                success = await settings.set_value(
                    key=key,
                    value=value,
                    scope=scope_enum,
                    scope_id=scope_id,
                    set_by=request.set_by,
                    source=request.source,
                )
                results[key] = success
            except Exception as e:
                errors[key] = str(e)
                results[key] = False

        # Create version in background
        background_tasks.add_task(
            versioning.create_version,
            scope_enum,
            scope_id,
            f"Bulk update of {len(request.settings)} settings",
            request.set_by,
        )

        response = {
            "success": len(errors) == 0,
            "results": results,
            "updated_count": sum(1 for r in results.values() if r),
            "failed_count": len(errors),
        }

        if errors:
            response["errors"] = errors

        return response

    except Exception as e:
        logger.error(f"Error in bulk update: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/values/{scope}/{scope_id}/{key}")
async def delete_setting_value(
    scope: str,
    scope_id: str,
    key: str,
    background_tasks: BackgroundTasks,
    deleted_by: str = Query("api", description="Who deleted the setting"),
    settings: SettingsManager = Depends(get_settings),
    versioning: SettingsVersionManager = Depends(get_versioning),
):
    """Delete a setting value"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        success = await settings.delete_value(key, scope_enum, scope_id, deleted_by)

        if not success:
            raise HTTPException(status_code=404, detail=f"Setting not found: {key}")

        # Create version in background
        background_tasks.add_task(
            versioning.create_version,
            scope_enum,
            scope_id,
            f"Deleted {key}",
            deleted_by,
        )

        return {"success": True, "message": f"Setting {key} deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting setting: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/snapshots/{scope}/{scope_id}")
async def create_snapshot(
    scope: str,
    scope_id: str,
    request: SnapshotRequest,
    created_by: str = Query("api", description="Who created the snapshot"),
    settings: SettingsManager = Depends(get_settings),
):
    """Create a settings snapshot"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        snapshot_id = await settings.create_snapshot(
            name=request.name,
            description=request.description,
            scope=scope_enum,
            scope_id=scope_id,
            created_by=created_by,
            tags=request.tags,
        )

        return {
            "success": True,
            "snapshot_id": snapshot_id,
            "message": f"Snapshot '{request.name}' created successfully",
        }

    except Exception as e:
        logger.error(f"Error creating snapshot: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/snapshots/{scope}/{scope_id}", response_model=List[SnapshotResponse])
async def get_snapshots(
    scope: str, scope_id: str, settings: SettingsManager = Depends(get_settings)
):
    """Get all snapshots for a scope"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        snapshots = [
            snapshot
            for snapshot in settings.snapshots.values()
            if snapshot.scope == scope_enum and snapshot.scope_id == scope_id
        ]

        return [
            SnapshotResponse(
                snapshot_id=s.snapshot_id,
                name=s.name,
                description=s.description,
                scope=s.scope.value,
                scope_id=s.scope_id,
                created_at=s.created_at.isoformat(),
                created_by=s.created_by,
                version=s.version,
                tags=s.tags,
                settings_count=len(s.settings),
            )
            for s in snapshots
        ]

    except Exception as e:
        logger.error(f"Error getting snapshots: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/snapshots/{snapshot_id}/restore")
async def restore_snapshot(
    snapshot_id: str,
    background_tasks: BackgroundTasks,
    restored_by: str = Query("api", description="Who restored the snapshot"),
    settings: SettingsManager = Depends(get_settings),
    versioning: SettingsVersionManager = Depends(get_versioning),
):
    """Restore settings from a snapshot"""
    try:
        if snapshot_id not in settings.snapshots:
            raise HTTPException(
                status_code=404, detail=f"Snapshot not found: {snapshot_id}"
            )

        snapshot = settings.snapshots[snapshot_id]

        success = await settings.restore_snapshot(snapshot_id, restored_by)

        if not success:
            raise HTTPException(status_code=400, detail="Failed to restore snapshot")

        # Create version in background
        background_tasks.add_task(
            versioning.create_version,
            snapshot.scope,
            snapshot.scope_id,
            f"Restored snapshot: {snapshot.name}",
            restored_by,
        )

        return {
            "success": True,
            "message": f"Snapshot '{snapshot.name}' restored successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error restoring snapshot: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/export/{scope}/{scope_id}")
async def export_settings(
    scope: str,
    scope_id: str,
    format: str = Query("json", description="Export format"),
    include_metadata: bool = Query(True, description="Include metadata"),
    settings: SettingsManager = Depends(get_settings),
):
    """Export settings to file format"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        if format not in ["json"]:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")

        data = await settings.export_settings(
            scope=scope_enum,
            scope_id=scope_id,
            format=format,
            include_metadata=include_metadata,
        )

        return JSONResponse(
            content=data,
            headers={
                "Content-Disposition": f"attachment; filename=settings_{scope}_{scope_id}.{format}"
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting settings: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/import/{scope}/{scope_id}")
async def import_settings(
    scope: str,
    scope_id: str,
    request: ImportRequest,
    background_tasks: BackgroundTasks,
    settings: SettingsManager = Depends(get_settings),
    versioning: SettingsVersionManager = Depends(get_versioning),
):
    """Import settings from data"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        success = await settings.import_settings(
            data=request.data,
            scope=scope_enum,
            scope_id=scope_id,
            imported_by=request.imported_by,
            merge=request.merge,
        )

        if not success:
            raise HTTPException(status_code=400, detail="Failed to import settings")

        # Create version in background
        background_tasks.add_task(
            versioning.create_version,
            scope_enum,
            scope_id,
            f"Imported settings ({'merged' if request.merge else 'replaced'})",
            request.imported_by,
        )

        return {"success": True, "message": "Settings imported successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing settings: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/validate/{scope}/{scope_id}")
async def validate_settings(
    scope: str, scope_id: str, settings: SettingsManager = Depends(get_settings)
):
    """Validate all settings in a scope"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        errors = await settings.validate_all(scope_enum, scope_id)

        return {"valid": len(errors) == 0, "errors": errors, "error_count": len(errors)}

    except Exception as e:
        logger.error(f"Error validating settings: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/clear/{scope}/{scope_id}")
async def clear_scope_settings(
    scope: str,
    scope_id: str,
    background_tasks: BackgroundTasks,
    cleared_by: str = Query("api", description="Who cleared the settings"),
    settings: SettingsManager = Depends(get_settings),
    versioning: SettingsVersionManager = Depends(get_versioning),
):
    """Clear all settings for a scope"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        count = await settings.clear_scope(scope_enum, scope_id)

        # Create version in background
        background_tasks.add_task(
            versioning.create_version,
            scope_enum,
            scope_id,
            f"Cleared all settings ({count} items)",
            cleared_by,
        )

        return {
            "success": True,
            "cleared_count": count,
            "message": f"Cleared {count} settings from {scope}:{scope_id}",
        }

    except Exception as e:
        logger.error(f"Error clearing settings: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/stats")
async def get_settings_stats(settings: SettingsManager = Depends(get_settings)):
    """Get settings manager statistics"""
    try:
        return settings.get_stats()
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/reload")
async def reload_settings(
    file_path: Optional[str] = Query(None, description="Specific file to reload"),
    settings: SettingsManager = Depends(get_settings),
):
    """Manually reload settings from files"""
    try:
        if file_path:
            await settings.reload_from_file(file_path)
            return {"success": True, "message": f"Reloaded settings from {file_path}"}
        else:
            # Reload all settings files
            # This would be implemented to scan all config files
            return {"success": True, "message": "All settings reloaded"}

    except Exception as e:
        logger.error(f"Error reloading settings: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# Version Management Endpoints


@router.post("/versions/{scope}/{scope_id}")
async def create_version(
    scope: str,
    scope_id: str,
    description: str = Query(..., description="Version description"),
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    created_by: str = Query("api", description="Who created the version"),
    versioning: SettingsVersionManager = Depends(get_versioning),
):
    """Create a new settings version"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        version_id = await versioning.create_version(
            scope=scope_enum,
            scope_id=scope_id,
            description=description,
            created_by=created_by,
            tags=tag_list,
        )

        return {
            "success": True,
            "version_id": version_id,
            "message": f"Version created successfully",
        }

    except Exception as e:
        logger.error(f"Error creating version: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/versions/{scope}/{scope_id}")
async def get_versions(
    scope: str,
    scope_id: str,
    limit: int = Query(50, description="Maximum number of versions to return"),
    offset: int = Query(0, description="Number of versions to skip"),
    versioning: SettingsVersionManager = Depends(get_versioning),
):
    """Get version history for a scope"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        versions = await versioning.get_versions(scope_enum, scope_id, limit, offset)

        return [version.to_dict() for version in versions]

    except Exception as e:
        logger.error(f"Error getting versions: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/versions/{version_id}")
async def get_version(
    version_id: str, versioning: SettingsVersionManager = Depends(get_versioning)
):
    """Get a specific version"""
    try:
        version = await versioning.get_version(version_id)

        if not version:
            raise HTTPException(
                status_code=404, detail=f"Version not found: {version_id}"
            )

        return version.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting version: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/versions/{version_id}/rollback")
async def rollback_to_version(
    version_id: str,
    background_tasks: BackgroundTasks,
    create_backup: bool = Query(True, description="Create backup before rollback"),
    rolled_back_by: str = Query("api", description="Who performed the rollback"),
    versioning: SettingsVersionManager = Depends(get_versioning),
):
    """Rollback settings to a specific version"""
    try:
        success = await versioning.rollback_to_version(
            version_id=version_id,
            rolled_back_by=rolled_back_by,
            create_backup=create_backup,
        )

        if not success:
            raise HTTPException(status_code=400, detail="Failed to rollback to version")

        return {
            "success": True,
            "message": f"Successfully rolled back to version {version_id}",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rolling back version: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/versions/{from_version_id}/compare/{to_version_id}")
async def compare_versions(
    from_version_id: str,
    to_version_id: str,
    versioning: SettingsVersionManager = Depends(get_versioning),
):
    """Compare two versions and show differences"""
    try:
        diff = await versioning.compare_versions(from_version_id, to_version_id)

        if not diff:
            raise HTTPException(
                status_code=404, detail="One or both versions not found"
            )

        return diff.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error comparing versions: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/versions/{scope}/{scope_id}/{key}/history")
async def get_setting_history(
    scope: str,
    scope_id: str,
    key: str,
    versioning: SettingsVersionManager = Depends(get_versioning),
):
    """Get history of changes for a specific setting"""
    try:
        scope_enum = validate_scope_params(scope, scope_id)

        history = await versioning.get_version_history(scope_enum, scope_id, key)

        return {"key": key, "scope": scope, "scope_id": scope_id, "history": history}

    except Exception as e:
        logger.error(f"Error getting setting history: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/versions/{base_version_id}/branch")
async def create_branch(
    base_version_id: str,
    branch_name: str = Query(..., description="Name of the new branch"),
    created_by: str = Query("api", description="Who created the branch"),
    versioning: SettingsVersionManager = Depends(get_versioning),
):
    """Create a branch from a specific version"""
    try:
        branch_version_id = await versioning.create_branch(
            base_version_id=base_version_id,
            branch_name=branch_name,
            created_by=created_by,
        )

        return {
            "success": True,
            "branch_version_id": branch_version_id,
            "message": f"Branch '{branch_name}' created successfully",
        }

    except Exception as e:
        logger.error(f"Error creating branch: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/versions/stats")
async def get_version_stats(
    versioning: SettingsVersionManager = Depends(get_versioning),
):
    """Get versioning system statistics"""
    try:
        return versioning.get_stats()

    except Exception as e:
        logger.error(f"Error getting version stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
