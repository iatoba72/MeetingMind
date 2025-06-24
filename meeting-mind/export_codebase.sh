#!/bin/bash

# MeetingMind Codebase Export Script (Shell Version)
# Exports all code files, structure, and content to a comprehensive text file

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"
OUTPUT_FILE="$ROOT_DIR/complete_codebase_export.txt"
TEMP_DIR="/tmp/meetingmind_export_$$"

# Create temporary directory
mkdir -p "$TEMP_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting MeetingMind codebase export...${NC}"
echo -e "${BLUE}📁 Root directory: $ROOT_DIR${NC}"
echo -e "${BLUE}📄 Output file: $OUTPUT_FILE${NC}"

# Function to check if file should be included
should_include_file() {
    local file="$1"
    local filename=$(basename "$file")
    local extension="${filename##*.}"
    
    # Check if it's a directory
    if [[ -d "$file" ]]; then
        return 1
    fi
    
    # Check file size (skip files larger than 2MB)
    if [[ -f "$file" ]]; then
        local size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0)
        if [[ $size -gt 2097152 ]]; then
            return 1
        fi
    fi
    
    # Include specific extensions and patterns
    case "$extension" in
        ts|tsx|js|jsx|json|yaml|yml|py|md|txt|html|css|scss|sass|less|sql|sh|bat|dockerfile|gitignore|conf|config|ini|cfg|toml|xml|svg|php|rb|go|rs|cpp|c|h|hpp|java|kt|swift|dart)
            return 0
            ;;
    esac
    
    # Include specific filenames
    case "$filename" in
        package.json|requirements.txt|Pipfile|poetry.lock|Cargo.toml|go.mod|pom.xml|build.gradle|tsconfig*.json|vite.config.*|webpack.config.*|tailwind.config.*|postcss.config.*|babel.config.*|eslint.config.*|.eslintrc*|.prettierrc*|jest.config.*|Dockerfile*|docker-compose*.yml|docker-compose*.yaml)
            return 0
            ;;
    esac
    
    # Check if file appears to be text
    if file "$file" 2>/dev/null | grep -q "text"; then
        return 0
    fi
    
    return 1
}

# Function to check if directory should be excluded
should_exclude_dir() {
    local dir="$1"
    local dirname=$(basename "$dir")
    
    case "$dirname" in
        node_modules|__pycache__|.git|.vscode|.idea|dist|build|coverage|.nyc_output|target|.pytest_cache|.mypy_cache|.tox|venv|env|.env|virtualenv|.virtualenv|vendor|bower_components|.next|.nuxt|.cache|tmp|temp|.tmp|.temp|logs|log|.DS_Store|Thumbs.db|.sass-cache|.parcel-cache)
            return 0
            ;;
    esac
    return 1
}

# Function to generate directory tree
generate_tree() {
    local dir="$1"
    local prefix="$2"
    local is_last="$3"
    
    if should_exclude_dir "$dir"; then
        return
    fi
    
    local items=()
    while IFS= read -r -d '' item; do
        items+=("$item")
    done < <(find "$dir" -maxdepth 1 -mindepth 1 \( -type f -o -type d \) -print0 | sort -z)
    
    local count=${#items[@]}
    local i=0
    
    for item in "${items[@]}"; do
        local basename_item=$(basename "$item")
        
        if [[ -d "$item" ]] && should_exclude_dir "$item"; then
            continue
        fi
        
        i=$((i + 1))
        local current_is_last=$([[ $i -eq $count ]] && echo true || echo false)
        local symbol=$([[ "$current_is_last" == "true" ]] && echo "└── " || echo "├── ")
        
        echo "${prefix}${symbol}${basename_item}"
        
        if [[ -d "$item" ]]; then
            local new_prefix="${prefix}$([[ "$current_is_last" == "true" ]] && echo "    " || echo "│   ")"
            generate_tree "$item" "$new_prefix" "$current_is_last"
        fi
    done
}

# Function to format file size
format_size() {
    local size=$1
    local units=("B" "KB" "MB" "GB" "TB")
    local unit=0
    
    while [[ $size -gt 1024 && $unit -lt 4 ]]; do
        size=$((size / 1024))
        unit=$((unit + 1))
    done
    
    echo "${size} ${units[$unit]}"
}

# Function to count lines in a file
count_lines() {
    local file="$1"
    if [[ -f "$file" ]]; then
        wc -l < "$file" 2>/dev/null || echo 0
    else
        echo 0
    fi
}

# Calculate statistics
echo -e "${YELLOW}📊 Calculating codebase statistics...${NC}"

total_files=0
total_lines=0
total_size=0
declare -A file_types
declare -A languages

while IFS= read -r -d '' file; do
    if should_include_file "$file"; then
        total_files=$((total_files + 1))
        
        # File size
        if [[ -f "$file" ]]; then
            size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0)
            total_size=$((total_size + size))
            
            # Lines
            lines=$(count_lines "$file")
            total_lines=$((total_lines + lines))
            
            # File extension
            filename=$(basename "$file")
            extension="${filename##*.}"
            if [[ "$extension" != "$filename" ]]; then
                file_types[".$extension"]=$((${file_types[".$extension"]:-0} + 1))
                
                # Language detection
                case "$extension" in
                    ts|tsx) languages["TypeScript"]=$((${languages["TypeScript"]:-0} + lines)) ;;
                    js|jsx) languages["JavaScript"]=$((${languages["JavaScript"]:-0} + lines)) ;;
                    py) languages["Python"]=$((${languages["Python"]:-0} + lines)) ;;
                    css|scss|sass|less) languages["CSS"]=$((${languages["CSS"]:-0} + lines)) ;;
                    html|htm) languages["HTML"]=$((${languages["HTML"]:-0} + lines)) ;;
                    md) languages["Markdown"]=$((${languages["Markdown"]:-0} + lines)) ;;
                    json) languages["JSON"]=$((${languages["JSON"]:-0} + lines)) ;;
                    yaml|yml) languages["YAML"]=$((${languages["YAML"]:-0} + lines)) ;;
                    *) languages["Other"]=$((${languages["Other"]:-0} + lines)) ;;
                esac
            else
                file_types["no_extension"]=$((${file_types["no_extension"]:-0} + 1))
            fi
        fi
    fi
done < <(find "$ROOT_DIR" -type f -print0)

# Start writing the export file
echo -e "${GREEN}📝 Writing export file...${NC}"

cat > "$OUTPUT_FILE" << EOF
# MeetingMind Complete Codebase Export
Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Root Path: $ROOT_DIR

## Codebase Statistics
- Total Files: $(printf "%'d" $total_files)
- Total Lines: $(printf "%'d" $total_lines)
- Total Size: $(format_size $total_size)

### File Types Distribution
EOF

# File types
for ext in $(printf '%s\n' "${!file_types[@]}" | sort); do
    count=${file_types[$ext]}
    percentage=$(awk "BEGIN {printf \"%.1f\", ($count / $total_files) * 100}")
    echo "- $ext: $(printf "%'d" $count) files ($percentage%)" >> "$OUTPUT_FILE"
done

echo "" >> "$OUTPUT_FILE"

# Languages
if [[ ${#languages[@]} -gt 0 ]]; then
    echo "### Language Distribution (by lines)" >> "$OUTPUT_FILE"
    for lang in $(printf '%s\n' "${!languages[@]}" | sort); do
        lines=${languages[$lang]}
        percentage=$(awk "BEGIN {printf \"%.1f\", ($lines / $total_lines) * 100}")
        echo "- $lang: $(printf "%'d" $lines) lines ($percentage%)" >> "$OUTPUT_FILE"
    done
    echo "" >> "$OUTPUT_FILE"
fi

# Directory structure
echo "## Directory Structure" >> "$OUTPUT_FILE"
echo '```' >> "$OUTPUT_FILE"
echo "$(basename "$ROOT_DIR")/" >> "$OUTPUT_FILE"
generate_tree "$ROOT_DIR" "" true >> "$OUTPUT_FILE"
echo '```' >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Export configuration
cat >> "$OUTPUT_FILE" << 'EOF'
## Export Configuration
### Included File Extensions:
- .ts, .tsx, .js, .jsx (JavaScript/TypeScript)
- .json, .yaml, .yml (Configuration)
- .py (Python)
- .md, .txt (Documentation)
- .html, .css, .scss, .sass, .less (Web)
- .sql, .sh, .bat (Scripts)
- Configuration files (package.json, tsconfig.json, etc.)

### Excluded Directories:
- node_modules, __pycache__, .git, .vscode, .idea
- dist, build, coverage, target
- venv, env, virtualenv
- tmp, temp, logs, .cache

### Maximum File Size: 2MB

## Complete File Contents

EOF

# Export file contents
exported_count=0
skipped_count=0

echo -e "${YELLOW}📄 Exporting file contents...${NC}"

while IFS= read -r -d '' file; do
    if should_include_file "$file"; then
        relative_path="${file#$ROOT_DIR/}"
        
        echo -e "${NC}📝 Exporting: $relative_path"
        
        # File header
        cat >> "$OUTPUT_FILE" << EOF

================================================================================
FILE: $relative_path
SIZE: $(format_size $(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0))
MODIFIED: $(date -r "$file" 2>/dev/null || echo "Unknown")
================================================================================

EOF
        
        # File content with line numbers for code files
        if [[ "$relative_path" =~ \.(ts|tsx|js|jsx|py|css|html|json|yaml|yml)$ ]]; then
            cat -n "$file" >> "$OUTPUT_FILE" 2>/dev/null || echo "Error reading file" >> "$OUTPUT_FILE"
        else
            cat "$file" >> "$OUTPUT_FILE" 2>/dev/null || echo "Error reading file" >> "$OUTPUT_FILE"
        fi
        
        echo "" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        
        exported_count=$((exported_count + 1))
    else
        skipped_count=$((skipped_count + 1))
    fi
done < <(find "$ROOT_DIR" -type f -print0 | sort -z)

# Footer
cat >> "$OUTPUT_FILE" << EOF
================================================================================
# Export Summary
- Files exported: $(printf "%'d" $exported_count)
- Files skipped: $(printf "%'d" $skipped_count)
- Export completed: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
================================================================================
EOF

# Final summary
output_size=$(stat -c%s "$OUTPUT_FILE" 2>/dev/null || stat -f%z "$OUTPUT_FILE" 2>/dev/null || echo 0)

echo ""
echo -e "${GREEN}✅ Export completed successfully!${NC}"
echo -e "${BLUE}📊 Statistics:${NC}"
echo -e "   - Files exported: $(printf "%'d" $exported_count)"
echo -e "   - Files skipped: $(printf "%'d" $skipped_count)"
echo -e "   - Total lines: $(printf "%'d" $total_lines)"
echo -e "   - Total size: $(format_size $total_size)"
echo -e "${BLUE}📄 Output file: $OUTPUT_FILE${NC}"
echo -e "${BLUE}📏 Output size: $(format_size $output_size)${NC}"

# Clean up
rm -rf "$TEMP_DIR"

echo -e "${GREEN}🎉 Codebase export complete!${NC}"