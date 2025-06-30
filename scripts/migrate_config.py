#!/usr/bin/env python3
"""
Configuration Migration Script for MeetingMind
Helps migrate from hardcoded values to environment variables
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import Dict, Any, List, Tuple


class ConfigMigrator:
    """Migrate hardcoded configuration to environment variables"""
    
    def __init__(self):
        self.current_values = {}
        self.env_mapping = {
            # Meeting configuration
            'MAX_PARTICIPANTS': 'VITE_MEETING_MAX_PARTICIPANTS',
            'MAX_MEETING_DURATION': 'VITE_MEETING_MAX_DURATION',
            'AUTO_SAVE_INTERVAL': 'VITE_MEETING_AUTO_SAVE_INTERVAL',
            'SUMMARY_GENERATION_DELAY': 'VITE_MEETING_SUMMARY_DELAY',
            
            # Audio configuration
            'SAMPLE_RATE': 'VITE_AUDIO_SAMPLE_RATE',
            'CHANNELS': 'VITE_AUDIO_CHANNELS',
            'BIT_DEPTH': 'VITE_AUDIO_BIT_DEPTH',
            'CHUNK_SIZE': 'VITE_AUDIO_CHUNK_SIZE',
            'MAX_RECORDING_DURATION': 'VITE_AUDIO_MAX_RECORDING_DURATION',
            'SILENCE_THRESHOLD': 'VITE_AUDIO_SILENCE_THRESHOLD',
            'SILENCE_DURATION': 'VITE_AUDIO_SILENCE_DURATION',
            
            # AI configuration
            'MIN_TRANSCRIPTION_LENGTH': 'VITE_AI_MIN_TRANSCRIPTION_LENGTH',
            'SUMMARY_UPDATE_INTERVAL': 'VITE_AI_SUMMARY_UPDATE_INTERVAL',
            'SENTIMENT_ANALYSIS_WINDOW': 'VITE_AI_SENTIMENT_WINDOW',
            'ACTION_ITEM_CONFIDENCE_THRESHOLD': 'VITE_AI_ACTION_CONFIDENCE',
            'SPEAKER_IDENTIFICATION_THRESHOLD': 'VITE_AI_SPEAKER_THRESHOLD',
            
            # API configuration
            'TIMEOUT': 'VITE_API_TIMEOUT',
            'RETRY_ATTEMPTS': 'VITE_API_RETRY_ATTEMPTS',
            'RETRY_DELAY': 'VITE_API_RETRY_DELAY',
            
            # WebSocket configuration
            'RECONNECT_INTERVAL': 'VITE_WS_RECONNECT_INTERVAL',
            'MAX_RECONNECT_ATTEMPTS': 'VITE_WS_MAX_RECONNECT_ATTEMPTS',
            'HEARTBEAT_INTERVAL': 'VITE_WS_HEARTBEAT_INTERVAL',
            'MESSAGE_QUEUE_SIZE': 'VITE_WS_MESSAGE_QUEUE_SIZE',
            
            # UI configuration
            'NOTIFICATION_DURATION': 'VITE_UI_NOTIFICATION_DURATION',
            'SEARCH_DEBOUNCE_DELAY': 'VITE_UI_SEARCH_DEBOUNCE',
            'INFINITE_SCROLL_THRESHOLD': 'VITE_UI_SCROLL_THRESHOLD',
            'MAX_UPLOAD_SIZE': 'VITE_UI_MAX_UPLOAD_SIZE',
            
            # Security configuration
            'JWT_EXPIRY': 'VITE_SECURITY_JWT_EXPIRY',
            'REFRESH_TOKEN_EXPIRY': 'VITE_SECURITY_REFRESH_EXPIRY',
            'PASSWORD_MIN_LENGTH': 'VITE_SECURITY_PASSWORD_MIN_LENGTH',
            
            # Feature flags
            'AI_INSIGHTS': 'VITE_FEATURE_AI_INSIGHTS',
            'REAL_TIME_TRANSCRIPTION': 'VITE_FEATURE_REAL_TIME_TRANSCRIPTION',
            'SENTIMENT_ANALYSIS': 'VITE_FEATURE_SENTIMENT_ANALYSIS',
            'ACTION_ITEM_DETECTION': 'VITE_FEATURE_ACTION_ITEM_DETECTION',
            'SPEAKER_IDENTIFICATION': 'VITE_FEATURE_SPEAKER_IDENTIFICATION',
            'MEETING_ANALYTICS': 'VITE_FEATURE_MEETING_ANALYTICS',
            'CALENDAR_INTEGRATION': 'VITE_FEATURE_CALENDAR_INTEGRATION',
            'MULTI_LANGUAGE_SUPPORT': 'VITE_FEATURE_MULTI_LANGUAGE_SUPPORT',
        }
        
        # Default values from the original constants
        self.defaults = {
            'VITE_MEETING_MAX_PARTICIPANTS': 50,
            'VITE_MEETING_MAX_DURATION': 480,
            'VITE_MEETING_AUTO_SAVE_INTERVAL': 30000,
            'VITE_MEETING_SUMMARY_DELAY': 5000,
            'VITE_AUDIO_SAMPLE_RATE': 16000,
            'VITE_AUDIO_CHANNELS': 1,
            'VITE_AUDIO_BIT_DEPTH': 16,
            'VITE_AUDIO_CHUNK_SIZE': 4096,
            'VITE_AUDIO_MAX_RECORDING_DURATION': 10800000,
            'VITE_AUDIO_SILENCE_THRESHOLD': 0.01,
            'VITE_AUDIO_SILENCE_DURATION': 2000,
            'VITE_AI_MIN_TRANSCRIPTION_LENGTH': 50,
            'VITE_AI_SUMMARY_UPDATE_INTERVAL': 60000,
            'VITE_AI_SENTIMENT_WINDOW': 300000,
            'VITE_AI_ACTION_CONFIDENCE': 0.7,
            'VITE_AI_SPEAKER_THRESHOLD': 0.8,
            'VITE_API_TIMEOUT': 30000,
            'VITE_API_RETRY_ATTEMPTS': 3,
            'VITE_API_RETRY_DELAY': 1000,
            'VITE_WS_RECONNECT_INTERVAL': 5000,
            'VITE_WS_MAX_RECONNECT_ATTEMPTS': 10,
            'VITE_WS_HEARTBEAT_INTERVAL': 30000,
            'VITE_WS_MESSAGE_QUEUE_SIZE': 100,
            'VITE_UI_NOTIFICATION_DURATION': 5000,
            'VITE_UI_SEARCH_DEBOUNCE': 300,
            'VITE_UI_SCROLL_THRESHOLD': 100,
            'VITE_UI_MAX_UPLOAD_SIZE': 10485760,
            'VITE_SECURITY_JWT_EXPIRY': 3600,
            'VITE_SECURITY_REFRESH_EXPIRY': 604800,
            'VITE_SECURITY_PASSWORD_MIN_LENGTH': 8,
            'VITE_FEATURE_AI_INSIGHTS': True,
            'VITE_FEATURE_REAL_TIME_TRANSCRIPTION': True,
            'VITE_FEATURE_SENTIMENT_ANALYSIS': True,
            'VITE_FEATURE_ACTION_ITEM_DETECTION': True,
            'VITE_FEATURE_SPEAKER_IDENTIFICATION': False,
            'VITE_FEATURE_MEETING_ANALYTICS': True,
            'VITE_FEATURE_CALENDAR_INTEGRATION': False,
            'VITE_FEATURE_MULTI_LANGUAGE_SUPPORT': False,
        }
    
    def scan_current_config(self, config_file: str) -> Dict[str, Any]:
        """Scan current configuration from existing files"""
        current_config = {}
        
        if os.path.exists(config_file):
            try:
                with open(config_file, 'r') as f:
                    content = f.read()
                    
                # Extract hardcoded values using simple parsing
                for old_key, new_key in self.env_mapping.items():
                    if old_key in content:
                        # Try to extract the value
                        lines = content.split('\n')
                        for line in lines:
                            if old_key in line and ':' in line:
                                try:
                                    # Simple extraction - this could be improved with AST parsing
                                    value_part = line.split(':')[1].split(',')[0].strip()
                                    # Remove comments and clean up
                                    value_part = value_part.split('//')[0].strip()
                                    
                                    # Try to parse the value
                                    if value_part.lower() in ['true', 'false']:
                                        current_config[new_key] = value_part.lower() == 'true'
                                    elif value_part.replace('.', '').replace('-', '').isdigit():
                                        if '.' in value_part:
                                            current_config[new_key] = float(value_part)
                                        else:
                                            current_config[new_key] = int(value_part)
                                    else:
                                        current_config[new_key] = value_part.strip('\'"')
                                except (ValueError, TypeError, AttributeError):
                                    # Use default if parsing fails
                                    current_config[new_key] = self.defaults.get(new_key)
                                break
                
            except Exception as e:
                print(f"Warning: Could not parse {config_file}: {e}")
        
        return current_config
    
    def generate_env_file(self, output_file: str, custom_values: Dict[str, Any] = None, 
                         environment: str = 'development') -> None:
        """Generate .env file with configuration"""
        
        custom_values = custom_values or {}
        
        env_content = f"""# MeetingMind Environment Configuration
# Generated by migration script for {environment} environment
# Copy values to your production .env file and modify as needed

# =============================================================================
# Core API Configuration
# =============================================================================
"""
        
        if environment == 'production':
            env_content += """# Production API endpoints - CHANGE THESE
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com/ws

"""
        else:
            env_content += """# Development API endpoints
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws

"""
        
        # Group configurations by category
        categories = {
            'Meeting Configuration': [
                'VITE_MEETING_MAX_PARTICIPANTS',
                'VITE_MEETING_MAX_DURATION',
                'VITE_MEETING_AUTO_SAVE_INTERVAL',
                'VITE_MEETING_SUMMARY_DELAY',
            ],
            'Audio Configuration': [
                'VITE_AUDIO_SAMPLE_RATE',
                'VITE_AUDIO_CHANNELS',
                'VITE_AUDIO_BIT_DEPTH',
                'VITE_AUDIO_CHUNK_SIZE',
                'VITE_AUDIO_MAX_RECORDING_DURATION',
                'VITE_AUDIO_SILENCE_THRESHOLD',
                'VITE_AUDIO_SILENCE_DURATION',
            ],
            'AI Configuration': [
                'VITE_AI_MIN_TRANSCRIPTION_LENGTH',
                'VITE_AI_SUMMARY_UPDATE_INTERVAL',
                'VITE_AI_SENTIMENT_WINDOW',
                'VITE_AI_ACTION_CONFIDENCE',
                'VITE_AI_SPEAKER_THRESHOLD',
            ],
            'API Configuration': [
                'VITE_API_TIMEOUT',
                'VITE_API_RETRY_ATTEMPTS',
                'VITE_API_RETRY_DELAY',
            ],
            'WebSocket Configuration': [
                'VITE_WS_RECONNECT_INTERVAL',
                'VITE_WS_MAX_RECONNECT_ATTEMPTS',
                'VITE_WS_HEARTBEAT_INTERVAL',
                'VITE_WS_MESSAGE_QUEUE_SIZE',
            ],
            'UI Configuration': [
                'VITE_UI_NOTIFICATION_DURATION',
                'VITE_UI_SEARCH_DEBOUNCE',
                'VITE_UI_SCROLL_THRESHOLD',
                'VITE_UI_MAX_UPLOAD_SIZE',
            ],
            'Security Configuration': [
                'VITE_SECURITY_JWT_EXPIRY',
                'VITE_SECURITY_REFRESH_EXPIRY',
                'VITE_SECURITY_PASSWORD_MIN_LENGTH',
            ],
            'Feature Flags': [
                'VITE_FEATURE_AI_INSIGHTS',
                'VITE_FEATURE_REAL_TIME_TRANSCRIPTION',
                'VITE_FEATURE_SENTIMENT_ANALYSIS',
                'VITE_FEATURE_ACTION_ITEM_DETECTION',
                'VITE_FEATURE_SPEAKER_IDENTIFICATION',
                'VITE_FEATURE_MEETING_ANALYTICS',
                'VITE_FEATURE_CALENDAR_INTEGRATION',
                'VITE_FEATURE_MULTI_LANGUAGE_SUPPORT',
            ]
        }
        
        for category, env_vars in categories.items():
            env_content += f"\n# =============================================================================\n"
            env_content += f"# {category}\n"
            env_content += f"# =============================================================================\n"
            
            for env_var in env_vars:
                value = custom_values.get(env_var, self.defaults.get(env_var))
                
                # Format the value appropriately
                if isinstance(value, bool):
                    value_str = str(value).lower()
                else:
                    value_str = str(value)
                
                env_content += f"{env_var}={value_str}\n"
        
        # Add environment-specific recommendations
        if environment == 'production':
            env_content += f"""
# =============================================================================
# Production-Specific Settings
# =============================================================================
# Increase limits for production
VITE_MEETING_MAX_PARTICIPANTS=100
VITE_MEETING_MAX_DURATION=720  # 12 hours
VITE_UI_MAX_UPLOAD_SIZE=52428800  # 50MB

# Tighter security for production
VITE_SECURITY_JWT_EXPIRY=1800  # 30 minutes
VITE_SECURITY_PASSWORD_MIN_LENGTH=12

# Production feature flags
VITE_FEATURE_SPEAKER_IDENTIFICATION=true
VITE_FEATURE_CALENDAR_INTEGRATION=true
"""
        
        # Write the file
        with open(output_file, 'w') as f:
            f.write(env_content)
        
        print(f"Generated {output_file} for {environment} environment")
    
    def validate_current_env(self) -> List[Tuple[str, str, Any]]:
        """Validate current environment variables"""
        issues = []
        
        for env_var, default_value in self.defaults.items():
            current_value = os.getenv(env_var)
            
            if current_value is None:
                issues.append((env_var, "missing", f"will use default: {default_value}"))
            else:
                # Try to validate the type
                try:
                    if isinstance(default_value, bool):
                        if current_value.lower() not in ['true', 'false', '1', '0']:
                            issues.append((env_var, "invalid_boolean", current_value))
                    elif isinstance(default_value, int):
                        int(current_value)
                    elif isinstance(default_value, float):
                        float(current_value)
                except ValueError:
                    issues.append((env_var, "invalid_type", current_value))
        
        return issues
    
    def create_deployment_configs(self, output_dir: str) -> None:
        """Create deployment-specific configuration files"""
        os.makedirs(output_dir, exist_ok=True)
        
        # Development environment
        dev_values = self.defaults.copy()
        dev_values.update({
            'VITE_MEETING_MAX_PARTICIPANTS': 10,  # Smaller for testing
            'VITE_SECURITY_JWT_EXPIRY': 7200,     # Longer for dev convenience
            'VITE_FEATURE_SPEAKER_IDENTIFICATION': True,  # Enable experimental features
        })
        self.generate_env_file(f"{output_dir}/.env.development", dev_values, 'development')
        
        # Staging environment
        staging_values = self.defaults.copy()
        staging_values.update({
            'VITE_MEETING_MAX_PARTICIPANTS': 25,
            'VITE_MEETING_MAX_DURATION': 360,  # 6 hours
            'VITE_SECURITY_JWT_EXPIRY': 3600,
        })
        self.generate_env_file(f"{output_dir}/.env.staging", staging_values, 'staging')
        
        # Production environment
        prod_values = self.defaults.copy()
        prod_values.update({
            'VITE_MEETING_MAX_PARTICIPANTS': 100,
            'VITE_MEETING_MAX_DURATION': 720,  # 12 hours
            'VITE_UI_MAX_UPLOAD_SIZE': 52428800,  # 50MB
            'VITE_SECURITY_JWT_EXPIRY': 1800,  # 30 minutes
            'VITE_SECURITY_PASSWORD_MIN_LENGTH': 12,
            'VITE_FEATURE_CALENDAR_INTEGRATION': True,
        })
        self.generate_env_file(f"{output_dir}/.env.production", prod_values, 'production')
        
        # Docker compose environment
        docker_values = prod_values.copy()
        docker_values.update({
            'VITE_API_BASE_URL': 'http://api:8000',
            'VITE_WS_URL': 'ws://api:8000/ws',
        })
        self.generate_env_file(f"{output_dir}/.env.docker", docker_values, 'docker')
        
        print(f"Created deployment configurations in {output_dir}/")


def main():
    parser = argparse.ArgumentParser(description='Migrate MeetingMind configuration to environment variables')
    parser.add_argument('--scan', type=str, help='Scan existing config file for current values')
    parser.add_argument('--generate', type=str, help='Generate .env file')
    parser.add_argument('--environment', type=str, default='development', 
                       choices=['development', 'staging', 'production', 'docker'],
                       help='Target environment')
    parser.add_argument('--validate', action='store_true', help='Validate current environment variables')
    parser.add_argument('--create-all', type=str, help='Create all deployment configs in specified directory')
    parser.add_argument('--custom-values', type=str, help='JSON file with custom values')
    
    args = parser.parse_args()
    
    migrator = ConfigMigrator()
    
    if args.validate:
        print("Validating current environment variables...")
        issues = migrator.validate_current_env()
        
        if not issues:
            print("✅ All environment variables are valid!")
        else:
            print("⚠️  Found configuration issues:")
            for env_var, issue_type, details in issues:
                print(f"  {env_var}: {issue_type} - {details}")
        return
    
    if args.create_all:
        migrator.create_deployment_configs(args.create_all)
        return
    
    custom_values = {}
    if args.custom_values:
        with open(args.custom_values, 'r') as f:
            custom_values = json.load(f)
    
    if args.scan:
        print(f"Scanning {args.scan} for current configuration...")
        current_config = migrator.scan_current_config(args.scan)
        print("Found configuration:")
        for key, value in current_config.items():
            print(f"  {key}={value}")
        custom_values.update(current_config)
    
    if args.generate:
        migrator.generate_env_file(args.generate, custom_values, args.environment)
    else:
        print("Use --help to see available options")
        print("\nQuick start:")
        print("  python migrate_config.py --create-all ./configs")
        print("  python migrate_config.py --generate .env --environment development")
        print("  python migrate_config.py --validate")


if __name__ == '__main__':
    main()