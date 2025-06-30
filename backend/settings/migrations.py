# Settings Migration System
# Handle schema changes and data migrations for settings

import asyncio
import json
import logging
from typing import Dict, List, Any, Optional, Callable, Type
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from abc import ABC, abstractmethod
import semver

from .settings_models import SettingsMigration, SettingsScope
from .settings_manager import SettingsManager


@dataclass
class MigrationResult:
    """Result of a migration operation"""

    migration_id: str
    success: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    migrated_settings: Dict[str, Any] = field(default_factory=dict)
    execution_time: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "migration_id": self.migration_id,
            "success": self.success,
            "errors": self.errors,
            "warnings": self.warnings,
            "migrated_settings": self.migrated_settings,
            "execution_time": self.execution_time,
        }


class BaseMigration(ABC):
    """Base class for settings migrations"""

    def __init__(
        self, migration_id: str, from_version: str, to_version: str, description: str
    ):
        self.migration_id = migration_id
        self.from_version = from_version
        self.to_version = to_version
        self.description = description
        self.logger = logging.getLogger(f"Migration.{migration_id}")

    @abstractmethod
    async def migrate_up(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Migrate settings up from old version to new version"""
        raise NotImplementedError("Subclasses must implement migrate_up method")

    @abstractmethod
    async def migrate_down(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Migrate settings down from new version to old version (rollback)"""
        raise NotImplementedError("Subclasses must implement migrate_down method")

    def validate_settings(self, settings: Dict[str, Any]) -> List[str]:
        """Validate settings before migration"""
        errors = []

        # Basic validation - override in subclasses for specific checks
        if not isinstance(settings, dict):
            errors.append("Settings must be a dictionary")

        return errors

    def can_migrate(self, current_version: str) -> bool:
        """Check if this migration can be applied to the current version"""
        try:
            return semver.compare(current_version, self.from_version) == 0
        except ValueError:
            # Fallback to string comparison if semver fails
            return current_version == self.from_version


# Example Migrations


class Migration_1_0_0_to_1_1_0(BaseMigration):
    """Migration from 1.0.0 to 1.1.0 - Add new theme settings"""

    def __init__(self):
        super().__init__(
            migration_id="add_theme_settings",
            from_version="1.0.0",
            to_version="1.1.0",
            description="Add new theme and appearance settings",
        )

    async def migrate_up(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Add new theme settings with defaults"""
        migrated = settings.copy()

        # Add new settings if they don't exist
        if "theme" not in migrated:
            migrated["theme"] = "light"

        if "high_contrast" not in migrated:
            migrated["high_contrast"] = False

        if "reduce_motion" not in migrated:
            migrated["reduce_motion"] = False

        # Migrate old color setting to new theme format
        if "dark_mode" in migrated:
            migrated["theme"] = "dark" if migrated["dark_mode"] else "light"
            del migrated["dark_mode"]

        return migrated

    async def migrate_down(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Remove new theme settings and restore old format"""
        migrated = settings.copy()

        # Convert theme back to dark_mode boolean
        if "theme" in migrated:
            migrated["dark_mode"] = migrated["theme"] == "dark"
            del migrated["theme"]

        # Remove new settings
        for key in ["high_contrast", "reduce_motion"]:
            migrated.pop(key, None)

        return migrated


class Migration_1_1_0_to_1_2_0(BaseMigration):
    """Migration from 1.1.0 to 1.2.0 - Restructure collaboration settings"""

    def __init__(self):
        super().__init__(
            migration_id="restructure_collaboration",
            from_version="1.1.0",
            to_version="1.2.0",
            description="Restructure collaboration settings and add new features",
        )

    async def migrate_up(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Restructure collaboration settings"""
        migrated = settings.copy()

        # Migrate old auto_save setting to new auto_save_interval
        if "auto_save" in migrated:
            auto_save_enabled = migrated["auto_save"]
            migrated["auto_save_interval"] = 30 if auto_save_enabled else 0
            del migrated["auto_save"]

        # Add new collaboration features
        if "show_cursors" not in migrated:
            migrated["show_cursors"] = True

        if "show_selections" not in migrated:
            migrated["show_selections"] = True

        if "typing_indicator_timeout" not in migrated:
            migrated["typing_indicator_timeout"] = 3

        return migrated

    async def migrate_down(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Restore old collaboration structure"""
        migrated = settings.copy()

        # Convert auto_save_interval back to boolean
        if "auto_save_interval" in migrated:
            migrated["auto_save"] = migrated["auto_save_interval"] > 0
            del migrated["auto_save_interval"]

        # Remove new collaboration settings
        for key in ["show_cursors", "show_selections", "typing_indicator_timeout"]:
            migrated.pop(key, None)

        return migrated


class Migration_1_2_0_to_1_3_0(BaseMigration):
    """Migration from 1.2.0 to 1.3.0 - Add AI features"""

    def __init__(self):
        super().__init__(
            migration_id="add_ai_features",
            from_version="1.2.0",
            to_version="1.3.0",
            description="Add AI-powered features and settings",
        )

    async def migrate_up(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Add AI feature settings"""
        migrated = settings.copy()

        # Add AI feature toggles
        ai_defaults = {
            "ai_meeting_summaries": True,
            "ai_action_items": True,
            "ai_sentiment_analysis": False,
        }

        for key, default_value in ai_defaults.items():
            if key not in migrated:
                migrated[key] = default_value

        return migrated

    async def migrate_down(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Remove AI feature settings"""
        migrated = settings.copy()

        # Remove AI settings
        ai_keys = ["ai_meeting_summaries", "ai_action_items", "ai_sentiment_analysis"]
        for key in ai_keys:
            migrated.pop(key, None)

        return migrated


class MigrationManager:
    """Manages settings migrations"""

    def __init__(self, settings_manager: SettingsManager):
        self.settings_manager = settings_manager
        self.migrations: List[BaseMigration] = []
        self.migration_history: Dict[str, List[str]] = (
            {}
        )  # scope:scope_id -> [migration_ids]
        self.logger = logging.getLogger("MigrationManager")

        # Register default migrations
        self._register_default_migrations()

    def _register_default_migrations(self):
        """Register default MeetingMind migrations"""
        self.register_migration(Migration_1_0_0_to_1_1_0())
        self.register_migration(Migration_1_1_0_to_1_2_0())
        self.register_migration(Migration_1_2_0_to_1_3_0())

    def register_migration(self, migration: BaseMigration):
        """Register a migration"""
        self.migrations.append(migration)
        self.migrations.sort(key=lambda m: semver.VersionInfo.parse(m.to_version))
        self.logger.info(f"Registered migration: {migration.migration_id}")

    def get_migration_path(
        self, from_version: str, to_version: str
    ) -> List[BaseMigration]:
        """Get the migration path from one version to another"""
        path = []
        current_version = from_version

        # Compare versions to determine direction
        if semver.compare(from_version, to_version) < 0:
            # Migrating up
            while semver.compare(current_version, to_version) < 0:
                migration = self._find_migration_from_version(current_version)
                if not migration:
                    break
                path.append(migration)
                current_version = migration.to_version
        else:
            # Migrating down
            while semver.compare(current_version, to_version) > 0:
                migration = self._find_migration_to_version(current_version)
                if not migration:
                    break
                path.append(migration)
                current_version = migration.from_version

        return path

    def _find_migration_from_version(self, version: str) -> Optional[BaseMigration]:
        """Find migration that starts from the given version"""
        for migration in self.migrations:
            if migration.from_version == version:
                return migration
        return None

    def _find_migration_to_version(self, version: str) -> Optional[BaseMigration]:
        """Find migration that ends at the given version"""
        for migration in self.migrations:
            if migration.to_version == version:
                return migration
        return None

    async def migrate_settings(
        self,
        scope: SettingsScope,
        scope_id: str,
        target_version: str,
        current_version: Optional[str] = None,
    ) -> List[MigrationResult]:
        """Migrate settings to target version"""

        if current_version is None:
            current_version = await self._get_current_version(scope, scope_id)

        # Get migration path
        migration_path = self.get_migration_path(current_version, target_version)

        if not migration_path:
            self.logger.info(
                f"No migrations needed from {current_version} to {target_version}"
            )
            return []

        results = []
        migrating_up = semver.compare(current_version, target_version) < 0

        # Get current settings
        settings = await self.settings_manager.get_all_values(scope, scope_id)

        # Apply migrations in sequence
        for migration in migration_path:
            result = await self._apply_migration(
                migration, settings, scope, scope_id, migrating_up
            )
            results.append(result)

            if not result.success:
                self.logger.error(
                    f"Migration {migration.migration_id} failed, stopping"
                )
                break

            # Update settings for next migration
            settings = result.migrated_settings

        # Save final settings if all migrations succeeded
        if all(result.success for result in results):
            await self._save_migrated_settings(settings, scope, scope_id)
            await self._update_migration_history(scope, scope_id, migration_path)
            await self._set_current_version(scope, scope_id, target_version)

        return results

    async def _apply_migration(
        self,
        migration: BaseMigration,
        settings: Dict[str, Any],
        scope: SettingsScope,
        scope_id: str,
        migrating_up: bool,
    ) -> MigrationResult:
        """Apply a single migration"""

        start_time = datetime.utcnow()
        result = MigrationResult(migration_id=migration.migration_id, success=False)

        try:
            # Validate settings before migration
            validation_errors = migration.validate_settings(settings)
            if validation_errors:
                result.errors.extend(validation_errors)
                return result

            # Apply migration
            if migrating_up:
                migrated_settings = await migration.migrate_up(settings)
            else:
                migrated_settings = await migration.migrate_down(settings)

            result.migrated_settings = migrated_settings
            result.success = True

            self.logger.info(
                f"Applied migration {migration.migration_id} ({'up' if migrating_up else 'down'})"
            )

        except Exception as e:
            result.errors.append(f"Migration failed: {str(e)}")
            self.logger.error(f"Migration {migration.migration_id} failed: {e}")

        finally:
            end_time = datetime.utcnow()
            result.execution_time = (end_time - start_time).total_seconds()

        return result

    async def _save_migrated_settings(
        self, settings: Dict[str, Any], scope: SettingsScope, scope_id: str
    ):
        """Save migrated settings"""
        for key, value in settings.items():
            await self.settings_manager.set_value(
                key=key,
                value=value,
                scope=scope,
                scope_id=scope_id,
                set_by="migration",
                source="migration",
            )

    async def _get_current_version(self, scope: SettingsScope, scope_id: str) -> str:
        """Get current schema version for scope"""
        version = await self.settings_manager.get_value(
            "_schema_version", scope, scope_id, use_hierarchy=False
        )
        return version or "1.0.0"  # Default to 1.0.0 if no version set

    async def _set_current_version(
        self, scope: SettingsScope, scope_id: str, version: str
    ):
        """Set current schema version for scope"""
        await self.settings_manager.set_value(
            key="_schema_version",
            value=version,
            scope=scope,
            scope_id=scope_id,
            set_by="migration",
            source="migration",
        )

    async def _update_migration_history(
        self, scope: SettingsScope, scope_id: str, migrations: List[BaseMigration]
    ):
        """Update migration history"""
        scope_key = f"{scope.value}:{scope_id}"

        if scope_key not in self.migration_history:
            self.migration_history[scope_key] = []

        for migration in migrations:
            if migration.migration_id not in self.migration_history[scope_key]:
                self.migration_history[scope_key].append(migration.migration_id)

    async def get_pending_migrations(
        self, scope: SettingsScope, scope_id: str, target_version: str
    ) -> List[BaseMigration]:
        """Get pending migrations for a scope"""
        current_version = await self._get_current_version(scope, scope_id)
        return self.get_migration_path(current_version, target_version)

    async def check_migration_status(
        self, scope: SettingsScope, scope_id: str
    ) -> Dict[str, Any]:
        """Check migration status for a scope"""
        current_version = await self._get_current_version(scope, scope_id)
        latest_version = self._get_latest_version()

        pending_migrations = self.get_migration_path(current_version, latest_version)

        scope_key = f"{scope.value}:{scope_id}"
        applied_migrations = self.migration_history.get(scope_key, [])

        return {
            "current_version": current_version,
            "latest_version": latest_version,
            "needs_migration": len(pending_migrations) > 0,
            "pending_migrations": [m.migration_id for m in pending_migrations],
            "applied_migrations": applied_migrations,
        }

    def _get_latest_version(self) -> str:
        """Get the latest version from available migrations"""
        if not self.migrations:
            return "1.0.0"

        return max(
            self.migrations, key=lambda m: semver.VersionInfo.parse(m.to_version)
        ).to_version

    async def rollback_migration(
        self, migration_id: str, scope: SettingsScope, scope_id: str
    ) -> MigrationResult:
        """Rollback a specific migration"""

        migration = None
        for m in self.migrations:
            if m.migration_id == migration_id:
                migration = m
                break

        if not migration:
            return MigrationResult(
                migration_id=migration_id,
                success=False,
                errors=[f"Migration {migration_id} not found"],
            )

        # Get current settings
        settings = await self.settings_manager.get_all_values(scope, scope_id)

        # Apply rollback
        result = await self._apply_migration(
            migration, settings, scope, scope_id, False
        )

        if result.success:
            await self._save_migrated_settings(
                result.migrated_settings, scope, scope_id
            )
            await self._set_current_version(scope, scope_id, migration.from_version)

        return result

    async def dry_run_migration(
        self, scope: SettingsScope, scope_id: str, target_version: str
    ) -> List[MigrationResult]:
        """Perform a dry run of migrations without applying changes"""

        current_version = await self._get_current_version(scope, scope_id)
        migration_path = self.get_migration_path(current_version, target_version)

        if not migration_path:
            return []

        results = []
        migrating_up = semver.compare(current_version, target_version) < 0

        # Get current settings (don't modify the original)
        settings = (await self.settings_manager.get_all_values(scope, scope_id)).copy()

        # Apply migrations without saving
        for migration in migration_path:
            result = await self._apply_migration(
                migration, settings, scope, scope_id, migrating_up
            )
            results.append(result)

            if not result.success:
                break

            # Update settings for next migration
            settings = result.migrated_settings.copy()

        return results

    def get_migration_info(self) -> List[Dict[str, Any]]:
        """Get information about all available migrations"""
        return [
            {
                "migration_id": m.migration_id,
                "from_version": m.from_version,
                "to_version": m.to_version,
                "description": m.description,
            }
            for m in self.migrations
        ]


# Global migration manager instance
migration_manager: Optional[MigrationManager] = None


def get_migration_manager() -> MigrationManager:
    """Get global migration manager instance"""
    global migration_manager
    if migration_manager is None:
        from .settings_manager import get_settings_manager

        migration_manager = MigrationManager(get_settings_manager())
    return migration_manager


def initialize_migration_manager(settings_manager: SettingsManager) -> MigrationManager:
    """Initialize global migration manager"""
    global migration_manager
    migration_manager = MigrationManager(settings_manager)
    return migration_manager
