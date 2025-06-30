# Codebase Export Setup

This project includes automated codebase export functionality for analysis and documentation purposes.

## Export Scripts

The following export scripts are available:

- `export_codebase.py` - Main Python export script (recommended)
- `export_codebase.sh` - Shell script version
- `export_codebase.js` - Node.js version  
- `export_codebase.bat` - Windows batch version
- `run_export.sh` - Convenience script (auto-ignored by git)

## Quick Usage

```bash
# Run the export script directly
python3 export_codebase.py

# Or use the convenience script (if available)
./run_export.sh
```

## Generated Files

The export process generates:
- `gemini_codebase_context_full.txt` - Complete codebase export (7.5+ MB)

## Git Ignore Setup

Export files and reports are automatically ignored by git and will not be committed:

```gitignore
# Export reports and generated files
gemini_codebase_context_full.txt
*_codebase_export.txt
*_export_report.txt
*_analysis_report.txt
codebase_export_*.txt
codebase_export_*.json
export_reports/
exports/
*_context_full.txt
*_full_export.txt
run_export.sh
```

## Export Statistics

Latest export includes:
- **Files exported**: 328
- **Total lines**: ~175,000
- **Total size**: 5.9 MB (source)
- **Output size**: 7.5 MB (formatted)

## Purpose

These exports are used for:
- AI model context and analysis
- Code review and documentation
- Project structure analysis
- Automated code analysis workflows

## Security Note

Export files may contain sensitive information and should not be committed to version control or shared publicly. They are automatically ignored by git configuration.