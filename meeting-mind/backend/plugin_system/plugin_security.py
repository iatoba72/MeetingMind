# Plugin Security Framework
# Comprehensive security system for plugin sandboxing and validation

import os
import sys
import ast
import inspect
import importlib
from pathlib import Path
from typing import Dict, List, Set, Optional, Any, Union
from dataclasses import dataclass, field
from enum import Enum
import hashlib
import tempfile
import subprocess
import json
from contextlib import contextmanager

from plugin_api import PluginManifest, PluginCapability

class SecurityLevel(Enum):
    """Security levels for plugin execution"""
    STRICT = "strict"        # Maximum restrictions, minimal permissions
    MODERATE = "moderate"    # Balanced security and functionality
    PERMISSIVE = "permissive"  # Minimal restrictions for trusted plugins
    TRUSTED = "trusted"      # No restrictions for system plugins

class SecurityViolationType(Enum):
    """Types of security violations"""
    UNAUTHORIZED_IMPORT = "unauthorized_import"
    DANGEROUS_FUNCTION = "dangerous_function"
    FILE_ACCESS_VIOLATION = "file_access_violation"
    NETWORK_ACCESS_VIOLATION = "network_access_violation"
    SYSTEM_ACCESS_VIOLATION = "system_access_violation"
    CAPABILITY_VIOLATION = "capability_violation"
    MALICIOUS_CODE = "malicious_code"
    RESOURCE_ABUSE = "resource_abuse"

@dataclass
class SecurityIssue:
    """Security issue found during validation"""
    violation_type: SecurityViolationType
    severity: str  # low, medium, high, critical
    description: str
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    code_snippet: Optional[str] = None
    recommendation: Optional[str] = None

@dataclass
class SecurityValidationResult:
    """Result of security validation"""
    safe: bool
    issues: List[SecurityIssue] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    allowed_capabilities: List[PluginCapability] = field(default_factory=list)
    denied_capabilities: List[PluginCapability] = field(default_factory=list)
    
    def add_issue(self, issue: SecurityIssue):
        """Add security issue"""
        self.issues.append(issue)
        if issue.severity in ['high', 'critical']:
            self.safe = False

@dataclass
class SecurityPolicy:
    """Security policy for plugin execution"""
    security_level: SecurityLevel
    allowed_modules: Set[str] = field(default_factory=set)
    forbidden_modules: Set[str] = field(default_factory=set)
    allowed_functions: Set[str] = field(default_factory=set)
    forbidden_functions: Set[str] = field(default_factory=set)
    file_access_paths: Set[str] = field(default_factory=set)
    network_access: bool = False
    system_access: bool = False
    max_memory_mb: int = 100
    max_cpu_time_seconds: int = 30
    max_file_size_mb: int = 10
    
    @classmethod
    def create_for_level(cls, level: SecurityLevel, capabilities: List[PluginCapability]) -> 'SecurityPolicy':
        """Create security policy for given level and capabilities"""
        policy = cls(security_level=level)
        
        # Base allowed modules for all levels
        base_modules = {
            'json', 'datetime', 'typing', 'dataclasses', 'enum',
            'asyncio', 'functools', 'itertools', 'collections',
            'math', 're', 'uuid', 'hashlib', 'base64'
        }
        
        if level == SecurityLevel.STRICT:
            policy.allowed_modules = base_modules
            policy.forbidden_functions = {
                'eval', 'exec', 'compile', '__import__', 'open',
                'input', 'raw_input', 'file', 'execfile', 'reload'
            }
            policy.max_memory_mb = 50
            policy.max_cpu_time_seconds = 10
            
        elif level == SecurityLevel.MODERATE:
            policy.allowed_modules = base_modules | {
                'requests', 'urllib', 'http', 'pathlib', 'os.path',
                'logging', 'warnings', 'traceback'
            }
            policy.forbidden_functions = {
                'eval', 'exec', 'compile', '__import__'
            }
            policy.max_memory_mb = 100
            policy.max_cpu_time_seconds = 30
            
        elif level == SecurityLevel.PERMISSIVE:
            policy.allowed_modules = base_modules | {
                'requests', 'urllib', 'http', 'pathlib', 'os',
                'subprocess', 'logging', 'warnings', 'traceback',
                'sqlite3', 'json', 'csv', 'xml'
            }
            policy.forbidden_functions = {'eval', 'exec'}
            policy.max_memory_mb = 200
            policy.max_cpu_time_seconds = 60
            
        elif level == SecurityLevel.TRUSTED:
            # No restrictions for trusted plugins
            policy.allowed_modules = set()  # Empty means all allowed
            policy.forbidden_functions = set()
            policy.max_memory_mb = 500
            policy.max_cpu_time_seconds = 300
        
        # Apply capability-based permissions
        policy._apply_capabilities(capabilities)
        
        return policy
    
    def _apply_capabilities(self, capabilities: List[PluginCapability]):
        """Apply capability-based permissions to policy"""
        for capability in capabilities:
            if capability == PluginCapability.NETWORK_ACCESS:
                self.network_access = True
                self.allowed_modules.update(['requests', 'urllib', 'http', 'socket'])
                
            elif capability == PluginCapability.FILE_SYSTEM:
                self.allowed_modules.update(['os', 'pathlib', 'shutil', 'tempfile'])
                
            elif capability == PluginCapability.DATABASE_ACCESS:
                self.allowed_modules.update(['sqlite3', 'sqlalchemy'])
                
            elif capability == PluginCapability.EXTERNAL_APIS:
                self.network_access = True
                self.allowed_modules.update(['requests', 'urllib', 'http'])
                
            elif capability == PluginCapability.BACKGROUND_TASKS:
                self.allowed_modules.update(['threading', 'concurrent.futures'])
                
            elif capability == PluginCapability.ADMIN_ACCESS:
                self.system_access = True
                self.allowed_modules.update(['subprocess', 'os', 'sys'])

class CodeAnalyzer(ast.NodeVisitor):
    """AST-based code analyzer for security validation"""
    
    def __init__(self, policy: SecurityPolicy):
        self.policy = policy
        self.issues = []
        self.current_file = None
        
        # Dangerous patterns
        self.dangerous_functions = {
            'eval', 'exec', 'compile', '__import__', 'globals', 'locals',
            'vars', 'dir', 'getattr', 'setattr', 'delattr', 'hasattr'
        }
        
        self.dangerous_modules = {
            'subprocess', 'os', 'sys', 'importlib', 'types', 'ctypes',
            'marshal', 'pickle', 'dill', 'shelve'
        }
    
    def analyze_file(self, file_path: Path) -> List[SecurityIssue]:
        """Analyze Python file for security issues"""
        self.current_file = str(file_path)
        self.issues = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                source = f.read()
            
            tree = ast.parse(source)
            self.visit(tree)
            
        except SyntaxError as e:
            self.issues.append(SecurityIssue(
                violation_type=SecurityViolationType.MALICIOUS_CODE,
                severity="high",
                description=f"Syntax error in plugin code: {e}",
                file_path=self.current_file,
                line_number=e.lineno
            ))
        except Exception as e:
            self.issues.append(SecurityIssue(
                violation_type=SecurityViolationType.MALICIOUS_CODE,
                severity="medium",
                description=f"Error analyzing code: {e}",
                file_path=self.current_file
            ))
        
        return self.issues
    
    def visit_Import(self, node: ast.Import):
        """Check import statements"""
        for alias in node.names:
            self._check_import(alias.name, node.lineno)
        self.generic_visit(node)
    
    def visit_ImportFrom(self, node: ast.ImportFrom):
        """Check from-import statements"""
        if node.module:
            self._check_import(node.module, node.lineno)
        self.generic_visit(node)
    
    def visit_Call(self, node: ast.Call):
        """Check function calls"""
        func_name = self._get_function_name(node.func)
        
        if func_name in self.dangerous_functions:
            if func_name in self.policy.forbidden_functions:
                self.issues.append(SecurityIssue(
                    violation_type=SecurityViolationType.DANGEROUS_FUNCTION,
                    severity="high",
                    description=f"Use of dangerous function: {func_name}",
                    file_path=self.current_file,
                    line_number=node.lineno,
                    recommendation=f"Remove or replace {func_name} with safer alternative"
                ))
        
        # Check for subprocess calls
        if func_name in ['subprocess.run', 'subprocess.call', 'subprocess.Popen', 'os.system']:
            if not self.policy.system_access:
                self.issues.append(SecurityIssue(
                    violation_type=SecurityViolationType.SYSTEM_ACCESS_VIOLATION,
                    severity="critical",
                    description=f"Unauthorized system access: {func_name}",
                    file_path=self.current_file,
                    line_number=node.lineno
                ))
        
        # Check for file operations
        if func_name in ['open', 'file'] and not self.policy.file_access_paths:
            self.issues.append(SecurityIssue(
                violation_type=SecurityViolationType.FILE_ACCESS_VIOLATION,
                severity="high",
                description=f"Unauthorized file access: {func_name}",
                file_path=self.current_file,
                line_number=node.lineno
            ))
        
        self.generic_visit(node)
    
    def visit_Attribute(self, node: ast.Attribute):
        """Check attribute access"""
        attr_name = self._get_attribute_name(node)
        
        # Check for dangerous attribute access
        if any(dangerous in attr_name for dangerous in ['__code__', '__globals__', '__dict__']):
            self.issues.append(SecurityIssue(
                violation_type=SecurityViolationType.DANGEROUS_FUNCTION,
                severity="high",
                description=f"Access to dangerous attribute: {attr_name}",
                file_path=self.current_file,
                line_number=node.lineno
            ))
        
        self.generic_visit(node)
    
    def _check_import(self, module_name: str, line_number: int):
        """Check if import is allowed"""
        if module_name in self.policy.forbidden_modules:
            self.issues.append(SecurityIssue(
                violation_type=SecurityViolationType.UNAUTHORIZED_IMPORT,
                severity="high",
                description=f"Import of forbidden module: {module_name}",
                file_path=self.current_file,
                line_number=line_number
            ))
        
        # If allowed_modules is not empty and module not in it
        elif (self.policy.allowed_modules and 
              not any(module_name.startswith(allowed) for allowed in self.policy.allowed_modules)):
            
            # Check if it's a dangerous module
            if any(module_name.startswith(dangerous) for dangerous in self.dangerous_modules):
                severity = "critical"
            else:
                severity = "medium"
            
            self.issues.append(SecurityIssue(
                violation_type=SecurityViolationType.UNAUTHORIZED_IMPORT,
                severity=severity,
                description=f"Import of unauthorized module: {module_name}",
                file_path=self.current_file,
                line_number=line_number,
                recommendation=f"Request {module_name} capability or use alternative"
            ))
    
    def _get_function_name(self, node: ast.AST) -> str:
        """Extract function name from call node"""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return self._get_attribute_name(node)
        return "unknown"
    
    def _get_attribute_name(self, node: ast.Attribute) -> str:
        """Extract full attribute name"""
        if isinstance(node.value, ast.Name):
            return f"{node.value.id}.{node.attr}"
        elif isinstance(node.value, ast.Attribute):
            return f"{self._get_attribute_name(node.value)}.{node.attr}"
        return node.attr

class PluginSandbox:
    """Execution sandbox for plugins"""
    
    def __init__(self, plugin_path: Path, policy: SecurityPolicy):
        self.plugin_path = plugin_path
        self.policy = policy
        self.original_modules = {}
        self.restricted_builtins = None
        
    def __enter__(self):
        """Enter sandbox context"""
        self._setup_sandbox()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit sandbox context"""
        self._teardown_sandbox()
    
    def _setup_sandbox(self):
        """Setup execution sandbox"""
        # Restrict builtins
        self.restricted_builtins = self._create_restricted_builtins()
        
        # Store original __import__
        self.original_import = __builtins__['__import__']
        
        # Replace with restricted import
        __builtins__['__import__'] = self._restricted_import
    
    def _teardown_sandbox(self):
        """Teardown execution sandbox"""
        # Restore original __import__
        if self.original_import:
            __builtins__['__import__'] = self.original_import
    
    def _create_restricted_builtins(self) -> Dict[str, Any]:
        """Create restricted builtins dictionary"""
        safe_builtins = {
            # Safe built-in functions
            'abs', 'all', 'any', 'bin', 'bool', 'bytearray', 'bytes',
            'callable', 'chr', 'classmethod', 'complex', 'dict', 'divmod',
            'enumerate', 'filter', 'float', 'format', 'frozenset',
            'getattr', 'hasattr', 'hash', 'hex', 'id', 'int', 'isinstance',
            'issubclass', 'iter', 'len', 'list', 'map', 'max', 'memoryview',
            'min', 'next', 'object', 'oct', 'ord', 'pow', 'property',
            'range', 'repr', 'reversed', 'round', 'set', 'setattr',
            'slice', 'sorted', 'staticmethod', 'str', 'sum', 'super',
            'tuple', 'type', 'vars', 'zip'
        }
        
        # Remove dangerous functions based on policy
        if self.policy.security_level == SecurityLevel.STRICT:
            safe_builtins -= {'getattr', 'setattr', 'vars'}
        
        return {
            name: getattr(__builtins__, name)
            for name in safe_builtins
            if hasattr(__builtins__, name)
        }
    
    def _restricted_import(self, name, globals=None, locals=None, fromlist=(), level=0):
        """Restricted import function"""
        # Check if module is allowed
        if self.policy.allowed_modules:
            if not any(name.startswith(allowed) for allowed in self.policy.allowed_modules):
                raise ImportError(f"Import of '{name}' not allowed by security policy")
        
        # Check if module is forbidden
        if name in self.policy.forbidden_modules:
            raise ImportError(f"Import of '{name}' forbidden by security policy")
        
        # Perform the import
        return self.original_import(name, globals, locals, fromlist, level)

class PluginSecurityManager:
    """Main security manager for plugins"""
    
    def __init__(self):
        self.known_malware_hashes = set()
        self.load_malware_signatures()
    
    def load_malware_signatures(self):
        """Load known malware signatures"""
        # In production, this would load from a security database
        # For now, just initialize empty set
        pass
    
    def validate_plugin(self, plugin_path: Path) -> SecurityValidationResult:
        """Comprehensive security validation of plugin"""
        result = SecurityValidationResult(safe=True)
        
        # Load manifest for security policy
        manifest_path = plugin_path / "manifest.json"
        if not manifest_path.exists():
            result.add_issue(SecurityIssue(
                violation_type=SecurityViolationType.MALICIOUS_CODE,
                severity="critical",
                description="Missing manifest.json file"
            ))
            return result
        
        try:
            with open(manifest_path, 'r') as f:
                manifest_data = json.load(f)
            
            # Create security policy
            security_level = SecurityLevel(manifest_data.get('sandbox_level', 'strict'))
            capabilities = [PluginCapability(cap) for cap in manifest_data.get('capabilities', [])]
            policy = SecurityPolicy.create_for_level(security_level, capabilities)
            
            # Validate capabilities
            self._validate_capabilities(manifest_data, result)
            
            # Analyze Python files
            self._analyze_python_files(plugin_path, policy, result)
            
            # Check file integrity
            self._check_file_integrity(plugin_path, result)
            
            # Check for malware signatures
            self._check_malware_signatures(plugin_path, result)
            
        except Exception as e:
            result.add_issue(SecurityIssue(
                violation_type=SecurityViolationType.MALICIOUS_CODE,
                severity="high",
                description=f"Error during security validation: {e}"
            ))
        
        return result
    
    def _validate_capabilities(self, manifest_data: Dict[str, Any], result: SecurityValidationResult):
        """Validate requested capabilities"""
        requested_caps = manifest_data.get('capabilities', [])
        
        # Check for dangerous capability combinations
        if ('admin:access' in requested_caps and 
            'network:access' in requested_caps):
            result.add_issue(SecurityIssue(
                violation_type=SecurityViolationType.CAPABILITY_VIOLATION,
                severity="critical",
                description="Dangerous combination: admin access + network access",
                recommendation="Split functionality or use lower privileges"
            ))
        
        # Check for excessive capabilities
        if len(requested_caps) > 10:
            result.add_issue(SecurityIssue(
                violation_type=SecurityViolationType.CAPABILITY_VIOLATION,
                severity="medium",
                description=f"Plugin requests {len(requested_caps)} capabilities (excessive)",
                recommendation="Review if all capabilities are necessary"
            ))
    
    def _analyze_python_files(self, plugin_path: Path, policy: SecurityPolicy, result: SecurityValidationResult):
        """Analyze all Python files in plugin"""
        analyzer = CodeAnalyzer(policy)
        
        for py_file in plugin_path.rglob("*.py"):
            issues = analyzer.analyze_file(py_file)
            result.issues.extend(issues)
            
            # Update safe status based on critical issues
            for issue in issues:
                if issue.severity == "critical":
                    result.safe = False
    
    def _check_file_integrity(self, plugin_path: Path, result: SecurityValidationResult):
        """Check file integrity and suspicious patterns"""
        for file_path in plugin_path.rglob("*"):
            if file_path.is_file():
                try:
                    # Check file size
                    size_mb = file_path.stat().st_size / (1024 * 1024)
                    if size_mb > 50:  # 50MB limit
                        result.add_issue(SecurityIssue(
                            violation_type=SecurityViolationType.RESOURCE_ABUSE,
                            severity="medium",
                            description=f"Large file detected: {file_path.name} ({size_mb:.1f}MB)",
                            file_path=str(file_path)
                        ))
                    
                    # Check for binary executables
                    if file_path.suffix in ['.exe', '.dll', '.so', '.dylib']:
                        result.add_issue(SecurityIssue(
                            violation_type=SecurityViolationType.MALICIOUS_CODE,
                            severity="high",
                            description=f"Binary executable found: {file_path.name}",
                            file_path=str(file_path),
                            recommendation="Remove binary files or justify their necessity"
                        ))
                    
                except Exception:
                    # Skip files that can't be accessed
                    pass
    
    def _check_malware_signatures(self, plugin_path: Path, result: SecurityValidationResult):
        """Check for known malware signatures"""
        for file_path in plugin_path.rglob("*.py"):
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                
                # Calculate file hash
                file_hash = hashlib.sha256(content).hexdigest()
                
                if file_hash in self.known_malware_hashes:
                    result.add_issue(SecurityIssue(
                        violation_type=SecurityViolationType.MALICIOUS_CODE,
                        severity="critical",
                        description=f"Known malware signature detected in {file_path.name}",
                        file_path=str(file_path)
                    ))
                
                # Check for suspicious patterns in code
                text_content = content.decode('utf-8', errors='ignore')
                suspicious_patterns = [
                    'eval(', 'exec(', '__import__(',
                    'os.system(', 'subprocess.',
                    'socket.', 'urllib.request.',
                    'base64.b64decode('
                ]
                
                for pattern in suspicious_patterns:
                    if pattern in text_content:
                        result.warnings.append(
                            f"Suspicious pattern '{pattern}' found in {file_path.name}"
                        )
                
            except Exception:
                # Skip files that can't be read
                pass
    
    def create_policy(self, manifest: PluginManifest) -> SecurityPolicy:
        """Create security policy from manifest"""
        security_level = SecurityLevel(manifest.sandbox_level)
        return SecurityPolicy.create_for_level(security_level, manifest.capabilities)
    
    def validate_runtime_access(self, plugin_id: str, capability: PluginCapability, context: Dict[str, Any] = None) -> bool:
        """Validate runtime access request"""
        # This would check against the plugin's security policy
        # and current runtime context
        return True

class SecurityError(Exception):
    """Custom exception for security violations"""
    pass

# Security utilities
def scan_plugin_for_vulnerabilities(plugin_path: str) -> SecurityValidationResult:
    """Scan plugin for security vulnerabilities"""
    manager = PluginSecurityManager()
    return manager.validate_plugin(Path(plugin_path))

def create_security_report(result: SecurityValidationResult) -> Dict[str, Any]:
    """Create security report from validation result"""
    return {
        'safe': result.safe,
        'total_issues': len(result.issues),
        'critical_issues': len([i for i in result.issues if i.severity == 'critical']),
        'high_issues': len([i for i in result.issues if i.severity == 'high']),
        'medium_issues': len([i for i in result.issues if i.severity == 'medium']),
        'low_issues': len([i for i in result.issues if i.severity == 'low']),
        'issues': [
            {
                'type': issue.violation_type.value,
                'severity': issue.severity,
                'description': issue.description,
                'file': issue.file_path,
                'line': issue.line_number,
                'recommendation': issue.recommendation
            }
            for issue in result.issues
        ],
        'warnings': result.warnings
    }