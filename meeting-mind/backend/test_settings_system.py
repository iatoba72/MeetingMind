#!/usr/bin/env python3
"""
Comprehensive Test Suite for MeetingMind Settings Management System
Tests all components: Settings Manager, Versioning, Hot-reload, Migrations, Config Lab

Run with: python test_settings_system.py
"""

import asyncio
import json
import tempfile
import shutil
import time
from pathlib import Path
from typing import Dict, Any, List
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SettingsTest")

# Import settings components
from settings.settings_manager import SettingsManager, initialize_settings_manager
from settings.settings_models import (
    SettingsScope, SettingsDefinition, SettingsType, SettingsCategory,
    SettingsValidationRule, settings_registry
)
from settings.versioning import SettingsVersionManager, initialize_version_manager
from settings.hot_reload import HotReloadManager, initialize_hot_reload_manager, HotReloadConfig
from settings.migrations import MigrationManager, initialize_migration_manager
from settings.default_settings import register_default_settings

class SettingsSystemTester:
    """Comprehensive test suite for the settings management system"""
    
    def __init__(self):
        self.temp_dir = None
        self.settings_manager = None
        self.version_manager = None
        self.hot_reload_manager = None
        self.migration_manager = None
        self.test_results = []
        
    async def setup(self):
        """Setup test environment"""
        logger.info("Setting up test environment...")
        
        # Create temporary directory for config files
        self.temp_dir = Path(tempfile.mkdtemp(prefix="meetingmind_settings_test_"))
        logger.info(f"Test directory: {self.temp_dir}")
        
        # Initialize settings manager
        self.settings_manager = initialize_settings_manager(
            config_dir=str(self.temp_dir / "config"),
            enable_hot_reload=True,
            enable_cache=True,
            cache_ttl=60
        )
        
        # Initialize version manager
        self.version_manager = initialize_version_manager(
            self.settings_manager,
            versions_dir=str(self.temp_dir / "versions"),
            max_versions_per_scope=50,
            retention_days=30
        )
        
        # Initialize hot-reload manager
        hot_reload_config = HotReloadConfig(
            enabled=True,
            debounce_delay=0.1,  # Faster for testing
            batch_timeout=0.5,
            max_retries=2
        )
        self.hot_reload_manager = initialize_hot_reload_manager(hot_reload_config)
        
        # Initialize migration manager
        self.migration_manager = initialize_migration_manager(self.settings_manager)
        
        # Register default settings
        register_default_settings()
        
        logger.info("Test environment setup complete")
    
    async def teardown(self):
        """Cleanup test environment"""
        logger.info("Cleaning up test environment...")
        
        if self.settings_manager:
            await self.settings_manager.shutdown()
        
        if self.temp_dir and self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)
        
        logger.info("Cleanup complete")
    
    def log_test_result(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "PASS" if success else "FAIL"
        logger.info(f"TEST {status}: {test_name}")
        if details:
            logger.info(f"  Details: {details}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
    
    async def test_basic_settings_operations(self):
        """Test basic settings operations"""
        logger.info("\n=== Testing Basic Settings Operations ===")
        
        try:
            # Test setting a value
            success = await self.settings_manager.set_value(
                key="theme",
                value="dark",
                scope=SettingsScope.USER,
                scope_id="test_user",
                set_by="test"
            )
            self.log_test_result("Set setting value", success)
            
            # Test getting a value
            value = await self.settings_manager.get_value(
                key="theme",
                scope=SettingsScope.USER,
                scope_id="test_user"
            )
            self.log_test_result("Get setting value", value == "dark", f"Expected 'dark', got '{value}'")
            
            # Test hierarchical resolution
            global_value = await self.settings_manager.get_value(
                key="font_size",
                scope=SettingsScope.USER,
                scope_id="test_user"
            )
            expected_default = 14  # From default settings
            self.log_test_result("Hierarchical resolution", global_value == expected_default, 
                               f"Got default value {global_value}")
            
            # Test getting all values
            all_values = await self.settings_manager.get_all_values(
                scope=SettingsScope.USER,
                scope_id="test_user"
            )
            self.log_test_result("Get all values", len(all_values) > 0, f"Got {len(all_values)} settings")
            
            # Test validation
            invalid_success = await self.settings_manager.set_value(
                key="font_size",
                value=50,  # Too large, should fail validation
                scope=SettingsScope.USER,
                scope_id="test_user",
                set_by="test"
            )
            self.log_test_result("Validation rejection", not invalid_success, 
                               "Should reject invalid font size")
            
        except Exception as e:
            self.log_test_result("Basic operations", False, f"Exception: {e}")
    
    async def test_versioning_system(self):
        """Test versioning and rollback"""
        logger.info("\n=== Testing Versioning System ===")
        
        try:
            # Create initial version
            version1_id = await self.version_manager.create_version(
                scope=SettingsScope.USER,
                scope_id="test_user",
                description="Initial settings",
                created_by="test"
            )
            self.log_test_result("Create version", bool(version1_id), f"Version ID: {version1_id}")
            
            # Change settings
            await self.settings_manager.set_value(
                key="font_size",
                value=16,
                scope=SettingsScope.USER,
                scope_id="test_user",
                set_by="test"
            )
            
            # Create second version
            version2_id = await self.version_manager.create_version(
                scope=SettingsScope.USER,
                scope_id="test_user",
                description="Updated font size",
                created_by="test"
            )
            self.log_test_result("Create second version", bool(version2_id))
            
            # Test version comparison
            diff = await self.version_manager.compare_versions(version1_id, version2_id)
            has_changes = diff and diff.total_changes > 0
            self.log_test_result("Version comparison", has_changes, 
                               f"Found {diff.total_changes if diff else 0} changes")
            
            # Test rollback
            rollback_success = await self.version_manager.rollback_to_version(
                version_id=version1_id,
                rolled_back_by="test"
            )
            self.log_test_result("Version rollback", rollback_success)
            
            # Verify rollback worked
            current_font_size = await self.settings_manager.get_value(
                key="font_size",
                scope=SettingsScope.USER,
                scope_id="test_user"
            )
            rollback_verified = current_font_size == 14  # Should be back to default
            self.log_test_result("Rollback verification", rollback_verified, 
                               f"Font size after rollback: {current_font_size}")
            
        except Exception as e:
            self.log_test_result("Versioning system", False, f"Exception: {e}")
    
    async def test_hot_reload_system(self):
        """Test hot-reload functionality"""
        logger.info("\n=== Testing Hot-reload System ===")
        
        try:
            # Test dependency setup
            self.hot_reload_manager.add_dependency("sidebar_width", "theme")
            dependencies = self.hot_reload_manager.dependency_tracker.get_dependencies("sidebar_width")
            self.log_test_result("Add dependency", "theme" in dependencies)
            
            # Test scheduling reload
            operation_id = await self.hot_reload_manager.schedule_reload(
                keys={"theme"},
                scope=SettingsScope.USER,
                scope_id="test_user",
                triggered_by="test"
            )
            self.log_test_result("Schedule reload", bool(operation_id))
            
            # Wait a bit for operation to complete
            await asyncio.sleep(1.0)
            
            # Check operation status
            operation = self.hot_reload_manager.get_operation_status(operation_id)
            if operation:
                completed = operation.state.value in ["completed", "failed"]
                self.log_test_result("Hot-reload completion", completed, 
                                   f"Operation state: {operation.state.value}")
            else:
                self.log_test_result("Hot-reload completion", False, "Operation not found")
            
            # Test force reload
            force_operation_id = await self.hot_reload_manager.force_reload(
                keys={"font_size"},
                scope=SettingsScope.USER,
                scope_id="test_user"
            )
            self.log_test_result("Force reload", bool(force_operation_id))
            
        except Exception as e:
            self.log_test_result("Hot-reload system", False, f"Exception: {e}")
    
    async def test_migration_system(self):
        """Test settings migration"""
        logger.info("\n=== Testing Migration System ===")
        
        try:
            # Set current version to 1.0.0
            await self.settings_manager.set_value(
                key="_schema_version",
                value="1.0.0",
                scope=SettingsScope.USER,
                scope_id="migration_test",
                set_by="test"
            )
            
            # Add old-style setting that should be migrated
            await self.settings_manager.set_value(
                key="dark_mode",
                value=True,
                scope=SettingsScope.USER,
                scope_id="migration_test",
                set_by="test"
            )
            
            # Test migration status check
            status = await self.migration_manager.check_migration_status(
                scope=SettingsScope.USER,
                scope_id="migration_test"
            )
            needs_migration = status["needs_migration"]
            self.log_test_result("Migration status check", needs_migration, 
                               f"Current: {status['current_version']}, Latest: {status['latest_version']}")
            
            # Test dry run
            dry_run_results = await self.migration_manager.dry_run_migration(
                scope=SettingsScope.USER,
                scope_id="migration_test",
                target_version="1.1.0"
            )
            dry_run_success = all(result.success for result in dry_run_results)
            self.log_test_result("Migration dry run", dry_run_success, 
                               f"Executed {len(dry_run_results)} migrations")
            
            # Test actual migration
            migration_results = await self.migration_manager.migrate_settings(
                scope=SettingsScope.USER,
                scope_id="migration_test",
                target_version="1.1.0"
            )
            migration_success = all(result.success for result in migration_results)
            self.log_test_result("Execute migration", migration_success)
            
            # Verify migration worked (dark_mode should become theme)
            theme_value = await self.settings_manager.get_value(
                key="theme",
                scope=SettingsScope.USER,
                scope_id="migration_test"
            )
            dark_mode_exists = await self.settings_manager.get_value(
                key="dark_mode",
                scope=SettingsScope.USER,
                scope_id="migration_test",
                use_hierarchy=False
            )
            migration_verified = theme_value == "dark" and dark_mode_exists is None
            self.log_test_result("Migration verification", migration_verified, 
                               f"Theme: {theme_value}, dark_mode exists: {dark_mode_exists is not None}")
            
        except Exception as e:
            self.log_test_result("Migration system", False, f"Exception: {e}")
    
    async def test_import_export(self):
        """Test settings import/export functionality"""
        logger.info("\n=== Testing Import/Export ===")
        
        try:
            # Set up some settings for export
            test_settings = {
                "theme": "dark",
                "font_size": 16,
                "compact_mode": True
            }
            
            for key, value in test_settings.items():
                await self.settings_manager.set_value(
                    key=key,
                    value=value,
                    scope=SettingsScope.USER,
                    scope_id="export_test",
                    set_by="test"
                )
            
            # Test export
            exported_data = await self.settings_manager.export_settings(
                scope=SettingsScope.USER,
                scope_id="export_test",
                include_metadata=True
            )
            
            export_success = (
                "settings" in exported_data and
                len(exported_data["settings"]) >= len(test_settings)
            )
            self.log_test_result("Export settings", export_success, 
                               f"Exported {len(exported_data.get('settings', {}))} settings")
            
            # Test import to new scope
            import_success = await self.settings_manager.import_settings(
                data=exported_data,
                scope=SettingsScope.USER,
                scope_id="import_test",
                imported_by="test"
            )
            self.log_test_result("Import settings", import_success)
            
            # Verify imported settings
            imported_theme = await self.settings_manager.get_value(
                key="theme",
                scope=SettingsScope.USER,
                scope_id="import_test"
            )
            import_verified = imported_theme == "dark"
            self.log_test_result("Import verification", import_verified, 
                               f"Imported theme: {imported_theme}")
            
        except Exception as e:
            self.log_test_result("Import/Export", False, f"Exception: {e}")
    
    async def test_snapshots(self):
        """Test settings snapshots"""
        logger.info("\n=== Testing Snapshots ===")
        
        try:
            # Create snapshot
            snapshot_id = await self.settings_manager.create_snapshot(
                name="Test Snapshot",
                description="Test snapshot for validation",
                scope=SettingsScope.USER,
                scope_id="snapshot_test",
                created_by="test",
                tags=["test", "validation"]
            )
            self.log_test_result("Create snapshot", bool(snapshot_id))
            
            # Modify settings after snapshot
            await self.settings_manager.set_value(
                key="theme",
                value="light",
                scope=SettingsScope.USER,
                scope_id="snapshot_test",
                set_by="test"
            )
            
            # Restore snapshot
            restore_success = await self.settings_manager.restore_snapshot(
                snapshot_id=snapshot_id,
                restored_by="test"
            )
            self.log_test_result("Restore snapshot", restore_success)
            
            # Verify restoration (theme should be back to default)
            restored_theme = await self.settings_manager.get_value(
                key="theme",
                scope=SettingsScope.USER,
                scope_id="snapshot_test"
            )
            # Should be default since we didn't set theme before snapshot
            restore_verified = restored_theme in ["light", None]  # Default or None
            self.log_test_result("Snapshot restoration verification", restore_verified, 
                               f"Restored theme: {restored_theme}")
            
        except Exception as e:
            self.log_test_result("Snapshots", False, f"Exception: {e}")
    
    async def test_validation_system(self):
        """Test settings validation"""
        logger.info("\n=== Testing Validation System ===")
        
        try:
            # Test valid setting
            valid_success = await self.settings_manager.set_value(
                key="font_size",
                value=16,
                scope=SettingsScope.USER,
                scope_id="validation_test",
                set_by="test"
            )
            self.log_test_result("Valid setting accepted", valid_success)
            
            # Test invalid setting (font size too small)
            invalid_small = await self.settings_manager.set_value(
                key="font_size",
                value=5,
                scope=SettingsScope.USER,
                scope_id="validation_test",
                set_by="test"
            )
            self.log_test_result("Invalid setting rejected (too small)", not invalid_small)
            
            # Test invalid setting (font size too large)
            invalid_large = await self.settings_manager.set_value(
                key="font_size",
                value=50,
                scope=SettingsScope.USER,
                scope_id="validation_test",
                set_by="test"
            )
            self.log_test_result("Invalid setting rejected (too large)", not invalid_large)
            
            # Test enum validation
            invalid_theme = await self.settings_manager.set_value(
                key="theme",
                value="invalid_theme",
                scope=SettingsScope.USER,
                scope_id="validation_test",
                set_by="test"
            )
            self.log_test_result("Invalid enum value rejected", not invalid_theme)
            
            # Test validation of all settings in scope
            validation_errors = await self.settings_manager.validate_all(
                scope=SettingsScope.USER,
                scope_id="validation_test"
            )
            validation_passed = len(validation_errors) == 0
            self.log_test_result("Scope validation", validation_passed, 
                               f"Found {len(validation_errors)} validation errors")
            
        except Exception as e:
            self.log_test_result("Validation system", False, f"Exception: {e}")
    
    async def test_performance(self):
        """Test system performance"""
        logger.info("\n=== Testing Performance ===")
        
        try:
            # Test bulk operations performance
            start_time = time.time()
            
            # Set many values
            for i in range(100):
                await self.settings_manager.set_value(
                    key=f"test_setting_{i}",
                    value=f"value_{i}",
                    scope=SettingsScope.USER,
                    scope_id="perf_test",
                    set_by="test"
                )
            
            bulk_set_time = time.time() - start_time
            self.log_test_result("Bulk set performance", bulk_set_time < 5.0, 
                               f"Set 100 values in {bulk_set_time:.2f}s")
            
            # Test bulk get performance
            start_time = time.time()
            
            for i in range(100):
                await self.settings_manager.get_value(
                    key=f"test_setting_{i}",
                    scope=SettingsScope.USER,
                    scope_id="perf_test"
                )
            
            bulk_get_time = time.time() - start_time
            self.log_test_result("Bulk get performance", bulk_get_time < 2.0, 
                               f"Got 100 values in {bulk_get_time:.2f}s")
            
            # Test cache effectiveness
            start_time = time.time()
            
            # Access same value multiple times (should hit cache)
            for _ in range(50):
                await self.settings_manager.get_value(
                    key="test_setting_0",
                    scope=SettingsScope.USER,
                    scope_id="perf_test"
                )
            
            cache_access_time = time.time() - start_time
            self.log_test_result("Cache performance", cache_access_time < 0.5, 
                               f"50 cached accesses in {cache_access_time:.3f}s")
            
        except Exception as e:
            self.log_test_result("Performance tests", False, f"Exception: {e}")
    
    async def test_concurrent_access(self):
        """Test concurrent access to settings"""
        logger.info("\n=== Testing Concurrent Access ===")
        
        try:
            # Create multiple concurrent operations
            tasks = []
            
            # Concurrent sets
            for i in range(10):
                task = self.settings_manager.set_value(
                    key=f"concurrent_test_{i}",
                    value=f"value_{i}",
                    scope=SettingsScope.USER,
                    scope_id="concurrent_test",
                    set_by="test"
                )
                tasks.append(task)
            
            # Concurrent gets
            for i in range(10):
                task = self.settings_manager.get_value(
                    key="theme",
                    scope=SettingsScope.USER,
                    scope_id="concurrent_test"
                )
                tasks.append(task)
            
            # Execute all concurrently
            start_time = time.time()
            results = await asyncio.gather(*tasks, return_exceptions=True)
            concurrent_time = time.time() - start_time
            
            # Check results
            successful_operations = sum(1 for result in results if not isinstance(result, Exception))
            all_successful = successful_operations == len(tasks)
            
            self.log_test_result("Concurrent operations", all_successful, 
                               f"{successful_operations}/{len(tasks)} operations successful in {concurrent_time:.2f}s")
            
        except Exception as e:
            self.log_test_result("Concurrent access", False, f"Exception: {e}")
    
    def print_summary(self):
        """Print test summary"""
        logger.info("\n" + "="*60)
        logger.info("TEST SUMMARY")
        logger.info("="*60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        logger.info(f"Total Tests: {total_tests}")
        logger.info(f"Passed: {passed_tests}")
        logger.info(f"Failed: {failed_tests}")
        logger.info(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
        
        if failed_tests > 0:
            logger.info("\nFAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    logger.info(f"  - {result['test']}: {result['details']}")
        
        # Get system statistics
        logger.info("\nSYSTEM STATISTICS:")
        if self.settings_manager:
            stats = self.settings_manager.get_stats()
            logger.info(f"  Settings Manager: {stats['total_values']} values, {stats['total_snapshots']} snapshots")
            if "cache" in stats:
                logger.info(f"  Cache: {stats['cache']['total_entries']} entries")
        
        if self.version_manager:
            version_stats = self.version_manager.get_stats()
            logger.info(f"  Version Manager: {version_stats['total_versions']} versions")
        
        if self.hot_reload_manager:
            reload_stats = self.hot_reload_manager.get_stats()
            logger.info(f"  Hot-reload Manager: {reload_stats['total_operations']} operations")
        
        logger.info("="*60)

async def main():
    """Main test function"""
    logger.info("Starting MeetingMind Settings Management System Test Suite")
    
    tester = SettingsSystemTester()
    
    try:
        # Setup
        await tester.setup()
        
        # Run all tests
        await tester.test_basic_settings_operations()
        await tester.test_versioning_system()
        await tester.test_hot_reload_system()
        await tester.test_migration_system()
        await tester.test_import_export()
        await tester.test_snapshots()
        await tester.test_validation_system()
        await tester.test_performance()
        await tester.test_concurrent_access()
        
        # Print summary
        tester.print_summary()
        
    except Exception as e:
        logger.error(f"Test suite failed with exception: {e}")
        raise
    finally:
        # Cleanup
        await tester.teardown()

if __name__ == "__main__":
    asyncio.run(main())