# MeetingMind Codebase Export Scripts

This directory contains multiple scripts to export the entire MeetingMind codebase to a single text file for analysis, backup, or sharing purposes.

## 🎯 Purpose

These scripts will:
- **Scan** the entire directory structure
- **Export** all source code files with their content
- **Generate** a comprehensive text file with:
  - Directory structure visualization
  - File statistics and metrics
  - Complete source code with line numbers
  - File metadata (size, modification date)

## 📋 Available Scripts

### 1. Python Version (`export_codebase.py`)
**Recommended for most users**

```bash
python export_codebase.py
```

**Features:**
- ✅ Most comprehensive statistics
- ✅ Advanced file filtering
- ✅ Beautiful directory tree
- ✅ Language detection
- ✅ Cross-platform compatibility
- ✅ Progress indicators

**Requirements:** Python 3.6+

### 2. Node.js Version (`export_codebase.js`)
**Best for JavaScript/Node.js environments**

```bash
node export_codebase.js
```

**Features:**
- ✅ No Python dependency
- ✅ Fast execution
- ✅ Comprehensive file analysis
- ✅ Memory efficient
- ✅ Cross-platform

**Requirements:** Node.js 10+

### 3. Shell Script (`export_codebase.sh`)
**For Unix/Linux/macOS systems**

```bash
./export_codebase.sh
```

**Features:**
- ✅ No dependencies (pure bash)
- ✅ Lightweight and fast
- ✅ Colored output
- ✅ Unix-native tools

**Requirements:** Bash shell, standard Unix tools

### 4. Windows Batch (`export_codebase.bat`)
**For Windows systems**

```cmd
export_codebase.bat
```

**Features:**
- ✅ Windows native
- ✅ No additional dependencies
- ✅ Simple double-click execution

**Requirements:** Windows with cmd.exe

## 📁 Output Structure

All scripts generate a file named `complete_codebase_export.txt` containing:

```
# MeetingMind Complete Codebase Export
Generated: 2025-01-10T10:30:00.000Z
Root Path: /path/to/MeetingsHacker

## Codebase Statistics
- Total Files: 1,234
- Total Lines: 45,678
- Total Size: 15.2 MB
- Directories: 89

### File Types Distribution
- .ts: 345 files (28.0%)
- .js: 234 files (19.0%)
- .json: 123 files (10.0%)
- .md: 67 files (5.4%)
...

### Language Distribution (by lines)
- TypeScript: 25,432 lines (55.7%)
- JavaScript: 12,345 lines (27.0%)
- Python: 4,567 lines (10.0%)
...

## Directory Structure
```
MeetingsHacker/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── store/
│   │   └── observability/
│   ├── package.json
│   └── tsconfig.json
├── backend/
└── README.md
```

## Complete File Contents

================================================================================
FILE: frontend/package.json
SIZE: 2.1 KB
MODIFIED: 2025-01-10T10:25:00.000Z
================================================================================

   1│ {
   2│   "name": "meetingmind-frontend",
   3│   "version": "1.0.0",
   4│   ...
```

## 🔧 Configuration

### Included File Types
The scripts automatically include:

**Source Code:**
- TypeScript/JavaScript: `.ts`, `.tsx`, `.js`, `.jsx`
- Python: `.py`
- Styles: `.css`, `.scss`, `.sass`, `.less`
- HTML: `.html`, `.htm`
- SQL: `.sql`

**Configuration:**
- JSON: `.json`
- YAML: `.yaml`, `.yml`
- Config files: `.config`, `.conf`
- Environment: `.env*`

**Documentation:**
- Markdown: `.md`
- Text: `.txt`

**Build/Scripts:**
- Shell: `.sh`, `.bat`, `.ps1`
- Docker: `Dockerfile*`, `docker-compose*.yml`
- Package managers: `package.json`, `requirements.txt`, etc.

### Excluded Directories
- `node_modules/` - Node.js dependencies
- `__pycache__/` - Python cache
- `.git/` - Git repository data
- `dist/`, `build/` - Build outputs
- `coverage/` - Test coverage
- `logs/`, `tmp/` - Temporary files
- IDE folders: `.vscode/`, `.idea/`

### Excluded File Types
- Binary executables: `.exe`, `.dll`, `.so`
- Images: `.png`, `.jpg`, `.gif`, etc.
- Media: `.mp3`, `.mp4`, `.wav`, etc.
- Archives: `.zip`, `.tar`, `.gz`, etc.
- Fonts: `.woff`, `.ttf`, `.eot`
- Databases: `.db`, `.sqlite`

## 🚀 Quick Start

### Option 1: Python (Recommended)
```bash
# Make sure Python is installed
python --version

# Run the export
python export_codebase.py
```

### Option 2: Node.js
```bash
# Make sure Node.js is installed
node --version

# Run the export
node export_codebase.js
```

### Option 3: Shell Script (Unix/Linux/macOS)
```bash
# Make executable (first time only)
chmod +x export_codebase.sh

# Run the export
./export_codebase.sh
```

### Option 4: Windows Batch
```cmd
REM Simply double-click or run from command prompt
export_codebase.bat
```

## 📊 Example Output Statistics

A typical MeetingMind export might show:

```
## Codebase Statistics
- Total Files: 1,847
- Total Lines: 87,423
- Total Size: 24.7 MB
- Directories: 156

### File Types Distribution
- .ts: 423 files (22.9%) - TypeScript source
- .js: 312 files (16.9%) - JavaScript source  
- .json: 89 files (4.8%) - Configuration
- .md: 45 files (2.4%) - Documentation
- .css: 34 files (1.8%) - Stylesheets
- .py: 28 files (1.5%) - Python backend

### Language Distribution (by lines)
- TypeScript: 48,234 lines (55.2%)
- JavaScript: 21,456 lines (24.5%)
- Python: 8,934 lines (10.2%)
- CSS: 4,567 lines (5.2%)
- Markdown: 2,345 lines (2.7%)
- JSON: 1,887 lines (2.2%)
```

## ⚙️ Advanced Usage

### Custom File Size Limit
Edit the script to change the maximum file size:

**Python:**
```python
MAX_FILE_SIZE = 1024 * 1024 * 5  # 5MB instead of 2MB
```

**Node.js:**
```javascript
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
```

### Add Custom File Types
**Python:**
```python
INCLUDE_PATTERNS.extend([
    "*.custom",
    "*.myext"
])
```

**Node.js:**
```javascript
INCLUDE_EXTENSIONS.add('.custom');
INCLUDE_EXTENSIONS.add('.myext');
```

### Exclude Additional Directories
**Python:**
```python
EXCLUDE_DIRS.add('my_custom_dir')
```

**Shell:**
```bash
# Edit the should_exclude_dir function
```

## 🔍 Troubleshooting

### Permission Errors
```bash
# Linux/macOS - make script executable
chmod +x export_codebase.sh

# Windows - run as administrator if needed
```

### Large Output Files
The export file can become quite large (20-50MB for complex projects). This is normal and expected.

### Memory Issues
If you encounter memory issues with very large codebases:
- Use the Python version (most memory efficient)
- Reduce `MAX_FILE_SIZE` in the script
- Add more directories to the exclude list

### Missing Files
If important files are missing from the export:
- Check the included file patterns
- Verify files aren't in excluded directories
- Check file size limits

## 📝 Use Cases

### 1. Code Review
Share the entire codebase with reviewers or consultants:
```bash
python export_codebase.py
# Send complete_codebase_export.txt
```

### 2. AI Analysis
Upload the export to AI tools for analysis:
- Code quality assessment
- Architecture review
- Documentation generation
- Bug detection

### 3. Backup and Archive
Create a point-in-time snapshot:
```bash
# Add timestamp to filename
python export_codebase.py
mv complete_codebase_export.txt "codebase_backup_$(date +%Y%m%d).txt"
```

### 4. Migration Planning
Analyze codebase before migration:
- Technology stack assessment
- Dependency analysis
- Complexity estimation

## 🛡️ Security Considerations

### Sensitive Data
The scripts automatically exclude common sensitive patterns:
- `.env` files with secrets
- API keys in comments
- Database credentials

**Manual Review Recommended:**
- Review the output file before sharing
- Remove any remaining sensitive information
- Consider using `.gitignore` patterns as exclusion rules

### File Permissions
The scripts respect file system permissions and will skip:
- Unreadable files
- Protected directories
- System files

## 🎛️ Performance

### Execution Times (Approximate)
- **Small projects** (<1000 files): 10-30 seconds
- **Medium projects** (1000-5000 files): 1-3 minutes  
- **Large projects** (5000+ files): 3-10 minutes

### Output File Sizes
- **Small projects**: 1-5 MB
- **Medium projects**: 5-25 MB
- **Large projects**: 25-100 MB

## 🤝 Contributing

To improve the export scripts:

1. **Add new file types** in the include patterns
2. **Improve statistics** calculation
3. **Add new output formats** (HTML, PDF, etc.)
4. **Optimize performance** for large codebases
5. **Add filtering options** via command line arguments

## 📄 License

These export scripts are part of the MeetingMind project and follow the same licensing terms.

---

**Choose the script that best fits your environment and requirements. The Python version is recommended for most comprehensive results!** 🐍✨