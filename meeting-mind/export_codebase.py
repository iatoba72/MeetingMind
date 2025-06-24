#!/usr/bin/env python3
"""
MeetingMind Codebase Export Script
Exports all code files, structure, and content to a comprehensive text file
"""

import os
import datetime
import fnmatch
from pathlib import Path
import mimetypes

# Configuration
ROOT_DIR = Path(__file__).parent
OUTPUT_FILE = ROOT_DIR / "gemini_codebase_context_full.txt"

# File patterns to include (case-insensitive) - COMPREHENSIVE for complete export
INCLUDE_PATTERNS = [
    "*.ts", "*.tsx", "*.js", "*.jsx", "*.json", "*.yaml", "*.yml",
    "*.py", "*.md", "*.txt", "*.env*", "*.config.*", "*.conf",
    "*.html", "*.css", "*.scss", "*.sass", "*.less",
    "*.sql", "*.sh", "*.bat", "*.ps1", "*.dockerfile", "Dockerfile*",
    "*.gitignore", "*.gitattributes", "*.editorconfig",
    "*.lock", "*.toml", "*.ini", "*.cfg", "*.properties",
    "*.xml", "*.svg", "*.vue", "*.svelte", "*.php", "*.rb",
    "*.go", "*.rs", "*.cpp", "*.c", "*.h", "*.hpp",
    "*.java", "*.kt", "*.swift", "*.dart", "*.r",
    "package.json", "requirements.txt", "Pipfile", "poetry.lock",
    "Cargo.toml", "go.mod", "pom.xml", "build.gradle",
    "tsconfig*.json", "vite.config.*", "webpack.config.*",
    "tailwind.config.*", "postcss.config.*", "babel.config.*",
    "eslint.config.*", ".eslintrc*", ".prettierrc*", "jest.config.*",
    "*.mako", "*.makefile", "Makefile", "*.cmake", "CMakeLists.txt",
    "*.1", "*.example", "*.template", "*.spec", "*.test.*",
    "LICENSE", "COPYING", "README", "CHANGELOG", "VERSION",
    "*.dev", "*.prod", "*.staging", "*.local", "*.backend", "*.frontend"
]

# Directories to exclude
EXCLUDE_DIRS = {
    "node_modules", "__pycache__", ".git", ".vscode", ".idea",
    "dist", "build", "coverage", ".nyc_output", "target",
    ".pytest_cache", ".mypy_cache", ".tox", "venv", "env",
    ".env", "virtualenv", ".virtualenv", "site-packages",
    "vendor", "bower_components", ".next", ".nuxt", ".cache",
    "tmp", "temp", ".tmp", ".temp", "logs", "log",
    ".DS_Store", "Thumbs.db", ".sass-cache", ".parcel-cache",
    "gh_2.74.2_linux_amd64"  # Exclude gh manual pages directory
}

# Files to exclude (specific filenames) - minimal exclusions for complete export
EXCLUDE_FILES = {
    "gemini_codebase_context_full.txt"  # Don't include the output file itself
}

# File extensions to exclude (binary files)
EXCLUDE_EXTENSIONS = {
    ".exe", ".dll", ".so", ".dylib", ".bin", ".obj", ".o",
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".tiff",
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".wmv", ".flv",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".zip", ".tar", ".gz", ".rar", ".7z", ".bz2", ".xz",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".db", ".sqlite", ".sqlite3", ".mdb", ".accdb"
}

# Maximum file size to include (in bytes) - NO LIMIT for complete export
MAX_FILE_SIZE = float('inf')  # No limit - include everything

def should_include_file(file_path: Path) -> bool:
    """Check if a file should be included in the export"""
    
    # Check if filename should be excluded
    if file_path.name in EXCLUDE_FILES:
        return False
    
    # Check if file extension should be excluded
    if file_path.suffix.lower() in EXCLUDE_EXTENSIONS:
        return False
    
    # Check file size
    try:
        if file_path.stat().st_size > MAX_FILE_SIZE:
            return False
    except (OSError, IOError):
        return False
    
    # Check if filename matches include patterns
    filename = file_path.name.lower()
    filename_full = file_path.name  # Also check non-lowercase
    for pattern in INCLUDE_PATTERNS:
        if fnmatch.fnmatch(filename, pattern.lower()) or fnmatch.fnmatch(filename_full, pattern):
            return True
    
    # Check if it's a text file by content
    try:
        mime_type, _ = mimetypes.guess_type(str(file_path))
        if mime_type and mime_type.startswith('text/'):
            return True
    except:
        pass
    
    # Be more aggressive - try to read any file that might be text
    try:
        # Skip very large files only if they're clearly binary
        file_size = file_path.stat().st_size
        if file_size > 50 * 1024 * 1024:  # 50MB limit for text detection
            return False
            
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content_sample = f.read(1000)  # Read more to better detect text
            # Check if content looks like text (has reasonable ratio of printable chars)
            printable_chars = sum(1 for c in content_sample if c.isprintable() or c.isspace())
            if len(content_sample) > 0 and printable_chars / len(content_sample) > 0.7:
                return True
    except (UnicodeDecodeError, IOError, OSError):
        pass
    
    return False

def should_exclude_dir(dir_path: Path) -> bool:
    """Check if a directory should be excluded"""
    dir_name = dir_path.name.lower()
    return dir_name in {d.lower() for d in EXCLUDE_DIRS}

def get_directory_tree(root_path: Path, prefix: str = "") -> str:
    """Generate a visual directory tree structure"""
    tree_lines = []
    
    try:
        items = sorted(root_path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
        
        for i, item in enumerate(items):
            if should_exclude_dir(item) and item.is_dir():
                continue
                
            is_last = i == len(items) - 1
            current_prefix = "└── " if is_last else "├── "
            tree_lines.append(f"{prefix}{current_prefix}{item.name}")
            
            if item.is_dir() and not should_exclude_dir(item):
                extension = "    " if is_last else "│   "
                subtree = get_directory_tree(item, prefix + extension)
                if subtree:
                    tree_lines.append(subtree)
    
    except PermissionError:
        pass
    
    return "\n".join(tree_lines)

def get_file_stats(root_path: Path) -> dict:
    """Calculate statistics about the codebase"""
    stats = {
        'total_files': 0,
        'total_lines': 0,
        'total_size': 0,
        'file_types': {},
        'directories': 0,
        'languages': {}
    }
    
    for root, dirs, files in os.walk(root_path):
        root_path_obj = Path(root)
        
        # Exclude certain directories
        dirs[:] = [d for d in dirs if not should_exclude_dir(root_path_obj / d)]
        
        stats['directories'] += 1
        
        for file in files:
            file_path = root_path_obj / file
            
            if not should_include_file(file_path):
                continue
            
            try:
                file_size = file_path.stat().st_size
                stats['total_files'] += 1
                stats['total_size'] += file_size
                
                # Count file types
                ext = file_path.suffix.lower()
                if ext:
                    stats['file_types'][ext] = stats['file_types'].get(ext, 0) + 1
                else:
                    stats['file_types']['no_extension'] = stats['file_types'].get('no_extension', 0) + 1
                
                # Count lines
                try:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        lines = sum(1 for _ in f)
                        stats['total_lines'] += lines
                        
                        # Language detection
                        if ext in ['.ts', '.tsx']:
                            stats['languages']['TypeScript'] = stats['languages'].get('TypeScript', 0) + lines
                        elif ext in ['.js', '.jsx']:
                            stats['languages']['JavaScript'] = stats['languages'].get('JavaScript', 0) + lines
                        elif ext == '.py':
                            stats['languages']['Python'] = stats['languages'].get('Python', 0) + lines
                        elif ext in ['.css', '.scss', '.sass', '.less']:
                            stats['languages']['CSS'] = stats['languages'].get('CSS', 0) + lines
                        elif ext in ['.html', '.htm']:
                            stats['languages']['HTML'] = stats['languages'].get('HTML', 0) + lines
                        elif ext in ['.md']:
                            stats['languages']['Markdown'] = stats['languages'].get('Markdown', 0) + lines
                        elif ext in ['.json']:
                            stats['languages']['JSON'] = stats['languages'].get('JSON', 0) + lines
                        elif ext in ['.yaml', '.yml']:
                            stats['languages']['YAML'] = stats['languages'].get('YAML', 0) + lines
                        else:
                            stats['languages']['Other'] = stats['languages'].get('Other', 0) + lines
                            
                except (UnicodeDecodeError, IOError):
                    pass
                    
            except (OSError, IOError):
                pass
    
    return stats

def format_size(size_bytes: int) -> str:
    """Format file size in human readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"

def export_file_content(file_path: Path, output_file) -> bool:
    """Export the content of a single file"""
    try:
        relative_path = file_path.relative_to(ROOT_DIR)
        file_size = file_path.stat().st_size
        
        output_file.write(f"\n{'='*80}\n")
        output_file.write(f"FILE: {relative_path}\n")
        output_file.write(f"SIZE: {format_size(file_size)}\n")
        output_file.write(f"MODIFIED: {datetime.datetime.fromtimestamp(file_path.stat().st_mtime)}\n")
        output_file.write(f"{'='*80}\n\n")
        
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
            # Add line numbers for ALL text files (not just specific types)
            lines = content.split('\n')
            numbered_content = []
            for i, line in enumerate(lines, 1):
                numbered_content.append(f"{i:5d}→ {line}")
            content = '\n'.join(numbered_content)
            
            output_file.write(content)
            output_file.write("\n\n")
        
        return True
        
    except (UnicodeDecodeError, IOError, OSError) as e:
        output_file.write(f"ERROR reading file {file_path}: {e}\n\n")
        return False

def main():
    """Main export function"""
    print(f"🚀 Starting MeetingMind codebase export...")
    print(f"📁 Root directory: {ROOT_DIR}")
    print(f"📄 Output file: {OUTPUT_FILE}")
    
    # Calculate statistics
    print("📊 Calculating codebase statistics...")
    stats = get_file_stats(ROOT_DIR)
    
    # Start writing the export file
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as output:
        # Header
        output.write("# MeetingMind Codebase Context for Gemini\n")
        output.write(f"Generated: {datetime.datetime.now().isoformat()}\n")
        output.write(f"Root Path: {ROOT_DIR}\n")
        output.write("\n")
        
        # Statistics
        output.write("## Codebase Statistics\n")
        output.write(f"- Total Files: {stats['total_files']:,}\n")
        output.write(f"- Total Lines: {stats['total_lines']:,}\n")
        output.write(f"- Total Size: {format_size(stats['total_size'])}\n")
        output.write(f"- Directories: {stats['directories']:,}\n")
        output.write("\n")
        
        # File types breakdown
        output.write("### File Types Distribution\n")
        for ext, count in sorted(stats['file_types'].items(), key=lambda x: x[1], reverse=True):
            percentage = (count / stats['total_files']) * 100
            output.write(f"- {ext}: {count:,} files ({percentage:.1f}%)\n")
        output.write("\n")
        
        # Language breakdown
        if stats['languages']:
            output.write("### Language Distribution (by lines)\n")
            for lang, lines in sorted(stats['languages'].items(), key=lambda x: x[1], reverse=True):
                percentage = (lines / stats['total_lines']) * 100
                output.write(f"- {lang}: {lines:,} lines ({percentage:.1f}%)\n")
            output.write("\n")
        
        # Directory structure
        output.write("## Directory Structure\n")
        output.write("```\n")
        output.write(f"{ROOT_DIR.name}/\n")
        tree = get_directory_tree(ROOT_DIR)
        output.write(tree)
        output.write("\n```\n\n")
        
        # Export configuration
        output.write("## Export Configuration\n")
        output.write("### Included File Patterns:\n")
        for pattern in INCLUDE_PATTERNS:
            output.write(f"- {pattern}\n")
        output.write("\n")
        
        output.write("### Excluded Directories:\n")
        for dir_name in sorted(EXCLUDE_DIRS):
            output.write(f"- {dir_name}\n")
        output.write("\n")
        
        output.write("### Excluded Extensions:\n")
        for ext in sorted(EXCLUDE_EXTENSIONS):
            output.write(f"- {ext}\n")
        output.write("\n")
        
        output.write(f"### Maximum File Size: {format_size(MAX_FILE_SIZE)}\n\n")
        
        # File contents
        output.write("## Complete File Contents\n\n")
        
        # Walk through all files and export content
        exported_count = 0
        skipped_count = 0
        
        for root, dirs, files in os.walk(ROOT_DIR):
            root_path = Path(root)
            
            # Exclude certain directories
            dirs[:] = [d for d in dirs if not should_exclude_dir(root_path / d)]
            
            for file in sorted(files):
                file_path = root_path / file
                
                if not should_include_file(file_path):
                    skipped_count += 1
                    continue
                
                print(f"📝 Exporting: {file_path.relative_to(ROOT_DIR)}")
                
                if export_file_content(file_path, output):
                    exported_count += 1
                else:
                    skipped_count += 1
        
        # Footer
        output.write("\n" + "="*80 + "\n")
        output.write("# Export Summary\n")
        output.write(f"- Files exported: {exported_count:,}\n")
        output.write(f"- Files skipped: {skipped_count:,}\n")
        output.write(f"- Export completed: {datetime.datetime.now().isoformat()}\n")
        output.write("="*80 + "\n")
    
    # Final summary
    print(f"\n✅ Export completed successfully!")
    print(f"📊 Statistics:")
    print(f"   - Files exported: {exported_count:,}")
    print(f"   - Files skipped: {skipped_count:,}")
    print(f"   - Total lines: {stats['total_lines']:,}")
    print(f"   - Total size: {format_size(stats['total_size'])}")
    print(f"📄 Output file: {OUTPUT_FILE}")
    print(f"📏 Output size: {format_size(OUTPUT_FILE.stat().st_size)}")

if __name__ == "__main__":
    main()