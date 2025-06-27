"""
File Security Utilities
Provides secure file operations and path validation
"""
import os
import re
from pathlib import Path
from typing import Optional, List, Union
import logging
import tempfile
import zipfile

logger = logging.getLogger(__name__)

# Allowed file extensions for different operations
ALLOWED_SETTINGS_EXTENSIONS = ['.json', '.yaml', '.yml', '.toml', '.env', '.properties']
ALLOWED_PLUGIN_EXTENSIONS = ['.py', '.json', '.txt', '.md', '.yml', '.yaml']
ALLOWED_AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.webm', '.m4a']

# Maximum file sizes (in bytes)
MAX_SETTINGS_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_PLUGIN_FILE_SIZE = 50 * 1024 * 1024    # 50MB
MAX_AUDIO_FILE_SIZE = 500 * 1024 * 1024    # 500MB

class SecurePathError(Exception):
    """Raised when a path fails security validation"""
    pass

def get_safe_base_directories() -> List[Path]:
    """Get list of allowed base directories for file operations"""
    return [
        Path.cwd() / "data",
        Path.cwd() / "settings", 
        Path.cwd() / "plugins",
        Path.cwd() / "recordings",
        Path.cwd() / "temp",
        Path(tempfile.gettempdir())
    ]

def validate_file_path(file_path: Union[str, Path], 
                      base_dirs: Optional[List[Path]] = None,
                      allowed_extensions: Optional[List[str]] = None) -> Path:
    """
    Validate file path for security
    
    Args:
        file_path: Path to validate
        base_dirs: Allowed base directories (defaults to safe directories)
        allowed_extensions: Allowed file extensions
        
    Returns:
        Validated Path object
        
    Raises:
        SecurePathError: If path fails validation
    """
    if base_dirs is None:
        base_dirs = get_safe_base_directories()
    
    # Convert to Path object and resolve
    try:
        path = Path(file_path).resolve()
    except (OSError, ValueError) as e:
        raise SecurePathError(f"Invalid path format: {file_path}")
    
    # Check for directory traversal attempts
    if '..' in str(file_path) or str(file_path).startswith('/'):
        raise SecurePathError(f"Path traversal detected: {file_path}")
    
    # Validate against base directories
    if base_dirs:
        path_is_safe = False
        for base_dir in base_dirs:
            try:
                base_resolved = base_dir.resolve()
                # Check if path is within base directory
                path.relative_to(base_resolved)
                path_is_safe = True
                break
            except ValueError:
                continue
        
        if not path_is_safe:
            raise SecurePathError(f"Path outside allowed directories: {file_path}")
    
    # Validate file extension
    if allowed_extensions:
        if path.suffix.lower() not in [ext.lower() for ext in allowed_extensions]:
            raise SecurePathError(f"Invalid file extension: {path.suffix}")
    
    # Additional security checks
    path_str = str(path).lower()
    dangerous_patterns = [
        '/etc/', '/var/', '/usr/', '/bin/', '/sbin/',
        'passwd', 'shadow', '.ssh', '.env'
    ]
    
    for pattern in dangerous_patterns:
        if pattern in path_str:
            raise SecurePathError(f"Access to system file detected: {file_path}")
    
    return path

def validate_file_size(file_path: Path, max_size: int) -> None:
    """
    Validate file size
    
    Args:
        file_path: Path to file
        max_size: Maximum allowed size in bytes
        
    Raises:
        SecurePathError: If file is too large
    """
    try:
        if file_path.exists():
            size = file_path.stat().st_size
            if size > max_size:
                raise SecurePathError(f"File too large: {size} bytes (max: {max_size})")
    except OSError as e:
        raise SecurePathError(f"Cannot check file size: {e}")

def safe_open(file_path: Union[str, Path], 
              mode: str = 'r',
              base_dirs: Optional[List[Path]] = None,
              allowed_extensions: Optional[List[str]] = None,
              max_size: Optional[int] = None,
              **kwargs):
    """
    Safely open a file with path validation
    
    Args:
        file_path: Path to file
        mode: File open mode
        base_dirs: Allowed base directories
        allowed_extensions: Allowed file extensions
        max_size: Maximum file size in bytes
        **kwargs: Additional arguments for open()
        
    Returns:
        File handle
        
    Raises:
        SecurePathError: If path fails validation
    """
    validated_path = validate_file_path(file_path, base_dirs, allowed_extensions)
    
    # Check file size for read operations
    if 'r' in mode and max_size:
        validate_file_size(validated_path, max_size)
    
    # Create parent directory if needed for write operations
    if 'w' in mode or 'a' in mode:
        validated_path.parent.mkdir(parents=True, exist_ok=True)
    
    return open(validated_path, mode, **kwargs)

def safe_extract_zip(zip_path: Union[str, Path], 
                     extract_to: Union[str, Path],
                     max_files: int = 1000,
                     max_size: int = 100 * 1024 * 1024) -> None:
    """
    Safely extract zip file with protection against zip bombs and path traversal
    
    Args:
        zip_path: Path to zip file
        extract_to: Directory to extract to
        max_files: Maximum number of files to extract
        max_size: Maximum total extracted size
        
    Raises:
        SecurePathError: If extraction fails security checks
    """
    zip_path = validate_file_path(zip_path, allowed_extensions=['.zip'])
    extract_path = Path(extract_to).resolve()
    
    # Ensure extract directory exists and is safe
    extract_path.mkdir(parents=True, exist_ok=True)
    
    total_size = 0
    file_count = 0
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            for file_info in zip_ref.infolist():
                file_count += 1
                if file_count > max_files:
                    raise SecurePathError(f"Too many files in zip: {file_count} (max: {max_files})")
                
                # Check for path traversal in zip entries
                if '..' in file_info.filename or file_info.filename.startswith('/'):
                    raise SecurePathError(f"Path traversal in zip entry: {file_info.filename}")
                
                # Calculate extracted file path
                file_path = extract_path / file_info.filename
                try:
                    # Ensure file will be extracted within target directory
                    file_path.resolve().relative_to(extract_path)
                except ValueError:
                    raise SecurePathError(f"Zip entry outside target directory: {file_info.filename}")
                
                # Check uncompressed size
                total_size += file_info.file_size
                if total_size > max_size:
                    raise SecurePathError(f"Total extracted size too large: {total_size} (max: {max_size})")
                
                # Check compression ratio to detect zip bombs
                if file_info.file_size > 0:
                    ratio = file_info.compress_size / file_info.file_size
                    if ratio < 0.01:  # Less than 1% - suspicious compression ratio
                        raise SecurePathError(f"Suspicious compression ratio in: {file_info.filename}")
            
            # Extract all files
            zip_ref.extractall(extract_path)
            
    except zipfile.BadZipFile:
        raise SecurePathError("Invalid or corrupted zip file")
    except Exception as e:
        raise SecurePathError(f"Zip extraction failed: {e}")

def sanitize_filename(filename: str, max_length: int = 255) -> str:
    """
    Sanitize filename to prevent issues
    
    Args:
        filename: Original filename
        max_length: Maximum allowed length
        
    Returns:
        Sanitized filename
    """
    # Remove path separators and dangerous characters
    sanitized = re.sub(r'[<>:"|?*\\/]', '', filename)
    
    # Remove control characters
    sanitized = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', sanitized)
    
    # Limit length
    if len(sanitized) > max_length:
        name, ext = os.path.splitext(sanitized)
        max_name_len = max_length - len(ext)
        sanitized = name[:max_name_len] + ext
    
    # Ensure not empty
    if not sanitized or sanitized in ['.', '..']:
        sanitized = 'file'
    
    return sanitized

def create_secure_temp_file(suffix: str = '', 
                           prefix: str = 'secure_',
                           allowed_extensions: Optional[List[str]] = None) -> Path:
    """
    Create a secure temporary file
    
    Args:
        suffix: File suffix (including extension)
        prefix: File prefix
        allowed_extensions: Allowed extensions for suffix
        
    Returns:
        Path to temporary file
        
    Raises:
        SecurePathError: If suffix is not allowed
    """
    if suffix and allowed_extensions:
        ext = Path(suffix).suffix
        if ext.lower() not in [ext.lower() for ext in allowed_extensions]:
            raise SecurePathError(f"Invalid temporary file extension: {ext}")
    
    # Create secure temporary file
    fd, temp_path = tempfile.mkstemp(suffix=suffix, prefix=prefix)
    os.close(fd)  # Close file descriptor, keep path
    
    return Path(temp_path)