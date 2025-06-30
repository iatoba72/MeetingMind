# Settings Versioning and Rollback System
# Track configuration changes and enable rollback functionality

import asyncio
import json
import uuid
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from pathlib import Path
import logging
import hashlib
import difflib

from .settings_models import SettingsScope, SettingsSnapshot
from .settings_manager import SettingsManager


@dataclass
class SettingsVersion:
    """A version of settings with change metadata"""

    version_id: str
    scope: SettingsScope
    scope_id: str
    version_number: int

    # Content
    settings: Dict[str, Any]
    settings_hash: str

    # Metadata
    created_at: datetime
    created_by: str
    description: str
    change_summary: Dict[str, Any] = field(default_factory=dict)

    # Relationships
    parent_version_id: Optional[str] = None
    tags: List[str] = field(default_factory=list)

    # Change details
    added_keys: List[str] = field(default_factory=list)
    modified_keys: List[str] = field(default_factory=list)
    removed_keys: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "version_id": self.version_id,
            "scope": self.scope.value,
            "scope_id": self.scope_id,
            "version_number": self.version_number,
            "settings": self.settings,
            "settings_hash": self.settings_hash,
            "created_at": self.created_at.isoformat(),
            "created_by": self.created_by,
            "description": self.description,
            "change_summary": self.change_summary,
            "parent_version_id": self.parent_version_id,
            "tags": self.tags,
            "added_keys": self.added_keys,
            "modified_keys": self.modified_keys,
            "removed_keys": self.removed_keys,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SettingsVersion":
        """Create from dictionary"""
        return cls(
            version_id=data["version_id"],
            scope=SettingsScope(data["scope"]),
            scope_id=data["scope_id"],
            version_number=data["version_number"],
            settings=data["settings"],
            settings_hash=data["settings_hash"],
            created_at=datetime.fromisoformat(data["created_at"]),
            created_by=data["created_by"],
            description=data["description"],
            change_summary=data.get("change_summary", {}),
            parent_version_id=data.get("parent_version_id"),
            tags=data.get("tags", []),
            added_keys=data.get("added_keys", []),
            modified_keys=data.get("modified_keys", []),
            removed_keys=data.get("removed_keys", []),
        )


@dataclass
class SettingsDiff:
    """Difference between two settings versions"""

    from_version_id: str
    to_version_id: str

    # Changes
    added: Dict[str, Any] = field(default_factory=dict)
    modified: Dict[str, Tuple[Any, Any]] = field(
        default_factory=dict
    )  # key -> (old, new)
    removed: Dict[str, Any] = field(default_factory=dict)

    # Statistics
    total_changes: int = 0

    def __post_init__(self):
        self.total_changes = len(self.added) + len(self.modified) + len(self.removed)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "from_version_id": self.from_version_id,
            "to_version_id": self.to_version_id,
            "added": self.added,
            "modified": {
                k: {"old": v[0], "new": v[1]} for k, v in self.modified.items()
            },
            "removed": self.removed,
            "total_changes": self.total_changes,
        }


class SettingsVersionManager:
    """Manager for settings versioning and rollback"""

    def __init__(
        self,
        settings_manager: SettingsManager,
        versions_dir: str = "config/versions",
        max_versions_per_scope: int = 100,
        retention_days: int = 90,
    ):

        self.settings_manager = settings_manager
        self.versions_dir = Path(versions_dir)
        self.max_versions_per_scope = max_versions_per_scope
        self.retention_days = retention_days

        # Storage
        self.versions: Dict[str, SettingsVersion] = {}  # version_id -> version
        self.version_chains: Dict[str, List[str]] = (
            {}
        )  # scope:scope_id -> [version_ids]

        # Logging
        self.logger = logging.getLogger("SettingsVersionManager")

        self._ensure_versions_directory()

    def _ensure_versions_directory(self):
        """Ensure versions directory exists"""
        self.versions_dir.mkdir(parents=True, exist_ok=True)

    def _calculate_settings_hash(self, settings: Dict[str, Any]) -> str:
        """Calculate hash of settings for change detection"""
        # Sort keys for consistent hashing
        sorted_settings = json.dumps(settings, sort_keys=True, default=str)
        return hashlib.sha256(sorted_settings.encode()).hexdigest()

    def _get_scope_key(self, scope: SettingsScope, scope_id: str) -> str:
        """Get scope key for indexing"""
        return f"{scope.value}:{scope_id}"

    async def create_version(
        self,
        scope: SettingsScope,
        scope_id: str,
        description: str,
        created_by: str = "system",
        tags: List[str] = None,
    ) -> str:
        """Create a new version of settings"""

        try:
            # Get current settings
            current_settings = await self.settings_manager.get_all_values(
                scope, scope_id
            )
            settings_hash = self._calculate_settings_hash(current_settings)

            # Check if settings have actually changed
            scope_key = self._get_scope_key(scope, scope_id)
            if scope_key in self.version_chains and self.version_chains[scope_key]:
                latest_version_id = self.version_chains[scope_key][-1]
                latest_version = self.versions[latest_version_id]

                if latest_version.settings_hash == settings_hash:
                    self.logger.info(
                        f"No changes detected for {scope_key}, skipping version creation"
                    )
                    return latest_version_id

            # Get previous version for comparison
            previous_version = None
            version_number = 1

            if scope_key in self.version_chains and self.version_chains[scope_key]:
                previous_version_id = self.version_chains[scope_key][-1]
                previous_version = self.versions[previous_version_id]
                version_number = previous_version.version_number + 1

            # Calculate changes
            added_keys, modified_keys, removed_keys = self._calculate_changes(
                previous_version.settings if previous_version else {}, current_settings
            )

            # Create version
            version_id = str(uuid.uuid4())
            version = SettingsVersion(
                version_id=version_id,
                scope=scope,
                scope_id=scope_id,
                version_number=version_number,
                settings=current_settings.copy(),
                settings_hash=settings_hash,
                created_at=datetime.utcnow(),
                created_by=created_by,
                description=description,
                parent_version_id=(
                    previous_version.version_id if previous_version else None
                ),
                tags=tags or [],
                added_keys=added_keys,
                modified_keys=modified_keys,
                removed_keys=removed_keys,
                change_summary={
                    "added_count": len(added_keys),
                    "modified_count": len(modified_keys),
                    "removed_count": len(removed_keys),
                    "total_settings": len(current_settings),
                },
            )

            # Store version
            self.versions[version_id] = version

            # Update version chain
            if scope_key not in self.version_chains:
                self.version_chains[scope_key] = []
            self.version_chains[scope_key].append(version_id)

            # Enforce version limits
            await self._enforce_version_limits(scope, scope_id)

            # Persist version
            await self._persist_version(version)

            self.logger.info(
                f"Created version {version_number} for {scope_key}: {description}"
            )
            return version_id

        except Exception as e:
            self.logger.error(f"Error creating version: {e}")
            raise

    def _calculate_changes(
        self, old_settings: Dict[str, Any], new_settings: Dict[str, Any]
    ) -> Tuple[List[str], List[str], List[str]]:
        """Calculate changes between two settings dictionaries"""

        old_keys = set(old_settings.keys())
        new_keys = set(new_settings.keys())

        added_keys = list(new_keys - old_keys)
        removed_keys = list(old_keys - new_keys)

        # Check for modifications in common keys
        modified_keys = []
        for key in old_keys & new_keys:
            if old_settings[key] != new_settings[key]:
                modified_keys.append(key)

        return added_keys, modified_keys, removed_keys

    async def get_version(self, version_id: str) -> Optional[SettingsVersion]:
        """Get a specific version"""
        return self.versions.get(version_id)

    async def get_versions(
        self, scope: SettingsScope, scope_id: str, limit: int = 50, offset: int = 0
    ) -> List[SettingsVersion]:
        """Get versions for a scope"""

        scope_key = self._get_scope_key(scope, scope_id)
        if scope_key not in self.version_chains:
            return []

        version_ids = self.version_chains[scope_key]

        # Apply pagination
        start_idx = max(0, len(version_ids) - offset - limit)
        end_idx = len(version_ids) - offset

        if end_idx <= 0:
            return []

        # Get versions in reverse chronological order
        selected_ids = version_ids[start_idx:end_idx]
        selected_ids.reverse()

        return [self.versions[vid] for vid in selected_ids if vid in self.versions]

    async def get_latest_version(
        self, scope: SettingsScope, scope_id: str
    ) -> Optional[SettingsVersion]:
        """Get the latest version for a scope"""
        scope_key = self._get_scope_key(scope, scope_id)

        if scope_key not in self.version_chains or not self.version_chains[scope_key]:
            return None

        latest_version_id = self.version_chains[scope_key][-1]
        return self.versions.get(latest_version_id)

    async def rollback_to_version(
        self,
        version_id: str,
        rolled_back_by: str = "system",
        create_backup: bool = True,
    ) -> bool:
        """Rollback settings to a specific version"""

        try:
            if version_id not in self.versions:
                self.logger.error(f"Version not found: {version_id}")
                return False

            target_version = self.versions[version_id]

            # Create backup of current state if requested
            if create_backup:
                await self.create_version(
                    scope=target_version.scope,
                    scope_id=target_version.scope_id,
                    description=f"Backup before rollback to version {target_version.version_number}",
                    created_by=rolled_back_by,
                    tags=["rollback_backup"],
                )

            # Apply the target version settings
            for key, value in target_version.settings.items():
                await self.settings_manager.set_value(
                    key=key,
                    value=value,
                    scope=target_version.scope,
                    scope_id=target_version.scope_id,
                    set_by=rolled_back_by,
                    source="rollback",
                )

            # Remove settings that don't exist in target version
            current_settings = await self.settings_manager.get_all_values(
                target_version.scope, target_version.scope_id
            )

            for key in current_settings:
                if key not in target_version.settings:
                    await self.settings_manager.delete_value(
                        key,
                        target_version.scope,
                        target_version.scope_id,
                        rolled_back_by,
                    )

            # Create rollback version
            await self.create_version(
                scope=target_version.scope,
                scope_id=target_version.scope_id,
                description=f"Rolled back to version {target_version.version_number}: {target_version.description}",
                created_by=rolled_back_by,
                tags=["rollback"],
            )

            self.logger.info(f"Successfully rolled back to version {version_id}")
            return True

        except Exception as e:
            self.logger.error(f"Error rolling back to version {version_id}: {e}")
            return False

    async def compare_versions(
        self, from_version_id: str, to_version_id: str
    ) -> Optional[SettingsDiff]:
        """Compare two versions and return differences"""

        if from_version_id not in self.versions or to_version_id not in self.versions:
            return None

        from_version = self.versions[from_version_id]
        to_version = self.versions[to_version_id]

        from_settings = from_version.settings
        to_settings = to_version.settings

        # Calculate differences
        all_keys = set(from_settings.keys()) | set(to_settings.keys())

        added = {}
        modified = {}
        removed = {}

        for key in all_keys:
            in_from = key in from_settings
            in_to = key in to_settings

            if not in_from and in_to:
                # Added
                added[key] = to_settings[key]
            elif in_from and not in_to:
                # Removed
                removed[key] = from_settings[key]
            elif in_from and in_to and from_settings[key] != to_settings[key]:
                # Modified
                modified[key] = (from_settings[key], to_settings[key])

        return SettingsDiff(
            from_version_id=from_version_id,
            to_version_id=to_version_id,
            added=added,
            modified=modified,
            removed=removed,
        )

    async def get_version_history(
        self, scope: SettingsScope, scope_id: str, key: str
    ) -> List[Dict[str, Any]]:
        """Get history of changes for a specific setting key"""

        scope_key = self._get_scope_key(scope, scope_id)
        if scope_key not in self.version_chains:
            return []

        history = []

        for version_id in self.version_chains[scope_key]:
            version = self.versions[version_id]

            if key in version.settings:
                history.append(
                    {
                        "version_id": version_id,
                        "version_number": version.version_number,
                        "value": version.settings[key],
                        "created_at": version.created_at.isoformat(),
                        "created_by": version.created_by,
                        "description": version.description,
                        "change_type": self._get_change_type_for_key(version, key),
                    }
                )

        return history

    def _get_change_type_for_key(self, version: SettingsVersion, key: str) -> str:
        """Determine the type of change for a specific key in a version"""
        if key in version.added_keys:
            return "added"
        elif key in version.modified_keys:
            return "modified"
        elif key in version.removed_keys:
            return "removed"
        else:
            return "unchanged"

    async def create_branch(
        self, base_version_id: str, branch_name: str, created_by: str = "system"
    ) -> str:
        """Create a branch from a specific version"""

        if base_version_id not in self.versions:
            raise ValueError(f"Base version not found: {base_version_id}")

        base_version = self.versions[base_version_id]

        # Create new version with branch tag
        branch_version_id = await self.create_version(
            scope=base_version.scope,
            scope_id=base_version.scope_id,
            description=f"Created branch '{branch_name}' from version {base_version.version_number}",
            created_by=created_by,
            tags=["branch", f"branch:{branch_name}"],
        )

        self.logger.info(
            f"Created branch '{branch_name}' from version {base_version_id}"
        )
        return branch_version_id

    async def _enforce_version_limits(self, scope: SettingsScope, scope_id: str):
        """Enforce version limits and cleanup old versions"""

        scope_key = self._get_scope_key(scope, scope_id)
        if scope_key not in self.version_chains:
            return

        version_ids = self.version_chains[scope_key]

        # Remove excess versions (keep most recent)
        if len(version_ids) > self.max_versions_per_scope:
            excess_count = len(version_ids) - self.max_versions_per_scope

            for version_id in version_ids[:excess_count]:
                await self._remove_version(version_id)
                self.logger.info(f"Removed old version {version_id} due to limit")

        # Remove versions older than retention period
        cutoff_date = datetime.utcnow() - timedelta(days=self.retention_days)

        for version_id in version_ids[:]:  # Create copy for iteration
            version = self.versions.get(version_id)
            if version and version.created_at < cutoff_date:
                # Keep at least one version
                if len(version_ids) > 1:
                    await self._remove_version(version_id)
                    self.logger.info(f"Removed expired version {version_id}")

    async def _remove_version(self, version_id: str):
        """Remove a version from storage"""

        if version_id not in self.versions:
            return

        version = self.versions[version_id]
        scope_key = self._get_scope_key(version.scope, version.scope_id)

        # Remove from storage
        del self.versions[version_id]

        # Remove from chain
        if scope_key in self.version_chains:
            self.version_chains[scope_key] = [
                vid for vid in self.version_chains[scope_key] if vid != version_id
            ]

        # Remove persisted file
        await self._remove_persisted_version(version_id)

    async def _persist_version(self, version: SettingsVersion):
        """Persist a version to file"""
        version_file = self.versions_dir / f"{version.version_id}.json"

        with open(version_file, "w") as f:
            json.dump(version.to_dict(), f, indent=2, default=str)

    async def _remove_persisted_version(self, version_id: str):
        """Remove persisted version file"""
        version_file = self.versions_dir / f"{version_id}.json"

        if version_file.exists():
            version_file.unlink()

    async def load_versions(self):
        """Load all versions from persisted files"""
        if not self.versions_dir.exists():
            return

        for version_file in self.versions_dir.glob("*.json"):
            try:
                with open(version_file, "r") as f:
                    data = json.load(f)

                version = SettingsVersion.from_dict(data)
                self.versions[version.version_id] = version

                # Rebuild version chains
                scope_key = self._get_scope_key(version.scope, version.scope_id)
                if scope_key not in self.version_chains:
                    self.version_chains[scope_key] = []

                if version.version_id not in self.version_chains[scope_key]:
                    self.version_chains[scope_key].append(version.version_id)

            except Exception as e:
                self.logger.error(f"Failed to load version from {version_file}: {e}")

        # Sort version chains by version number
        for scope_key, version_ids in self.version_chains.items():
            version_ids.sort(key=lambda vid: self.versions[vid].version_number)

        self.logger.info(f"Loaded {len(self.versions)} versions")

    async def export_version(self, version_id: str) -> Optional[Dict[str, Any]]:
        """Export a version for backup/transfer"""
        if version_id not in self.versions:
            return None

        return self.versions[version_id].to_dict()

    async def import_version(self, version_data: Dict[str, Any]) -> str:
        """Import a version from backup/transfer"""
        version = SettingsVersion.from_dict(version_data)

        # Generate new ID if conflict
        if version.version_id in self.versions:
            version.version_id = str(uuid.uuid4())

        self.versions[version.version_id] = version

        # Update version chain
        scope_key = self._get_scope_key(version.scope, version.scope_id)
        if scope_key not in self.version_chains:
            self.version_chains[scope_key] = []

        self.version_chains[scope_key].append(version.version_id)
        self.version_chains[scope_key].sort(
            key=lambda vid: self.versions[vid].version_number
        )

        # Persist
        await self._persist_version(version)

        return version.version_id

    def get_stats(self) -> Dict[str, Any]:
        """Get versioning statistics"""
        total_versions = len(self.versions)
        scopes_with_versions = len(self.version_chains)

        # Calculate average versions per scope
        avg_versions = (
            total_versions / scopes_with_versions if scopes_with_versions > 0 else 0
        )

        # Find most active scope
        most_active_scope = None
        max_versions = 0

        for scope_key, version_ids in self.version_chains.items():
            if len(version_ids) > max_versions:
                max_versions = len(version_ids)
                most_active_scope = scope_key

        return {
            "total_versions": total_versions,
            "scopes_with_versions": scopes_with_versions,
            "average_versions_per_scope": round(avg_versions, 2),
            "most_active_scope": most_active_scope,
            "max_versions_in_scope": max_versions,
            "retention_days": self.retention_days,
            "max_versions_per_scope": self.max_versions_per_scope,
        }


# Global version manager instance
version_manager: Optional[SettingsVersionManager] = None


def get_version_manager() -> SettingsVersionManager:
    """Get global version manager instance"""
    global version_manager
    if version_manager is None:
        from .settings_manager import get_settings_manager

        version_manager = SettingsVersionManager(get_settings_manager())
    return version_manager


def initialize_version_manager(
    settings_manager: SettingsManager, **kwargs
) -> SettingsVersionManager:
    """Initialize global version manager"""
    global version_manager
    version_manager = SettingsVersionManager(settings_manager, **kwargs)
    return version_manager
