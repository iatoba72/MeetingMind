# Hot-Reload System for Settings
# Advanced hot-reload with dependency tracking and rollback

import asyncio
import json
import hashlib
import time
from typing import Dict, List, Any, Optional, Callable, Set, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
import logging
from enum import Enum
import threading
from contextlib import asynccontextmanager

from .settings_models import SettingsScope, SettingsChangeEvent, settings_registry


class ReloadTrigger(Enum):
    """Triggers for hot-reload"""

    FILE_CHANGE = "file_change"
    API_UPDATE = "api_update"
    SCHEDULED = "scheduled"
    DEPENDENCY = "dependency"
    MANUAL = "manual"


class ReloadState(Enum):
    """States of a reload operation"""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


@dataclass
class ReloadOperation:
    """A hot-reload operation"""

    operation_id: str
    trigger: ReloadTrigger
    affected_keys: Set[str]
    scope: SettingsScope
    scope_id: str

    # State
    state: ReloadState = ReloadState.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Data
    old_values: Dict[str, Any] = field(default_factory=dict)
    new_values: Dict[str, Any] = field(default_factory=dict)

    # Results
    success_count: int = 0
    error_count: int = 0
    errors: List[str] = field(default_factory=list)

    # Metadata
    triggered_by: str = "system"
    batch_id: Optional[str] = None
    dependencies: Set[str] = field(default_factory=set)
    dependents: Set[str] = field(default_factory=set)


@dataclass
class HotReloadConfig:
    """Configuration for hot-reload system"""

    enabled: bool = True
    debounce_delay: float = 1.0  # seconds
    batch_timeout: float = 5.0  # seconds
    max_retries: int = 3
    retry_delay: float = 1.0  # seconds

    # Safety
    enable_rollback: bool = True
    rollback_timeout: float = 30.0  # seconds
    max_concurrent_operations: int = 10

    # Validation
    validate_before_apply: bool = True
    test_mode: bool = False  # Apply changes temporarily

    # Dependencies
    track_dependencies: bool = True
    cascade_updates: bool = True

    # Notifications
    notify_on_success: bool = True
    notify_on_failure: bool = True


class DependencyTracker:
    """Tracks dependencies between settings"""

    def __init__(self):
        self.dependencies: Dict[str, Set[str]] = {}  # key -> set of keys it depends on
        self.dependents: Dict[str, Set[str]] = (
            {}
        )  # key -> set of keys that depend on it
        self.update_functions: Dict[str, List[Callable]] = {}  # key -> update functions
        self.logger = logging.getLogger("DependencyTracker")

    def add_dependency(self, dependent_key: str, dependency_key: str):
        """Add a dependency relationship"""
        if dependent_key not in self.dependencies:
            self.dependencies[dependent_key] = set()
        self.dependencies[dependent_key].add(dependency_key)

        if dependency_key not in self.dependents:
            self.dependents[dependency_key] = set()
        self.dependents[dependency_key].add(dependent_key)

        self.logger.debug(
            f"Added dependency: {dependent_key} depends on {dependency_key}"
        )

    def remove_dependency(self, dependent_key: str, dependency_key: str):
        """Remove a dependency relationship"""
        if dependent_key in self.dependencies:
            self.dependencies[dependent_key].discard(dependency_key)

        if dependency_key in self.dependents:
            self.dependents[dependency_key].discard(dependent_key)

    def get_dependencies(self, key: str) -> Set[str]:
        """Get all dependencies for a key"""
        return self.dependencies.get(key, set()).copy()

    def get_dependents(self, key: str) -> Set[str]:
        """Get all dependents for a key"""
        return self.dependents.get(key, set()).copy()

    def get_cascade_order(self, keys: Set[str]) -> List[List[str]]:
        """Get ordered list of keys for cascading updates"""
        # Topological sort to determine update order
        remaining = keys.copy()
        result = []

        while remaining:
            # Find keys with no dependencies in remaining set
            current_level = []
            for key in remaining:
                deps = self.get_dependencies(key)
                if not (deps & remaining):  # No dependencies in remaining set
                    current_level.append(key)

            if not current_level:
                # Circular dependency detected, process remaining arbitrarily
                self.logger.warning(f"Circular dependency detected in: {remaining}")
                current_level = list(remaining)

            result.append(current_level)
            remaining -= set(current_level)

        return result

    def register_update_function(self, key: str, func: Callable[[Any, Any], None]):
        """Register a function to call when a setting is updated"""
        if key not in self.update_functions:
            self.update_functions[key] = []
        self.update_functions[key].append(func)

    async def notify_update(self, key: str, old_value: Any, new_value: Any):
        """Notify update functions for a key"""
        functions = self.update_functions.get(key, [])
        for func in functions:
            try:
                if asyncio.iscoroutinefunction(func):
                    await func(old_value, new_value)
                else:
                    func(old_value, new_value)
            except Exception as e:
                self.logger.error(f"Error in update function for {key}: {e}")


class HotReloadManager:
    """Manages hot-reload operations with dependency tracking"""

    def __init__(self, config: HotReloadConfig = None):
        self.config = config or HotReloadConfig()
        self.dependency_tracker = DependencyTracker()

        # State
        self.operations: Dict[str, ReloadOperation] = {}
        self.pending_changes: Dict[str, Dict[str, Any]] = {}  # Debounced changes
        self.active_operations: Set[str] = set()

        # Batching
        self.batch_timer: Optional[asyncio.Task] = None
        self.current_batch: Dict[str, Any] = {}

        # Locks
        self.operation_lock = asyncio.Lock()
        self.batch_lock = asyncio.Lock()

        # Callbacks
        self.pre_reload_callbacks: List[Callable] = []
        self.post_reload_callbacks: List[Callable] = []
        self.validation_callbacks: List[Callable] = []

        # Logging
        self.logger = logging.getLogger("HotReloadManager")

        # Statistics
        self.stats = {
            "total_operations": 0,
            "successful_operations": 0,
            "failed_operations": 0,
            "rolled_back_operations": 0,
            "average_reload_time": 0.0,
            "total_reload_time": 0.0,
        }

    def setup_dependencies(self):
        """Setup default dependencies between settings"""
        # Example dependencies based on MeetingMind settings

        # Theme affects other appearance settings
        self.dependency_tracker.add_dependency("font_size", "theme")
        self.dependency_tracker.add_dependency("sidebar_width", "theme")

        # Auto-save depends on collaboration settings
        self.dependency_tracker.add_dependency("show_cursors", "auto_save_interval")
        self.dependency_tracker.add_dependency("show_selections", "auto_save_interval")

        # Recording quality affects storage
        self.dependency_tracker.add_dependency(
            "recording_storage_limit", "recording_quality"
        )

        # Security settings cascade
        self.dependency_tracker.add_dependency("session_timeout", "two_factor_auth")

        # Performance settings
        self.dependency_tracker.add_dependency(
            "cache_duration", "max_concurrent_meetings"
        )

        # AI features interdependencies
        self.dependency_tracker.add_dependency(
            "ai_action_items", "ai_meeting_summaries"
        )
        self.dependency_tracker.add_dependency(
            "ai_sentiment_analysis", "ai_meeting_summaries"
        )

    async def schedule_reload(
        self,
        keys: Set[str],
        scope: SettingsScope,
        scope_id: str,
        trigger: ReloadTrigger = ReloadTrigger.API_UPDATE,
        triggered_by: str = "system",
        force_immediate: bool = False,
    ) -> str:
        """Schedule a hot-reload operation"""

        if not self.config.enabled:
            self.logger.info("Hot-reload is disabled")
            return ""

        operation_id = self._generate_operation_id()

        # Create operation
        operation = ReloadOperation(
            operation_id=operation_id,
            trigger=trigger,
            affected_keys=keys,
            scope=scope,
            scope_id=scope_id,
            triggered_by=triggered_by,
        )

        self.operations[operation_id] = operation

        if force_immediate or trigger == ReloadTrigger.MANUAL:
            # Execute immediately
            await self._execute_operation(operation)
        else:
            # Add to batch
            await self._add_to_batch(operation)

        return operation_id

    async def _add_to_batch(self, operation: ReloadOperation):
        """Add operation to current batch"""
        async with self.batch_lock:
            batch_key = f"{operation.scope.value}:{operation.scope_id}"

            if batch_key not in self.current_batch:
                self.current_batch[batch_key] = {
                    "operations": [],
                    "keys": set(),
                    "started_at": datetime.utcnow(),
                }

            self.current_batch[batch_key]["operations"].append(operation)
            self.current_batch[batch_key]["keys"].update(operation.affected_keys)

            # Start batch timer if not already running
            if not self.batch_timer or self.batch_timer.done():
                self.batch_timer = asyncio.create_task(
                    self._process_batch_after_delay()
                )

    async def _process_batch_after_delay(self):
        """Process batch after delay"""
        await asyncio.sleep(self.config.batch_timeout)

        async with self.batch_lock:
            if self.current_batch:
                await self._process_current_batch()

    async def _process_current_batch(self):
        """Process all operations in current batch"""
        batch = self.current_batch.copy()
        self.current_batch.clear()

        # Process each scope batch
        for batch_key, batch_data in batch.items():
            operations = batch_data["operations"]

            if len(operations) == 1:
                # Single operation
                await self._execute_operation(operations[0])
            else:
                # Merge operations
                merged_operation = await self._merge_operations(operations)
                await self._execute_operation(merged_operation)

    async def _merge_operations(
        self, operations: List[ReloadOperation]
    ) -> ReloadOperation:
        """Merge multiple operations into one"""
        if not operations:
            raise ValueError("No operations to merge")

        # Use first operation as base
        base = operations[0]
        merged_keys = set()

        for op in operations:
            merged_keys.update(op.affected_keys)

        merged = ReloadOperation(
            operation_id=self._generate_operation_id(),
            trigger=base.trigger,
            affected_keys=merged_keys,
            scope=base.scope,
            scope_id=base.scope_id,
            triggered_by=base.triggered_by,
            batch_id=self._generate_batch_id(),
        )

        # Add to operations registry
        self.operations[merged.operation_id] = merged

        return merged

    async def _execute_operation(self, operation: ReloadOperation):
        """Execute a hot-reload operation"""
        if len(self.active_operations) >= self.config.max_concurrent_operations:
            self.logger.warning(
                f"Max concurrent operations reached, queuing {operation.operation_id}"
            )
            # Could implement a queue here
            return

        async with self.operation_lock:
            self.active_operations.add(operation.operation_id)

        operation.state = ReloadState.IN_PROGRESS
        operation.started_at = datetime.utcnow()

        try:
            await self._perform_reload(operation)
            operation.state = ReloadState.COMPLETED
            operation.completed_at = datetime.utcnow()

            self.stats["successful_operations"] += 1

            if self.config.notify_on_success:
                await self._notify_success(operation)

        except Exception as e:
            operation.state = ReloadState.FAILED
            operation.errors.append(str(e))
            operation.completed_at = datetime.utcnow()

            self.stats["failed_operations"] += 1

            self.logger.error(
                f"Hot-reload operation {operation.operation_id} failed: {e}"
            )

            if self.config.enable_rollback:
                await self._attempt_rollback(operation)

            if self.config.notify_on_failure:
                await self._notify_failure(operation)

        finally:
            async with self.operation_lock:
                self.active_operations.discard(operation.operation_id)

            # Update statistics
            if operation.completed_at and operation.started_at:
                reload_time = (
                    operation.completed_at - operation.started_at
                ).total_seconds()
                self.stats["total_reload_time"] += reload_time
                self.stats["total_operations"] += 1
                self.stats["average_reload_time"] = (
                    self.stats["total_reload_time"] / self.stats["total_operations"]
                )

    async def _perform_reload(self, operation: ReloadOperation):
        """Perform the actual reload operation"""
        from .settings_manager import get_settings_manager

        settings_manager = get_settings_manager()

        # Pre-reload validation
        if self.config.validate_before_apply:
            await self._validate_operation(operation)

        # Get affected keys in dependency order
        if self.config.track_dependencies and self.config.cascade_updates:
            # Add dependent keys to the operation
            all_affected = operation.affected_keys.copy()
            for key in operation.affected_keys:
                dependents = self.dependency_tracker.get_dependents(key)
                all_affected.update(dependents)
                operation.dependents.update(dependents)

            # Get update order
            update_levels = self.dependency_tracker.get_cascade_order(all_affected)
        else:
            update_levels = [list(operation.affected_keys)]

        # Store old values for rollback
        for key in operation.affected_keys:
            try:
                old_value = await settings_manager.get_value(
                    key, operation.scope, operation.scope_id, use_hierarchy=False
                )
                operation.old_values[key] = old_value
            except Exception as e:
                self.logger.warning(f"Could not get old value for {key}: {e}")

        # Call pre-reload callbacks
        await self._call_pre_reload_callbacks(operation)

        # Apply changes level by level
        for level in update_levels:
            await self._apply_level_changes(operation, level, settings_manager)

        # Call post-reload callbacks
        await self._call_post_reload_callbacks(operation)

        self.logger.info(
            f"Hot-reload completed for {len(operation.affected_keys)} settings"
        )

    async def _apply_level_changes(
        self, operation: ReloadOperation, keys: List[str], settings_manager
    ):
        """Apply changes for a dependency level"""
        for key in keys:
            try:
                # Get new value
                new_value = await settings_manager.get_value(
                    key, operation.scope, operation.scope_id, use_hierarchy=True
                )

                # Store for rollback
                operation.new_values[key] = new_value

                # Notify dependency tracker
                old_value = operation.old_values.get(key)
                await self.dependency_tracker.notify_update(key, old_value, new_value)

                operation.success_count += 1

            except Exception as e:
                operation.error_count += 1
                operation.errors.append(f"Failed to reload {key}: {str(e)}")
                self.logger.error(f"Failed to reload setting {key}: {e}")

    async def _validate_operation(self, operation: ReloadOperation):
        """Validate operation before applying"""
        for callback in self.validation_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(operation)
                else:
                    callback(operation)
            except Exception as e:
                raise ValueError(f"Validation failed: {e}")

    async def _attempt_rollback(self, operation: ReloadOperation):
        """Attempt to rollback a failed operation"""
        try:
            from .settings_manager import get_settings_manager

            settings_manager = get_settings_manager()

            # Restore old values
            for key, old_value in operation.old_values.items():
                if old_value is not None:
                    await settings_manager.set_value(
                        key=key,
                        value=old_value,
                        scope=operation.scope,
                        scope_id=operation.scope_id,
                        set_by="hot_reload_rollback",
                        source="rollback",
                    )

            operation.state = ReloadState.ROLLED_BACK
            self.stats["rolled_back_operations"] += 1

            self.logger.info(
                f"Successfully rolled back operation {operation.operation_id}"
            )

        except Exception as e:
            self.logger.error(
                f"Failed to rollback operation {operation.operation_id}: {e}"
            )

    async def _call_pre_reload_callbacks(self, operation: ReloadOperation):
        """Call pre-reload callbacks"""
        for callback in self.pre_reload_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(operation)
                else:
                    callback(operation)
            except Exception as e:
                self.logger.error(f"Error in pre-reload callback: {e}")

    async def _call_post_reload_callbacks(self, operation: ReloadOperation):
        """Call post-reload callbacks"""
        for callback in self.post_reload_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(operation)
                else:
                    callback(operation)
            except Exception as e:
                self.logger.error(f"Error in post-reload callback: {e}")

    async def _notify_success(self, operation: ReloadOperation):
        """Notify about successful operation"""
        # Could send webhooks, emails, etc.
        self.logger.info(
            f"Hot-reload operation {operation.operation_id} completed successfully"
        )

    async def _notify_failure(self, operation: ReloadOperation):
        """Notify about failed operation"""
        # Could send alerts, emails, etc.
        self.logger.error(
            f"Hot-reload operation {operation.operation_id} failed with {operation.error_count} errors"
        )

    def _generate_operation_id(self) -> str:
        """Generate unique operation ID"""
        import uuid

        return f"reload_{int(time.time())}_{str(uuid.uuid4())[:8]}"

    def _generate_batch_id(self) -> str:
        """Generate unique batch ID"""
        import uuid

        return f"batch_{int(time.time())}_{str(uuid.uuid4())[:8]}"

    # Public API

    def add_dependency(self, dependent_key: str, dependency_key: str):
        """Add a dependency relationship between settings"""
        self.dependency_tracker.add_dependency(dependent_key, dependency_key)

    def register_update_function(self, key: str, func: Callable):
        """Register a function to call when a setting is updated"""
        self.dependency_tracker.register_update_function(key, func)

    def add_pre_reload_callback(self, callback: Callable):
        """Add a callback to call before reload operations"""
        self.pre_reload_callbacks.append(callback)

    def add_post_reload_callback(self, callback: Callable):
        """Add a callback to call after reload operations"""
        self.post_reload_callbacks.append(callback)

    def add_validation_callback(self, callback: Callable):
        """Add a validation callback"""
        self.validation_callbacks.append(callback)

    def get_operation_status(self, operation_id: str) -> Optional[ReloadOperation]:
        """Get the status of a reload operation"""
        return self.operations.get(operation_id)

    def get_active_operations(self) -> List[ReloadOperation]:
        """Get all active operations"""
        return [self.operations[op_id] for op_id in self.active_operations]

    def get_stats(self) -> Dict[str, Any]:
        """Get hot-reload statistics"""
        return {
            **self.stats,
            "active_operations": len(self.active_operations),
            "total_operations_stored": len(self.operations),
            "config": {
                "enabled": self.config.enabled,
                "debounce_delay": self.config.debounce_delay,
                "batch_timeout": self.config.batch_timeout,
                "max_retries": self.config.max_retries,
                "enable_rollback": self.config.enable_rollback,
                "track_dependencies": self.config.track_dependencies,
                "cascade_updates": self.config.cascade_updates,
            },
        }

    async def force_reload(
        self,
        keys: Set[str],
        scope: SettingsScope,
        scope_id: str,
        triggered_by: str = "manual",
    ) -> str:
        """Force immediate reload of settings"""
        return await self.schedule_reload(
            keys=keys,
            scope=scope,
            scope_id=scope_id,
            trigger=ReloadTrigger.MANUAL,
            triggered_by=triggered_by,
            force_immediate=True,
        )

    async def reload_all(self, scope: SettingsScope, scope_id: str) -> str:
        """Reload all settings for a scope"""
        all_keys = set()
        for definition in settings_registry.get_all():
            if definition.hot_reload:
                all_keys.add(definition.key)

        return await self.force_reload(all_keys, scope, scope_id, "reload_all")

    async def test_reload(
        self, keys: Set[str], scope: SettingsScope, scope_id: str
    ) -> ReloadOperation:
        """Test a reload operation without applying changes"""
        # Create test operation
        operation = ReloadOperation(
            operation_id=self._generate_operation_id(),
            trigger=ReloadTrigger.MANUAL,
            affected_keys=keys,
            scope=scope,
            scope_id=scope_id,
            triggered_by="test",
        )

        # Store original config
        original_test_mode = self.config.test_mode
        self.config.test_mode = True

        try:
            # Perform test reload
            await self._perform_reload(operation)
            operation.state = ReloadState.COMPLETED
        except Exception as e:
            operation.state = ReloadState.FAILED
            operation.errors.append(str(e))
        finally:
            # Restore config
            self.config.test_mode = original_test_mode

        return operation

    async def cleanup_old_operations(self, max_age_hours: int = 24):
        """Clean up old operations from memory"""
        cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)

        to_remove = []
        for op_id, operation in self.operations.items():
            if (
                operation.completed_at
                and operation.completed_at < cutoff_time
                and op_id not in self.active_operations
            ):
                to_remove.append(op_id)

        for op_id in to_remove:
            del self.operations[op_id]

        self.logger.info(f"Cleaned up {len(to_remove)} old reload operations")


# Global hot-reload manager instance
hot_reload_manager: Optional[HotReloadManager] = None


def get_hot_reload_manager() -> HotReloadManager:
    """Get global hot-reload manager instance"""
    global hot_reload_manager
    if hot_reload_manager is None:
        hot_reload_manager = HotReloadManager()
        hot_reload_manager.setup_dependencies()
    return hot_reload_manager


def initialize_hot_reload_manager(config: HotReloadConfig = None) -> HotReloadManager:
    """Initialize global hot-reload manager"""
    global hot_reload_manager
    hot_reload_manager = HotReloadManager(config)
    hot_reload_manager.setup_dependencies()
    return hot_reload_manager
