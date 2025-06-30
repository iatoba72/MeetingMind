# Plugin Manager with Hot-Reloading
# Advanced plugin management system with security, lifecycle management, and hot-reloading

import os
import sys
import json
import asyncio
import importlib
import importlib.util
from pathlib import Path
from typing import Dict, List, Optional, Any, Set
from datetime import datetime
import logging
import threading
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import shutil
import zipfile
import tempfile
from dataclasses import dataclass, field

from plugin_api import (
    BasePlugin,
    PluginManifest,
    PluginContext,
    PluginCapability,
    PluginEventType,
    PluginEvent,
    PluginResult,
    plugin_api,
)
from plugin_system.plugin_security import (
    PluginSandbox,
    SecurityPolicy,
    PluginSecurityManager,
)
from enum import Enum


class PluginState(Enum):
    """Plugin lifecycle states"""

    UNKNOWN = "unknown"
    LOADING = "loading"
    LOADED = "loaded"
    INITIALIZING = "initializing"
    ACTIVE = "active"
    ERROR = "error"
    STOPPING = "stopping"
    STOPPED = "stopped"
    UNLOADING = "unloading"
    UNLOADED = "unloaded"


@dataclass
class PluginInfo:
    """Plugin information and metadata"""

    id: str
    name: str
    version: str
    manifest: PluginManifest
    state: PluginState = PluginState.UNKNOWN
    plugin_instance: Optional[BasePlugin] = None
    context: Optional[PluginContext] = None

    # File system information
    plugin_path: Path = None
    manifest_path: Path = None

    # Runtime information
    loaded_at: Optional[datetime] = None
    last_modified: Optional[datetime] = None
    error_message: Optional[str] = None
    load_count: int = 0

    # Dependencies
    dependencies: List[str] = field(default_factory=list)
    dependents: List[str] = field(default_factory=list)

    # Security
    security_policy: Optional[SecurityPolicy] = None
    sandbox: Optional[PluginSandbox] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses"""
        return {
            "id": self.id,
            "name": self.name,
            "version": self.version,
            "state": self.state.value,
            "manifest": self.manifest.to_dict() if self.manifest else None,
            "loaded_at": self.loaded_at.isoformat() if self.loaded_at else None,
            "last_modified": (
                self.last_modified.isoformat() if self.last_modified else None
            ),
            "error_message": self.error_message,
            "load_count": self.load_count,
            "dependencies": self.dependencies,
            "dependents": self.dependents,
            "plugin_path": str(self.plugin_path) if self.plugin_path else None,
        }


class PluginFileWatcher(FileSystemEventHandler):
    """File system watcher for hot-reloading plugins"""

    def __init__(self, plugin_manager: "PluginManager"):
        super().__init__()
        self.plugin_manager = plugin_manager
        self.debounce_time = 1.0  # Debounce file changes
        self.pending_changes = {}

    def on_modified(self, event):
        """Handle file modification events"""
        if event.is_directory:
            return

        file_path = Path(event.src_path)

        # Only watch Python files and manifest files
        if not (file_path.suffix == ".py" or file_path.name == "manifest.json"):
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

        # Find plugin that owns this file
        plugin_info = self.plugin_manager._find_plugin_by_file(file_path)
        if plugin_info:
            self.plugin_manager.logger.info(
                f"File changed: {file_path}, reloading plugin: {plugin_info.id}"
            )
            await self.plugin_manager.reload_plugin(plugin_info.id)


class PluginDependencyResolver:
    """Resolves plugin dependencies and load order"""

    def __init__(self):
        self.dependency_graph = {}

    def add_plugin(self, plugin_id: str, dependencies: List[str]):
        """Add plugin to dependency graph"""
        self.dependency_graph[plugin_id] = dependencies

    def remove_plugin(self, plugin_id: str):
        """Remove plugin from dependency graph"""
        if plugin_id in self.dependency_graph:
            del self.dependency_graph[plugin_id]

        # Remove from other plugins' dependencies
        for deps in self.dependency_graph.values():
            if plugin_id in deps:
                deps.remove(plugin_id)

    def get_load_order(self) -> List[str]:
        """Get topologically sorted load order"""
        visited = set()
        temp_visited = set()
        result = []

        def visit(plugin_id: str):
            if plugin_id in temp_visited:
                raise ValueError(f"Circular dependency detected involving {plugin_id}")

            if plugin_id not in visited:
                temp_visited.add(plugin_id)

                for dep in self.dependency_graph.get(plugin_id, []):
                    if dep in self.dependency_graph:  # Only visit if dependency exists
                        visit(dep)

                temp_visited.remove(plugin_id)
                visited.add(plugin_id)
                result.append(plugin_id)

        for plugin_id in self.dependency_graph:
            if plugin_id not in visited:
                visit(plugin_id)

        return result

    def get_dependents(self, plugin_id: str) -> List[str]:
        """Get plugins that depend on the given plugin"""
        dependents = []
        for pid, deps in self.dependency_graph.items():
            if plugin_id in deps:
                dependents.append(pid)
        return dependents


class PluginManager:
    """Main plugin manager with hot-reloading and lifecycle management"""

    def __init__(
        self, plugins_directory: str = "plugins", enable_hot_reload: bool = True
    ):
        self.plugins_directory = Path(plugins_directory)
        self.enable_hot_reload = enable_hot_reload

        # Plugin registry
        self.plugins: Dict[str, PluginInfo] = {}
        self.dependency_resolver = PluginDependencyResolver()

        # Security manager
        self.security_manager = PluginSecurityManager()

        # Hot-reloading
        self.file_observer = None
        self.file_watcher = None

        # Logging
        self.logger = logging.getLogger("PluginManager")

        # Events
        self._event_callbacks = {}

        # Initialize
        self._ensure_plugins_directory()
        if self.enable_hot_reload:
            self._setup_file_watcher()

    def _ensure_plugins_directory(self):
        """Ensure plugins directory exists"""
        self.plugins_directory.mkdir(parents=True, exist_ok=True)

    def _setup_file_watcher(self):
        """Setup file system watcher for hot-reloading"""
        if self.file_observer:
            return

        self.file_watcher = PluginFileWatcher(self)
        self.file_observer = Observer()
        self.file_observer.schedule(
            self.file_watcher, str(self.plugins_directory), recursive=True
        )
        self.file_observer.start()
        self.logger.info("Plugin file watcher started")

    def _teardown_file_watcher(self):
        """Teardown file system watcher"""
        if self.file_observer:
            self.file_observer.stop()
            self.file_observer.join()
            self.file_observer = None
            self.file_watcher = None
            self.logger.info("Plugin file watcher stopped")

    def _find_plugin_by_file(self, file_path: Path) -> Optional[PluginInfo]:
        """Find plugin that owns a specific file"""
        for plugin_info in self.plugins.values():
            if plugin_info.plugin_path and file_path.is_relative_to(
                plugin_info.plugin_path
            ):
                return plugin_info
        return None

    async def discover_plugins(self) -> List[str]:
        """Discover all plugins in the plugins directory"""
        discovered = []

        for plugin_dir in self.plugins_directory.iterdir():
            if not plugin_dir.is_dir():
                continue

            manifest_path = plugin_dir / "manifest.json"
            if not manifest_path.exists():
                self.logger.warning(
                    f"Plugin directory {plugin_dir.name} missing manifest.json"
                )
                continue

            try:
                plugin_id = await self._load_plugin_manifest(plugin_dir)
                if plugin_id:
                    discovered.append(plugin_id)
            except Exception as e:
                self.logger.error(f"Failed to discover plugin in {plugin_dir}: {e}")

        return discovered

    async def _load_plugin_manifest(self, plugin_dir: Path) -> Optional[str]:
        """Load plugin manifest from directory"""
        manifest_path = plugin_dir / "manifest.json"

        try:
            with open(manifest_path, "r") as f:
                manifest_data = json.load(f)

            # Validate manifest
            from plugin_api import validate_manifest

            errors = validate_manifest(manifest_data)
            if errors:
                self.logger.error(f"Invalid manifest for {plugin_dir.name}: {errors}")
                return None

            # Create manifest object
            manifest = PluginManifest(
                **{
                    k: v
                    for k, v in manifest_data.items()
                    if k in PluginManifest.__dataclass_fields__
                }
            )

            # Convert string capabilities to enums
            manifest.capabilities = [
                PluginCapability(cap) for cap in manifest_data.get("capabilities", [])
            ]
            manifest.optional_capabilities = [
                PluginCapability(cap)
                for cap in manifest_data.get("optional_capabilities", [])
            ]
            manifest.event_hooks = [
                PluginEventType(hook) for hook in manifest_data.get("event_hooks", [])
            ]

            plugin_id = f"{manifest.name}@{manifest.version}"

            # Create plugin info
            plugin_info = PluginInfo(
                id=plugin_id,
                name=manifest.name,
                version=manifest.version,
                manifest=manifest,
                plugin_path=plugin_dir,
                manifest_path=manifest_path,
                last_modified=datetime.fromtimestamp(manifest_path.stat().st_mtime),
                dependencies=manifest.plugin_dependencies,
            )

            self.plugins[plugin_id] = plugin_info
            self.dependency_resolver.add_plugin(plugin_id, manifest.plugin_dependencies)

            return plugin_id

        except Exception as e:
            self.logger.error(f"Failed to load manifest from {manifest_path}: {e}")
            return None

    async def load_plugin(self, plugin_id: str) -> bool:
        """Load and initialize a specific plugin"""
        if plugin_id not in self.plugins:
            self.logger.error(f"Plugin {plugin_id} not found")
            return False

        plugin_info = self.plugins[plugin_id]

        try:
            # Update state
            plugin_info.state = PluginState.LOADING

            # Check dependencies
            missing_deps = self._check_dependencies(plugin_info)
            if missing_deps:
                raise Exception(f"Missing dependencies: {missing_deps}")

            # Create security policy
            plugin_info.security_policy = self.security_manager.create_policy(
                plugin_info.manifest
            )

            # Create sandbox
            plugin_info.sandbox = PluginSandbox(
                plugin_info.plugin_path, plugin_info.security_policy
            )

            # Load plugin module
            plugin_module = await self._load_plugin_module(plugin_info)
            if not plugin_module:
                raise Exception("Failed to load plugin module")

            # Create plugin context
            context = PluginContext(
                plugin_id=plugin_id, capabilities=plugin_info.manifest.capabilities
            )

            # Apply configuration
            config = plugin_info.manifest.default_config.copy()
            context._config = config

            # Create plugin instance
            plugin_class = getattr(plugin_module, plugin_info.manifest.main_class)
            plugin_instance = plugin_class(context)

            # Store references
            plugin_info.plugin_instance = plugin_instance
            plugin_info.context = context
            plugin_info.state = PluginState.LOADED

            # Initialize plugin
            plugin_info.state = PluginState.INITIALIZING
            success = await plugin_instance.initialize()

            if success:
                plugin_info.state = PluginState.ACTIVE
                plugin_info.loaded_at = datetime.utcnow()
                plugin_info.load_count += 1

                # Register with plugin API
                plugin_api.register_plugin(plugin_instance, context)

                # Update dependents
                for dependent_id in self.dependency_resolver.get_dependents(plugin_id):
                    if dependent_id in self.plugins:
                        self.plugins[dependent_id].dependencies = [
                            dep
                            for dep in self.plugins[dependent_id].dependencies
                            if dep != plugin_id
                        ]

                self.logger.info(f"Plugin {plugin_id} loaded successfully")
                await self._emit_plugin_event("plugin.loaded", plugin_id)
                return True
            else:
                plugin_info.state = PluginState.ERROR
                plugin_info.error_message = "Plugin initialization failed"
                return False

        except Exception as e:
            plugin_info.state = PluginState.ERROR
            plugin_info.error_message = str(e)
            self.logger.error(f"Failed to load plugin {plugin_id}: {e}")
            await self._emit_plugin_event(
                "plugin.load_failed", plugin_id, {"error": str(e)}
            )
            return False

    def _check_dependencies(self, plugin_info: PluginInfo) -> List[str]:
        """Check if plugin dependencies are satisfied"""
        missing = []
        for dep in plugin_info.dependencies:
            if dep not in self.plugins or self.plugins[dep].state != PluginState.ACTIVE:
                missing.append(dep)
        return missing

    async def _load_plugin_module(self, plugin_info: PluginInfo):
        """Load plugin Python module"""
        entry_point = plugin_info.plugin_path / plugin_info.manifest.entry_point

        if not entry_point.exists():
            raise Exception(f"Entry point {entry_point} not found")

        # Create module spec
        spec = importlib.util.spec_from_file_location(
            f"plugin_{plugin_info.id}", entry_point
        )

        if not spec or not spec.loader:
            raise Exception("Failed to create module spec")

        # Load module in sandbox
        try:
            with plugin_info.sandbox:
                module = importlib.util.module_from_spec(spec)
                sys.modules[spec.name] = module
                spec.loader.exec_module(module)
                return module
        except Exception as e:
            if spec.name in sys.modules:
                del sys.modules[spec.name]
            raise e

    async def unload_plugin(self, plugin_id: str) -> bool:
        """Unload a plugin"""
        if plugin_id not in self.plugins:
            return False

        plugin_info = self.plugins[plugin_id]

        try:
            plugin_info.state = PluginState.STOPPING

            # Check dependents
            dependents = self.dependency_resolver.get_dependents(plugin_id)
            if dependents:
                active_dependents = [
                    dep
                    for dep in dependents
                    if dep in self.plugins
                    and self.plugins[dep].state == PluginState.ACTIVE
                ]
                if active_dependents:
                    raise Exception(
                        f"Cannot unload: active dependents {active_dependents}"
                    )

            # Cleanup plugin
            if plugin_info.plugin_instance:
                await plugin_info.plugin_instance.cleanup()

            # Unregister from API
            plugin_api.unregister_plugin(plugin_id)

            # Clean up module
            module_name = f"plugin_{plugin_id}"
            if module_name in sys.modules:
                del sys.modules[module_name]

            # Update state
            plugin_info.state = PluginState.UNLOADED
            plugin_info.plugin_instance = None
            plugin_info.context = None

            self.logger.info(f"Plugin {plugin_id} unloaded successfully")
            await self._emit_plugin_event("plugin.unloaded", plugin_id)
            return True

        except Exception as e:
            plugin_info.state = PluginState.ERROR
            plugin_info.error_message = str(e)
            self.logger.error(f"Failed to unload plugin {plugin_id}: {e}")
            return False

    async def reload_plugin(self, plugin_id: str) -> bool:
        """Reload a plugin (unload then load)"""
        if plugin_id not in self.plugins:
            return False

        # Store current state
        was_active = self.plugins[plugin_id].state == PluginState.ACTIVE

        # Unload
        if was_active:
            success = await self.unload_plugin(plugin_id)
            if not success:
                return False

        # Reload manifest
        plugin_info = self.plugins[plugin_id]
        await self._load_plugin_manifest(plugin_info.plugin_path.parent)

        # Load again
        if was_active:
            return await self.load_plugin(plugin_id)

        return True

    async def load_all_plugins(self) -> Dict[str, bool]:
        """Load all discovered plugins in dependency order"""
        results = {}

        # Discover plugins first
        await self.discover_plugins()

        # Get load order
        try:
            load_order = self.dependency_resolver.get_load_order()
        except ValueError as e:
            self.logger.error(f"Dependency resolution failed: {e}")
            return results

        # Load in order
        for plugin_id in load_order:
            if plugin_id in self.plugins:
                results[plugin_id] = await self.load_plugin(plugin_id)

        return results

    async def unload_all_plugins(self) -> Dict[str, bool]:
        """Unload all plugins in reverse dependency order"""
        results = {}

        # Get reverse load order
        try:
            load_order = self.dependency_resolver.get_load_order()
            unload_order = list(reversed(load_order))
        except ValueError:
            # If dependency resolution fails, unload in any order
            unload_order = list(self.plugins.keys())

        # Unload in reverse order
        for plugin_id in unload_order:
            if (
                plugin_id in self.plugins
                and self.plugins[plugin_id].state == PluginState.ACTIVE
            ):
                results[plugin_id] = await self.unload_plugin(plugin_id)

        return results

    async def install_plugin(self, plugin_path: str, force: bool = False) -> str:
        """Install plugin from file or directory"""
        source_path = Path(plugin_path)

        if not source_path.exists():
            raise FileNotFoundError(f"Plugin source not found: {plugin_path}")

        # Handle different source types
        if source_path.is_file() and source_path.suffix == ".zip":
            return await self._install_from_zip(source_path, force)
        elif source_path.is_dir():
            return await self._install_from_directory(source_path, force)
        else:
            raise ValueError("Plugin source must be a directory or .zip file")

    async def _install_from_zip(self, zip_path: Path, force: bool) -> str:
        """Install plugin from ZIP file"""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Extract ZIP
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(temp_path)

            # Find plugin directory (should contain manifest.json)
            plugin_dir = None
            for item in temp_path.iterdir():
                if item.is_dir() and (item / "manifest.json").exists():
                    plugin_dir = item
                    break

            if not plugin_dir:
                raise ValueError("ZIP file does not contain a valid plugin")

            return await self._install_from_directory(plugin_dir, force)

    async def _install_from_directory(self, source_dir: Path, force: bool) -> str:
        """Install plugin from directory"""
        # Load manifest to get plugin info
        manifest_path = source_dir / "manifest.json"
        if not manifest_path.exists():
            raise ValueError("Plugin directory missing manifest.json")

        with open(manifest_path, "r") as f:
            manifest_data = json.load(f)

        plugin_name = manifest_data["name"]
        plugin_version = manifest_data["version"]
        plugin_id = f"{plugin_name}@{plugin_version}"

        # Check if already installed
        target_dir = self.plugins_directory / plugin_name
        if target_dir.exists() and not force:
            raise ValueError(
                f"Plugin {plugin_name} already installed. Use force=True to overwrite."
            )

        # Security check
        security_check = self.security_manager.validate_plugin(source_dir)
        if not security_check.safe:
            raise SecurityError(
                f"Plugin failed security check: {security_check.issues}"
            )

        # Copy plugin files
        if target_dir.exists():
            shutil.rmtree(target_dir)

        shutil.copytree(source_dir, target_dir)

        # Discover and register
        await self._load_plugin_manifest(target_dir)

        self.logger.info(f"Plugin {plugin_id} installed successfully")
        await self._emit_plugin_event("plugin.installed", plugin_id)

        return plugin_id

    async def uninstall_plugin(self, plugin_id: str) -> bool:
        """Uninstall a plugin"""
        if plugin_id not in self.plugins:
            return False

        plugin_info = self.plugins[plugin_id]

        # Unload if active
        if plugin_info.state == PluginState.ACTIVE:
            await self.unload_plugin(plugin_id)

        # Remove files
        if plugin_info.plugin_path and plugin_info.plugin_path.exists():
            shutil.rmtree(plugin_info.plugin_path)

        # Remove from registry
        del self.plugins[plugin_id]
        self.dependency_resolver.remove_plugin(plugin_id)

        self.logger.info(f"Plugin {plugin_id} uninstalled successfully")
        await self._emit_plugin_event("plugin.uninstalled", plugin_id)

        return True

    def get_plugin_info(self, plugin_id: str) -> Optional[PluginInfo]:
        """Get plugin information"""
        return self.plugins.get(plugin_id)

    def list_plugins(self) -> List[PluginInfo]:
        """List all plugins"""
        return list(self.plugins.values())

    def get_plugins_by_state(self, state: PluginState) -> List[PluginInfo]:
        """Get plugins by state"""
        return [info for info in self.plugins.values() if info.state == state]

    async def _emit_plugin_event(
        self, event_type: str, plugin_id: str, data: Dict[str, Any] = None
    ):
        """Emit plugin management event"""
        if event_type in self._event_callbacks:
            for callback in self._event_callbacks[event_type]:
                try:
                    await callback(plugin_id, data or {})
                except Exception as e:
                    self.logger.error(f"Error in plugin event callback: {e}")

    def on_plugin_event(self, event_type: str, callback: Callable):
        """Register callback for plugin management events"""
        if event_type not in self._event_callbacks:
            self._event_callbacks[event_type] = []
        self._event_callbacks[event_type].append(callback)

    async def shutdown(self):
        """Shutdown plugin manager"""
        self.logger.info("Shutting down plugin manager")

        # Unload all plugins
        await self.unload_all_plugins()

        # Stop file watcher
        self._teardown_file_watcher()

        # Clear registry
        self.plugins.clear()

        self.logger.info("Plugin manager shutdown complete")


# Global plugin manager instance
plugin_manager = None


def get_plugin_manager() -> PluginManager:
    """Get global plugin manager instance"""
    global plugin_manager
    if plugin_manager is None:
        plugin_manager = PluginManager()
    return plugin_manager


def initialize_plugin_manager(
    plugins_directory: str = "plugins", enable_hot_reload: bool = True
) -> PluginManager:
    """Initialize global plugin manager"""
    global plugin_manager
    plugin_manager = PluginManager(plugins_directory, enable_hot_reload)
    return plugin_manager
