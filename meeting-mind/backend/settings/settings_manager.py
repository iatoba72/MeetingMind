# Settings Manager
# Core settings management with hierarchical resolution and hot-reload

import asyncio
import json
import os
import hashlib
import uuid
from typing import Dict, List, Any, Optional, Union, Callable, Set
from datetime import datetime, timedelta
from pathlib import Path
from dataclasses import asdict
from contextlib import asynccontextmanager
import logging
import threading
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from .settings_models import (
    SettingsScope, SettingsDefinition, SettingsValue, SettingsSnapshot,
    SettingsChangeEvent, SettingsRegistry, SettingsMigration,
    settings_registry
)

class SettingsFileWatcher(FileSystemEventHandler):
    """File system watcher for hot-reload of settings files"""
    
    def __init__(self, settings_manager: 'SettingsManager'):
        super().__init__()
        self.settings_manager = settings_manager
        self.logger = logging.getLogger("SettingsFileWatcher")
        self.debounce_time = 1.0  # Debounce file changes
        self.pending_changes = {}
    
    def on_modified(self, event):
        """Handle file modification events"""
        if event.is_directory:
            return
        
        file_path = Path(event.src_path)
        
        # Only watch settings files
        if not (file_path.suffix in ['.json', '.yaml', '.yml'] and 
                any(pattern in file_path.name for pattern in ['settings', 'config'])):
            return
        
        # Debounce rapid file changes
        current_time = time.time()
        if file_path in self.pending_changes:
            if current_time - self.pending_changes[file_path] < self.debounce_time:
                return
        
        self.pending_changes[file_path] = current_time
        
        # Schedule reload
        asyncio.create_task(self._handle_file_change(file_path))
    
    async def _handle_file_change(self, file_path: Path):
        """Handle file change with debouncing"""
        await asyncio.sleep(self.debounce_time)
        
        self.logger.info(f"Settings file changed: {file_path}")
        try:
            await self.settings_manager.reload_from_file(str(file_path))
        except Exception as e:
            self.logger.error(f"Failed to reload settings from {file_path}: {e}")

class SettingsCache:
    """Cache for resolved settings values with TTL"""
    
    def __init__(self, default_ttl: int = 300):  # 5 minutes default TTL
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.ttl: Dict[str, datetime] = {}
        self.default_ttl = default_ttl
        self.lock = threading.RLock()
    
    def get(self, scope: SettingsScope, scope_id: str, key: str) -> Optional[Any]:
        """Get cached value"""
        with self.lock:
            cache_key = f"{scope.value}:{scope_id}:{key}"
            
            # Check if expired
            if cache_key in self.ttl and datetime.utcnow() > self.ttl[cache_key]:
                self._remove(cache_key)
                return None
            
            return self.cache.get(cache_key)
    
    def set(self, scope: SettingsScope, scope_id: str, key: str, value: Any, ttl: Optional[int] = None):
        """Set cached value"""
        with self.lock:
            cache_key = f"{scope.value}:{scope_id}:{key}"
            self.cache[cache_key] = value
            
            ttl_seconds = ttl or self.default_ttl
            self.ttl[cache_key] = datetime.utcnow() + timedelta(seconds=ttl_seconds)
    
    def invalidate(self, scope: Optional[SettingsScope] = None, scope_id: Optional[str] = None, key: Optional[str] = None):
        """Invalidate cache entries"""
        with self.lock:
            keys_to_remove = []
            
            for cache_key in self.cache.keys():
                parts = cache_key.split(":")
                if len(parts) != 3:
                    continue
                
                cached_scope, cached_scope_id, cached_key = parts
                
                match = True
                if scope and cached_scope != scope.value:
                    match = False
                if scope_id and cached_scope_id != scope_id:
                    match = False
                if key and cached_key != key:
                    match = False
                
                if match:
                    keys_to_remove.append(cache_key)
            
            for cache_key in keys_to_remove:
                self._remove(cache_key)
    
    def _remove(self, cache_key: str):
        """Remove cache entry"""
        self.cache.pop(cache_key, None)
        self.ttl.pop(cache_key, None)
    
    def clear(self):
        """Clear all cache"""
        with self.lock:
            self.cache.clear()
            self.ttl.clear()
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        with self.lock:
            return {
                "total_entries": len(self.cache),
                "expired_entries": sum(1 for expire_time in self.ttl.values() 
                                     if datetime.utcnow() > expire_time)
            }

class SettingsManager:
    """Main settings manager with hierarchical resolution and hot-reload"""
    
    def __init__(self, 
                 config_dir: str = "config",
                 enable_hot_reload: bool = True,
                 enable_cache: bool = True,
                 cache_ttl: int = 300):
        
        self.config_dir = Path(config_dir)
        self.enable_hot_reload = enable_hot_reload
        self.enable_cache = enable_cache
        
        # Storage
        self.values: Dict[str, SettingsValue] = {}  # Flat storage by composite key
        self.snapshots: Dict[str, SettingsSnapshot] = {}
        self.migrations: List[SettingsMigration] = []
        
        # Cache
        self.cache = SettingsCache(cache_ttl) if enable_cache else None
        
        # Hot-reload
        self.file_observer: Optional[Observer] = None
        self.file_watcher: Optional[SettingsFileWatcher] = None
        
        # Event handling
        self.change_listeners: List[Callable[[SettingsChangeEvent], None]] = []
        self.hot_reload_listeners: List[Callable[[str, Any, Any], None]] = []
        
        # Logging
        self.logger = logging.getLogger("SettingsManager")
        
        # Hierarchy order (highest to lowest priority)
        self.scope_hierarchy = [
            SettingsScope.SESSION,
            SettingsScope.USER,
            SettingsScope.TEAM,
            SettingsScope.ORGANIZATION,
            SettingsScope.GLOBAL
        ]
        
        self._ensure_config_directory()
        if self.enable_hot_reload:
            self._setup_file_watcher()
    
    def _ensure_config_directory(self):
        """Ensure configuration directory exists"""
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        # Create scope directories
        for scope in SettingsScope:
            scope_dir = self.config_dir / scope.value
            scope_dir.mkdir(exist_ok=True)
    
    def _setup_file_watcher(self):
        """Setup file system watcher for hot-reload"""
        if self.file_observer:
            return
        
        self.file_watcher = SettingsFileWatcher(self)
        self.file_observer = Observer()
        self.file_observer.schedule(
            self.file_watcher,
            str(self.config_dir),
            recursive=True
        )
        self.file_observer.start()
        self.logger.info("Settings file watcher started")
    
    def _teardown_file_watcher(self):
        """Teardown file system watcher"""
        if self.file_observer:
            self.file_observer.stop()
            self.file_observer.join()
            self.file_observer = None
            self.file_watcher = None
            self.logger.info("Settings file watcher stopped")
    
    def _make_key(self, scope: SettingsScope, scope_id: str, key: str) -> str:
        """Create composite key for storage"""
        return f"{scope.value}:{scope_id}:{key}"
    
    def _parse_key(self, composite_key: str) -> tuple[SettingsScope, str, str]:
        """Parse composite key"""
        parts = composite_key.split(":", 2)
        if len(parts) != 3:
            raise ValueError(f"Invalid composite key: {composite_key}")
        
        scope = SettingsScope(parts[0])
        scope_id = parts[1]
        key = parts[2]
        
        return scope, scope_id, key
    
    async def set_value(self, 
                       key: str, 
                       value: Any,
                       scope: SettingsScope,
                       scope_id: str,
                       set_by: str = "system",
                       source: str = "manual") -> bool:
        """Set a settings value"""
        
        # Validate against definition
        definition = settings_registry.get_definition(key)
        if definition:
            valid, errors = definition.validate_value(value)
            if not valid:
                self.logger.error(f"Validation failed for {key}: {errors}")
                return False
        
        # Get current value for change event
        old_value = await self.get_value(key, scope, scope_id)
        
        # Create settings value
        composite_key = self._make_key(scope, scope_id, key)
        
        # Update version if exists
        version = 1
        if composite_key in self.values:
            version = self.values[composite_key].version + 1
        
        settings_value = SettingsValue(
            key=key,
            value=value,
            scope=scope,
            scope_id=scope_id,
            set_by=set_by,
            set_at=datetime.utcnow(),
            source=source,
            version=version,
            previous_value=old_value,
            is_valid=True,
            validation_errors=[]
        )
        
        # Store value
        self.values[composite_key] = settings_value
        
        # Invalidate cache
        if self.cache:
            self.cache.invalidate(key=key)
        
        # Create change event
        change_event = SettingsChangeEvent(
            key=key,
            old_value=old_value,
            new_value=value,
            scope=scope,
            scope_id=scope_id,
            changed_by=set_by,
            source=source,
            requires_restart=definition.requires_restart if definition else False,
            hot_reload=definition.hot_reload if definition else True
        )
        
        # Notify listeners
        await self._notify_change_listeners(change_event)
        
        # Handle hot-reload
        if definition and definition.hot_reload:
            await self._handle_hot_reload(key, old_value, value)
        
        # Persist to file
        await self._persist_value(settings_value)
        
        self.logger.info(f"Set {key} = {value} in {scope.value}:{scope_id}")
        return True
    
    async def get_value(self, 
                       key: str,
                       scope: SettingsScope,
                       scope_id: str,
                       use_hierarchy: bool = True) -> Any:
        """Get a settings value with hierarchical resolution"""
        
        # Check cache first
        if self.cache:
            cached = self.cache.get(scope, scope_id, key)
            if cached is not None:
                return cached
        
        # If not using hierarchy, just get direct value
        if not use_hierarchy:
            composite_key = self._make_key(scope, scope_id, key)
            if composite_key in self.values:
                value = self.values[composite_key].value
                if self.cache:
                    self.cache.set(scope, scope_id, key, value)
                return value
            return None
        
        # Hierarchical resolution
        value = await self._resolve_hierarchical_value(key, scope, scope_id)
        
        # Cache result
        if self.cache and value is not None:
            self.cache.set(scope, scope_id, key, value)
        
        return value
    
    async def _resolve_hierarchical_value(self, key: str, scope: SettingsScope, scope_id: str) -> Any:
        """Resolve value using scope hierarchy"""
        definition = settings_registry.get_definition(key)
        
        # Check if setting is inheritable
        if definition and not definition.inheritable:
            # Non-inheritable, only check exact scope
            composite_key = self._make_key(scope, scope_id, key)
            if composite_key in self.values:
                return self.values[composite_key].value
            return definition.default_value
        
        # Check hierarchy starting from current scope
        scope_index = self.scope_hierarchy.index(scope) if scope in self.scope_hierarchy else 0
        
        for i in range(scope_index, len(self.scope_hierarchy)):
            current_scope = self.scope_hierarchy[i]
            
            # Determine scope_id for current level
            current_scope_id = self._get_scope_id_for_hierarchy(
                scope_id, scope, current_scope
            )
            
            composite_key = self._make_key(current_scope, current_scope_id, key)
            if composite_key in self.values:
                return self.values[composite_key].value
        
        # Return default value if not found anywhere
        return definition.default_value if definition else None
    
    def _get_scope_id_for_hierarchy(self, original_scope_id: str, original_scope: SettingsScope, target_scope: SettingsScope) -> str:
        """Get appropriate scope_id for hierarchy level"""
        if target_scope == SettingsScope.GLOBAL:
            return "global"
        elif target_scope == SettingsScope.ORGANIZATION:
            # Extract organization from original scope_id
            if ":" in original_scope_id:
                return original_scope_id.split(":")[0]
            return "default_org"
        elif target_scope == SettingsScope.TEAM:
            # Extract team from original scope_id
            if ":" in original_scope_id:
                parts = original_scope_id.split(":")
                return f"{parts[0]}:{parts[1]}" if len(parts) > 1 else parts[0]
            return original_scope_id
        else:
            return original_scope_id
    
    async def get_all_values(self, scope: SettingsScope, scope_id: str) -> Dict[str, Any]:
        """Get all settings values for a scope"""
        result = {}
        
        # Get all definitions
        definitions = settings_registry.get_all()
        
        for definition in definitions:
            value = await self.get_value(definition.key, scope, scope_id)
            if value is not None:
                result[definition.key] = value
        
        return result
    
    async def delete_value(self, key: str, scope: SettingsScope, scope_id: str, deleted_by: str = "system") -> bool:
        """Delete a settings value"""
        composite_key = self._make_key(scope, scope_id, key)
        
        if composite_key not in self.values:
            return False
        
        old_value = self.values[composite_key].value
        del self.values[composite_key]
        
        # Invalidate cache
        if self.cache:
            self.cache.invalidate(scope=scope, scope_id=scope_id, key=key)
        
        # Create change event
        change_event = SettingsChangeEvent(
            key=key,
            old_value=old_value,
            new_value=None,
            scope=scope,
            scope_id=scope_id,
            changed_by=deleted_by,
            source="deletion"
        )
        
        # Notify listeners
        await self._notify_change_listeners(change_event)
        
        # Remove persisted file
        await self._remove_persisted_value(scope, scope_id, key)
        
        self.logger.info(f"Deleted {key} from {scope.value}:{scope_id}")
        return True
    
    async def create_snapshot(self, 
                             name: str,
                             description: str,
                             scope: SettingsScope,
                             scope_id: str,
                             created_by: str = "system",
                             tags: List[str] = None) -> str:
        """Create a settings snapshot"""
        
        snapshot_id = str(uuid.uuid4())
        
        # Get all current values for scope
        settings = await self.get_all_values(scope, scope_id)
        
        snapshot = SettingsSnapshot(
            snapshot_id=snapshot_id,
            name=name,
            description=description,
            scope=scope,
            scope_id=scope_id,
            settings=settings,
            created_by=created_by,
            tags=tags or []
        )
        
        self.snapshots[snapshot_id] = snapshot
        
        # Persist snapshot
        await self._persist_snapshot(snapshot)
        
        self.logger.info(f"Created snapshot {snapshot_id}: {name}")
        return snapshot_id
    
    async def restore_snapshot(self, snapshot_id: str, restored_by: str = "system") -> bool:
        """Restore settings from a snapshot"""
        if snapshot_id not in self.snapshots:
            return False
        
        snapshot = self.snapshots[snapshot_id]
        
        # Apply all settings from snapshot
        for key, value in snapshot.settings.items():
            await self.set_value(
                key=key,
                value=value,
                scope=snapshot.scope,
                scope_id=snapshot.scope_id,
                set_by=restored_by,
                source="snapshot_restore"
            )
        
        self.logger.info(f"Restored snapshot {snapshot_id}")
        return True
    
    async def export_settings(self, 
                             scope: SettingsScope,
                             scope_id: str,
                             format: str = "json",
                             include_metadata: bool = True) -> Dict[str, Any]:
        """Export settings to dictionary"""
        
        # Get all values
        settings = await self.get_all_values(scope, scope_id)
        
        export_data = {
            "format_version": "1.0",
            "exported_at": datetime.utcnow().isoformat(),
            "scope": scope.value,
            "scope_id": scope_id,
            "settings": settings
        }
        
        if include_metadata:
            metadata = {}
            for key in settings.keys():
                composite_key = self._make_key(scope, scope_id, key)
                if composite_key in self.values:
                    value_obj = self.values[composite_key]
                    metadata[key] = {
                        "set_by": value_obj.set_by,
                        "set_at": value_obj.set_at.isoformat(),
                        "version": value_obj.version,
                        "source": value_obj.source
                    }
            export_data["metadata"] = metadata
        
        return export_data
    
    async def import_settings(self, 
                             data: Dict[str, Any],
                             scope: SettingsScope,
                             scope_id: str,
                             imported_by: str = "system",
                             merge: bool = True) -> bool:
        """Import settings from dictionary"""
        
        try:
            if not merge:
                # Clear existing settings
                await self.clear_scope(scope, scope_id)
            
            settings = data.get("settings", {})
            
            for key, value in settings.items():
                await self.set_value(
                    key=key,
                    value=value,
                    scope=scope,
                    scope_id=scope_id,
                    set_by=imported_by,
                    source="import"
                )
            
            self.logger.info(f"Imported {len(settings)} settings to {scope.value}:{scope_id}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to import settings: {e}")
            return False
    
    async def clear_scope(self, scope: SettingsScope, scope_id: str) -> int:
        """Clear all settings for a scope"""
        keys_to_remove = []
        
        for composite_key in self.values.keys():
            stored_scope, stored_scope_id, _ = self._parse_key(composite_key)
            if stored_scope == scope and stored_scope_id == scope_id:
                keys_to_remove.append(composite_key)
        
        for composite_key in keys_to_remove:
            del self.values[composite_key]
        
        # Invalidate cache
        if self.cache:
            self.cache.invalidate(scope=scope, scope_id=scope_id)
        
        self.logger.info(f"Cleared {len(keys_to_remove)} settings from {scope.value}:{scope_id}")
        return len(keys_to_remove)
    
    async def validate_all(self, scope: SettingsScope, scope_id: str) -> Dict[str, List[str]]:
        """Validate all settings in a scope"""
        errors = {}
        
        for composite_key, settings_value in self.values.items():
            stored_scope, stored_scope_id, key = self._parse_key(composite_key)
            
            if stored_scope == scope and stored_scope_id == scope_id:
                valid, validation_errors = settings_registry.validate_value(key, settings_value.value)
                if not valid:
                    errors[key] = validation_errors
        
        return errors
    
    def add_change_listener(self, listener: Callable[[SettingsChangeEvent], None]):
        """Add a change event listener"""
        self.change_listeners.append(listener)
    
    def remove_change_listener(self, listener: Callable[[SettingsChangeEvent], None]):
        """Remove a change event listener"""
        if listener in self.change_listeners:
            self.change_listeners.remove(listener)
    
    def add_hot_reload_listener(self, listener: Callable[[str, Any, Any], None]):
        """Add a hot-reload listener"""
        self.hot_reload_listeners.append(listener)
    
    async def _notify_change_listeners(self, event: SettingsChangeEvent):
        """Notify all change listeners"""
        for listener in self.change_listeners:
            try:
                if asyncio.iscoroutinefunction(listener):
                    await listener(event)
                else:
                    listener(event)
            except Exception as e:
                self.logger.error(f"Error in change listener: {e}")
    
    async def _handle_hot_reload(self, key: str, old_value: Any, new_value: Any):
        """Handle hot-reload for a setting"""
        for listener in self.hot_reload_listeners:
            try:
                if asyncio.iscoroutinefunction(listener):
                    await listener(key, old_value, new_value)
                else:
                    listener(key, old_value, new_value)
            except Exception as e:
                self.logger.error(f"Error in hot-reload listener: {e}")
    
    async def reload_from_file(self, file_path: str):
        """Reload settings from a configuration file"""
        try:
            path = Path(file_path)
            
            # Determine scope from file path
            scope, scope_id = self._parse_file_path(path)
            
            # Load and parse file
            with open(path, 'r') as f:
                if path.suffix == '.json':
                    data = json.load(f)
                else:
                    # Add YAML support if needed
                    raise ValueError(f"Unsupported file format: {path.suffix}")
            
            # Import settings
            await self.import_settings({"settings": data}, scope, scope_id, "file_reload")
            
        except Exception as e:
            self.logger.error(f"Failed to reload from file {file_path}: {e}")
            raise
    
    def _parse_file_path(self, path: Path) -> tuple[SettingsScope, str]:
        """Parse scope and scope_id from file path"""
        relative_path = path.relative_to(self.config_dir)
        parts = relative_path.parts
        
        if len(parts) >= 2:
            scope_name = parts[0]
            scope_id = parts[1].replace(path.suffix, "")
            
            try:
                scope = SettingsScope(scope_name)
                return scope, scope_id
            except ValueError:
                pass
        
        # Default to global scope
        return SettingsScope.GLOBAL, "global"
    
    async def _persist_value(self, settings_value: SettingsValue):
        """Persist a settings value to file"""
        if not self.config_dir:
            return
        
        scope_dir = self.config_dir / settings_value.scope.value
        scope_dir.mkdir(exist_ok=True)
        
        file_path = scope_dir / f"{settings_value.scope_id}.json"
        
        # Load existing data
        data = {}
        if file_path.exists():
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
            except Exception:
                data = {}
        
        # Update with new value
        data[settings_value.key] = settings_value.value
        
        # Write back
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2, default=str)
    
    async def _remove_persisted_value(self, scope: SettingsScope, scope_id: str, key: str):
        """Remove a persisted value from file"""
        if not self.config_dir:
            return
        
        file_path = self.config_dir / scope.value / f"{scope_id}.json"
        
        if file_path.exists():
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                
                if key in data:
                    del data[key]
                    
                    with open(file_path, 'w') as f:
                        json.dump(data, f, indent=2, default=str)
            except Exception as e:
                self.logger.error(f"Failed to remove persisted value: {e}")
    
    async def _persist_snapshot(self, snapshot: SettingsSnapshot):
        """Persist a snapshot to file"""
        if not self.config_dir:
            return
        
        snapshots_dir = self.config_dir / "snapshots"
        snapshots_dir.mkdir(exist_ok=True)
        
        file_path = snapshots_dir / f"{snapshot.snapshot_id}.json"
        
        with open(file_path, 'w') as f:
            json.dump(snapshot.to_dict(), f, indent=2, default=str)
    
    async def load_snapshots(self):
        """Load all snapshots from files"""
        snapshots_dir = self.config_dir / "snapshots"
        if not snapshots_dir.exists():
            return
        
        for file_path in snapshots_dir.glob("*.json"):
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                
                snapshot = SettingsSnapshot.from_dict(data)
                self.snapshots[snapshot.snapshot_id] = snapshot
                
            except Exception as e:
                self.logger.error(f"Failed to load snapshot from {file_path}: {e}")
    
    async def shutdown(self):
        """Shutdown the settings manager"""
        self.logger.info("Shutting down settings manager")
        
        # Stop file watcher
        self._teardown_file_watcher()
        
        # Clear cache
        if self.cache:
            self.cache.clear()
        
        self.logger.info("Settings manager shutdown complete")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get settings manager statistics"""
        stats = {
            "total_values": len(self.values),
            "total_snapshots": len(self.snapshots),
            "registered_definitions": len(settings_registry._definitions),
            "change_listeners": len(self.change_listeners),
            "hot_reload_listeners": len(self.hot_reload_listeners),
            "hot_reload_enabled": self.enable_hot_reload,
            "cache_enabled": self.enable_cache
        }
        
        if self.cache:
            stats["cache"] = self.cache.get_stats()
        
        # Count by scope
        scope_counts = {}
        for composite_key in self.values.keys():
            scope, _, _ = self._parse_key(composite_key)
            scope_counts[scope.value] = scope_counts.get(scope.value, 0) + 1
        
        stats["by_scope"] = scope_counts
        
        return stats

# Global settings manager instance
settings_manager: Optional[SettingsManager] = None

def get_settings_manager() -> SettingsManager:
    """Get global settings manager instance"""
    global settings_manager
    if settings_manager is None:
        settings_manager = SettingsManager()
    return settings_manager

def initialize_settings_manager(**kwargs) -> SettingsManager:
    """Initialize global settings manager"""
    global settings_manager
    settings_manager = SettingsManager(**kwargs)
    return settings_manager