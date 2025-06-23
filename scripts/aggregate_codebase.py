#!/usr/bin/env python3
"""
Codebase Aggregator Script
Collects the entire MeetingMind codebase into a single context for LLM analysis
"""

import os
import fnmatch
from pathlib import Path
from typing import List, Dict, Set
import argparse
import json
from datetime import datetime

class CodebaseAggregator:
    """Aggregates codebase files into a single context"""
    
    def __init__(self, root_path: str):
        self.root_path = Path(root_path)
        self.total_files = 0
        self.total_lines = 0
        self.total_chars = 0
        
        # File patterns to include
        self.include_patterns = [
            "*.py", "*.ts", "*.tsx", "*.js", "*.jsx",
            "*.json", "*.yaml", "*.yml", "*.toml",
            "*.md", "*.txt", "*.env.example",
            "*.sql", "*.sh", "*.dockerfile",
            "requirements.txt", "package.json", "tsconfig.json"
        ]
        
        # Directories and files to exclude
        self.exclude_patterns = [
            "__pycache__", "node_modules", ".git", ".vscode",
            "*.pyc", "*.pyo", "*.pyd", ".DS_Store",
            "dist", "build", ".next", "coverage",
            "*.log", "*.tmp", "*.cache"
        ]
        
        # Large files to summarize instead of include fully
        self.max_file_size = float('inf')  # No limit - include all files fully
    
    def should_include_file(self, file_path: Path) -> bool:
        """Check if file should be included"""
        
        # Check if file matches include patterns
        filename = file_path.name
        if not any(fnmatch.fnmatch(filename, pattern) for pattern in self.include_patterns):
            return False
        
        # Check if file or its path matches exclude patterns
        path_str = str(file_path)
        for pattern in self.exclude_patterns:
            if fnmatch.fnmatch(filename, pattern) or pattern in path_str:
                return False
        
        return True
    
    def get_file_category(self, file_path: Path) -> str:
        """Categorize file by type"""
        suffix = file_path.suffix.lower()
        
        categories = {
            'backend': ['.py'],
            'frontend': ['.ts', '.tsx', '.js', '.jsx'],
            'config': ['.json', '.yaml', '.yml', '.toml', '.env'],
            'documentation': ['.md', '.txt'],
            'database': ['.sql'],
            'scripts': ['.sh'],
            'docker': ['dockerfile']
        }
        
        for category, extensions in categories.items():
            if suffix in extensions or any(ext in file_path.name.lower() for ext in extensions):
                return category
        
        return 'other'
    
    def read_file_content(self, file_path: Path) -> Dict[str, any]:
        """Read and process file content"""
        try:
            # Check file size
            file_size = file_path.stat().st_size
            
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                lines = content.count('\n') + 1
                return {
                    'content': content,
                    'lines': lines,
                    'chars': len(content),
                    'truncated': False
                }
        
        except Exception as e:
            return {
                'content': f"[ERROR READING FILE: {e}]",
                'lines': 0,
                'chars': 0,
                'truncated': False
            }
    
    def collect_files(self) -> Dict[str, List[Dict]]:
        """Collect all files organized by category"""
        
        files_by_category = {
            'backend': [],
            'frontend': [],
            'config': [],
            'documentation': [],
            'database': [],
            'scripts': [],
            'docker': [],
            'other': []
        }
        
        print(f"Scanning codebase from: {self.root_path}")
        
        for file_path in self.root_path.rglob('*'):
            if file_path.is_file() and self.should_include_file(file_path):
                
                category = self.get_file_category(file_path)
                relative_path = file_path.relative_to(self.root_path)
                
                print(f"Processing: {relative_path}")
                
                file_data = self.read_file_content(file_path)
                
                files_by_category[category].append({
                    'path': str(relative_path),
                    'category': category,
                    'size_bytes': file_path.stat().st_size,
                    'lines': file_data['lines'],
                    'chars': file_data['chars'],
                    'content': file_data['content'],
                    'truncated': file_data['truncated']
                })
                
                self.total_files += 1
                self.total_lines += file_data['lines']
                self.total_chars += file_data['chars']
        
        return files_by_category
    
    def generate_summary(self, files_by_category: Dict[str, List[Dict]]) -> str:
        """Generate codebase summary"""
        
        summary = f"""
# MeetingMind Codebase Analysis
Generated: {datetime.now().isoformat()}
Root Path: {self.root_path}

## Overview
- Total Files: {self.total_files}
- Total Lines: {self.total_lines:,}
- Total Characters: {self.total_chars:,}

## File Distribution by Category:
"""
        
        for category, files in files_by_category.items():
            if files:
                file_count = len(files)
                total_lines = sum(f['lines'] for f in files)
                total_chars = sum(f['chars'] for f in files)
                
                summary += f"""
### {category.title()} ({file_count} files)
- Lines: {total_lines:,}
- Characters: {total_chars:,}
- Files: {', '.join(f['path'] for f in files[:10])}{'...' if len(files) > 10 else ''}
"""
        
        return summary
    
    def generate_context(self, format_type: str = 'markdown') -> str:
        """Generate complete codebase context"""
        
        files_by_category = self.collect_files()
        
        if format_type == 'markdown':
            return self.generate_markdown_context(files_by_category)
        elif format_type == 'json':
            return self.generate_json_context(files_by_category)
        else:
            return self.generate_plain_context(files_by_category)
    
    def generate_markdown_context(self, files_by_category: Dict[str, List[Dict]]) -> str:
        """Generate markdown formatted context"""
        
        context = self.generate_summary(files_by_category)
        context += "\n\n# Complete Codebase\n\n"
        
        for category, files in files_by_category.items():
            if not files:
                continue
                
            context += f"\n## {category.title()} Files\n\n"
            
            for file_info in files:
                context += f"\n### File: `{file_info['path']}`\n"
                context += f"- Size: {file_info['size_bytes']} bytes\n"
                context += f"- Lines: {file_info['lines']}\n"
                
                
                # Determine language for syntax highlighting
                ext = Path(file_info['path']).suffix
                language_map = {
                    '.py': 'python',
                    '.ts': 'typescript',
                    '.tsx': 'typescript',
                    '.js': 'javascript',
                    '.jsx': 'javascript',
                    '.json': 'json',
                    '.yaml': 'yaml',
                    '.yml': 'yaml',
                    '.md': 'markdown',
                    '.sql': 'sql',
                    '.sh': 'bash'
                }
                
                language = language_map.get(ext, 'text')
                
                context += f"\n```{language}\n{file_info['content']}\n```\n\n"
        
        return context
    
    def generate_json_context(self, files_by_category: Dict[str, List[Dict]]) -> str:
        """Generate JSON formatted context"""
        
        return json.dumps({
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'root_path': str(self.root_path),
                'total_files': self.total_files,
                'total_lines': self.total_lines,
                'total_chars': self.total_chars
            },
            'files_by_category': files_by_category
        }, indent=2)
    
    def generate_plain_context(self, files_by_category: Dict[str, List[Dict]]) -> str:
        """Generate plain text context"""
        
        context = self.generate_summary(files_by_category)
        context += "\n\n=== COMPLETE CODEBASE ===\n\n"
        
        for category, files in files_by_category.items():
            if not files:
                continue
                
            context += f"\n--- {category.upper()} FILES ---\n\n"
            
            for file_info in files:
                context += f"\n=== FILE: {file_info['path']} ===\n"
                context += f"Size: {file_info['size_bytes']} bytes, Lines: {file_info['lines']}\n"
                
                if file_info['truncated']:
                    context += "[TRUNCATED - Large file]\n"
                
                context += f"\n{file_info['content']}\n\n"
        
        return context

def main():
    parser = argparse.ArgumentParser(description='Aggregate MeetingMind codebase for LLM analysis')
    parser.add_argument('--root', default='.', help='Root directory to scan (default: current directory)')
    parser.add_argument('--format', choices=['markdown', 'json', 'plain'], default='markdown', 
                       help='Output format (default: markdown)')
    parser.add_argument('--output', help='Output file (default: stdout)')
    parser.add_argument('--max-size', type=int, default=50000, 
                       help='Max file size to include fully (default: 50000 bytes)')
    
    args = parser.parse_args()
    
    aggregator = CodebaseAggregator(args.root)
    aggregator.max_file_size = args.max_size
    
    print("Generating codebase context...")
    context = aggregator.generate_context(args.format)
    
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(context)
        print(f"Context written to: {args.output}")
        print(f"Total size: {len(context):,} characters")
    else:
        print(context)

if __name__ == "__main__":
    main()