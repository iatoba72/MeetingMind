#!/usr/bin/env node

/**
 * MeetingMind Codebase Export Script (Node.js Version)
 * Exports all code files, structure, and content to a comprehensive text file
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

// Configuration
const ROOT_DIR = __dirname;
const OUTPUT_FILE = path.join(ROOT_DIR, 'complete_codebase_export.txt');

// File patterns to include
const INCLUDE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml',
    '.py', '.md', '.txt', '.html', '.css', '.scss', '.sass', '.less',
    '.sql', '.sh', '.bat', '.ps1', '.dockerfile',
    '.gitignore', '.gitattributes', '.editorconfig',
    '.lock', '.toml', '.ini', '.cfg', '.properties',
    '.xml', '.svg', '.php', '.rb', '.go', '.rs', '.cpp', '.c', '.h',
    '.java', '.kt', '.swift', '.dart', '.r', '.config', '.conf'
]);

const INCLUDE_FILENAMES = new Set([
    'package.json', 'requirements.txt', 'Pipfile', 'poetry.lock',
    'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
    'dockerfile', 'docker-compose.yml', 'docker-compose.yaml'
]);

// Files to exclude (specific filenames)
const EXCLUDE_FILES = new Set([
    'export_codebase.py', 'export_codebase.js', 'export_codebase.sh',
    'export_codebase.bat', 'EXPORT_README.md', 'complete_codebase_export.txt',
    'complete_codebase.txt'
]);

// Directories to exclude
const EXCLUDE_DIRS = new Set([
    'node_modules', '__pycache__', '.git', '.vscode', '.idea',
    'dist', 'build', 'coverage', '.nyc_output', 'target',
    '.pytest_cache', '.mypy_cache', '.tox', 'venv', 'env',
    '.env', 'virtualenv', '.virtualenv', 'site-packages',
    'vendor', 'bower_components', '.next', '.nuxt', '.cache',
    'tmp', 'temp', '.tmp', '.temp', 'logs', 'log',
    '.DS_Store', 'Thumbs.db', '.sass-cache', '.parcel-cache'
]);

// File extensions to exclude
const EXCLUDE_EXTENSIONS = new Set([
    '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.tiff',
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.wmv', '.flv',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.db', '.sqlite', '.sqlite3', '.mdb', '.accdb'
]);

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Check if a file should be included
 */
function shouldIncludeFile(filePath, stats) {
    const basename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    // Check if filename should be excluded
    if (EXCLUDE_FILES.has(basename)) {
        return false;
    }
    
    // Check file size
    if (stats.size > MAX_FILE_SIZE) {
        return false;
    }
    
    // Check if extension should be excluded
    if (EXCLUDE_EXTENSIONS.has(ext)) {
        return false;
    }
    
    // Check if extension should be included
    if (INCLUDE_EXTENSIONS.has(ext)) {
        return true;
    }
    
    // Check if filename should be included
    if (INCLUDE_FILENAMES.has(basename.toLowerCase())) {
        return true;
    }
    
    // Check specific patterns
    if (basename.startsWith('tsconfig') && basename.endsWith('.json')) {
        return true;
    }
    
    if (basename.includes('config') && (ext === '.js' || ext === '.ts' || ext === '.json')) {
        return true;
    }
    
    if (basename.startsWith('.eslintrc') || basename.startsWith('.prettierrc')) {
        return true;
    }
    
    return false;
}

/**
 * Check if a directory should be excluded
 */
function shouldExcludeDir(dirPath) {
    const basename = path.basename(dirPath);
    return EXCLUDE_DIRS.has(basename.toLowerCase());
}

/**
 * Format file size in human readable format
 */
function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unit = 0;
    
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit++;
    }
    
    return `${size.toFixed(1)} ${units[unit]}`;
}

/**
 * Get directory tree structure
 */
async function getDirectoryTree(dirPath, prefix = '', isLast = true) {
    const items = [];
    
    try {
        const entries = await readdir(dirPath);
        const sortedEntries = entries.sort((a, b) => {
            const aPath = path.join(dirPath, a);
            const bPath = path.join(dirPath, b);
            const aIsDir = fs.existsSync(aPath) && fs.statSync(aPath).isDirectory();
            const bIsDir = fs.existsSync(bPath) && fs.statSync(bPath).isDirectory();
            
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.localeCompare(b);
        });
        
        for (let i = 0; i < sortedEntries.length; i++) {
            const entry = sortedEntries[i];
            const entryPath = path.join(dirPath, entry);
            
            if (shouldExcludeDir(entryPath)) {
                continue;
            }
            
            const entryIsLast = i === sortedEntries.length - 1;
            const symbol = entryIsLast ? '└── ' : '├── ';
            items.push(`${prefix}${symbol}${entry}`);
            
            try {
                const stats = await stat(entryPath);
                if (stats.isDirectory()) {
                    const extension = entryIsLast ? '    ' : '│   ';
                    const subtree = await getDirectoryTree(entryPath, prefix + extension, entryIsLast);
                    if (subtree.length > 0) {
                        items.push(...subtree);
                    }
                }
            } catch (error) {
                // Skip inaccessible directories
            }
        }
    } catch (error) {
        // Skip inaccessible directories
    }
    
    return items;
}

/**
 * Calculate codebase statistics
 */
async function calculateStats(rootPath) {
    const stats = {
        totalFiles: 0,
        totalLines: 0,
        totalSize: 0,
        fileTypes: {},
        languages: {},
        directories: 0
    };
    
    async function processDirectory(dirPath) {
        try {
            stats.directories++;
            const entries = await readdir(dirPath);
            
            for (const entry of entries) {
                const entryPath = path.join(dirPath, entry);
                
                try {
                    const entryStats = await stat(entryPath);
                    
                    if (entryStats.isDirectory()) {
                        if (!shouldExcludeDir(entryPath)) {
                            await processDirectory(entryPath);
                        }
                    } else if (entryStats.isFile() && shouldIncludeFile(entryPath, entryStats)) {
                        stats.totalFiles++;
                        stats.totalSize += entryStats.size;
                        
                        const ext = path.extname(entryPath).toLowerCase();
                        if (ext) {
                            stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;
                        } else {
                            stats.fileTypes['no_extension'] = (stats.fileTypes['no_extension'] || 0) + 1;
                        }
                        
                        // Count lines and detect language
                        try {
                            const content = await readFile(entryPath, 'utf8');
                            const lines = content.split('\n').length;
                            stats.totalLines += lines;
                            
                            // Language detection
                            switch (ext) {
                                case '.ts':
                                case '.tsx':
                                    stats.languages['TypeScript'] = (stats.languages['TypeScript'] || 0) + lines;
                                    break;
                                case '.js':
                                case '.jsx':
                                    stats.languages['JavaScript'] = (stats.languages['JavaScript'] || 0) + lines;
                                    break;
                                case '.py':
                                    stats.languages['Python'] = (stats.languages['Python'] || 0) + lines;
                                    break;
                                case '.css':
                                case '.scss':
                                case '.sass':
                                case '.less':
                                    stats.languages['CSS'] = (stats.languages['CSS'] || 0) + lines;
                                    break;
                                case '.html':
                                case '.htm':
                                    stats.languages['HTML'] = (stats.languages['HTML'] || 0) + lines;
                                    break;
                                case '.md':
                                    stats.languages['Markdown'] = (stats.languages['Markdown'] || 0) + lines;
                                    break;
                                case '.json':
                                    stats.languages['JSON'] = (stats.languages['JSON'] || 0) + lines;
                                    break;
                                case '.yaml':
                                case '.yml':
                                    stats.languages['YAML'] = (stats.languages['YAML'] || 0) + lines;
                                    break;
                                default:
                                    stats.languages['Other'] = (stats.languages['Other'] || 0) + lines;
                            }
                        } catch (error) {
                            // Skip files that can't be read as text
                        }
                    }
                } catch (error) {
                    // Skip inaccessible files
                }
            }
        } catch (error) {
            // Skip inaccessible directories
        }
    }
    
    await processDirectory(rootPath);
    return stats;
}

/**
 * Export file content with line numbers
 */
function formatFileContent(content, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.css', '.html', '.json', '.yaml', '.yml'];
    
    if (codeExtensions.includes(ext)) {
        const lines = content.split('\n');
        return lines.map((line, index) => `${(index + 1).toString().padStart(4, ' ')}│ ${line}`).join('\n');
    }
    
    return content;
}

/**
 * Process all files and export content
 */
async function exportFiles(rootPath, outputStream) {
    let exportedCount = 0;
    let skippedCount = 0;
    
    async function processDirectory(dirPath) {
        try {
            const entries = await readdir(dirPath);
            const sortedEntries = entries.sort();
            
            for (const entry of sortedEntries) {
                const entryPath = path.join(dirPath, entry);
                
                try {
                    const entryStats = await stat(entryPath);
                    
                    if (entryStats.isDirectory()) {
                        if (!shouldExcludeDir(entryPath)) {
                            await processDirectory(entryPath);
                        }
                    } else if (entryStats.isFile()) {
                        if (shouldIncludeFile(entryPath, entryStats)) {
                            const relativePath = path.relative(rootPath, entryPath);
                            console.log(`📝 Exporting: ${relativePath}`);
                            
                            // File header
                            outputStream.write('\n' + '='.repeat(80) + '\n');
                            outputStream.write(`FILE: ${relativePath}\n`);
                            outputStream.write(`SIZE: ${formatSize(entryStats.size)}\n`);
                            outputStream.write(`MODIFIED: ${entryStats.mtime.toISOString()}\n`);
                            outputStream.write('='.repeat(80) + '\n\n');
                            
                            // File content
                            try {
                                const content = await readFile(entryPath, 'utf8');
                                const formattedContent = formatFileContent(content, entryPath);
                                outputStream.write(formattedContent);
                                outputStream.write('\n\n');
                                exportedCount++;
                            } catch (error) {
                                outputStream.write(`ERROR reading file: ${error.message}\n\n`);
                                skippedCount++;
                            }
                        } else {
                            skippedCount++;
                        }
                    }
                } catch (error) {
                    skippedCount++;
                }
            }
        } catch (error) {
            // Skip inaccessible directories
        }
    }
    
    await processDirectory(rootPath);
    return { exportedCount, skippedCount };
}

/**
 * Main export function
 */
async function main() {
    console.log('🚀 Starting MeetingMind codebase export...');
    console.log(`📁 Root directory: ${ROOT_DIR}`);
    console.log(`📄 Output file: ${OUTPUT_FILE}`);
    
    try {
        // Calculate statistics
        console.log('📊 Calculating codebase statistics...');
        const stats = await calculateStats(ROOT_DIR);
        
        // Create output stream
        const outputStream = fs.createWriteStream(OUTPUT_FILE, 'utf8');
        
        // Write header
        outputStream.write('# MeetingMind Complete Codebase Export\n');
        outputStream.write(`Generated: ${new Date().toISOString()}\n`);
        outputStream.write(`Root Path: ${ROOT_DIR}\n\n`);
        
        // Write statistics
        outputStream.write('## Codebase Statistics\n');
        outputStream.write(`- Total Files: ${stats.totalFiles.toLocaleString()}\n`);
        outputStream.write(`- Total Lines: ${stats.totalLines.toLocaleString()}\n`);
        outputStream.write(`- Total Size: ${formatSize(stats.totalSize)}\n`);
        outputStream.write(`- Directories: ${stats.directories.toLocaleString()}\n\n`);
        
        // File types distribution
        outputStream.write('### File Types Distribution\n');
        const sortedFileTypes = Object.entries(stats.fileTypes).sort((a, b) => b[1] - a[1]);
        for (const [ext, count] of sortedFileTypes) {
            const percentage = ((count / stats.totalFiles) * 100).toFixed(1);
            outputStream.write(`- ${ext}: ${count.toLocaleString()} files (${percentage}%)\n`);
        }
        outputStream.write('\n');
        
        // Language distribution
        if (Object.keys(stats.languages).length > 0) {
            outputStream.write('### Language Distribution (by lines)\n');
            const sortedLanguages = Object.entries(stats.languages).sort((a, b) => b[1] - a[1]);
            for (const [lang, lines] of sortedLanguages) {
                const percentage = ((lines / stats.totalLines) * 100).toFixed(1);
                outputStream.write(`- ${lang}: ${lines.toLocaleString()} lines (${percentage}%)\n`);
            }
            outputStream.write('\n');
        }
        
        // Directory structure
        console.log('🌳 Generating directory tree...');
        outputStream.write('## Directory Structure\n```\n');
        outputStream.write(`${path.basename(ROOT_DIR)}/\n`);
        const tree = await getDirectoryTree(ROOT_DIR);
        for (const line of tree) {
            outputStream.write(line + '\n');
        }
        outputStream.write('```\n\n');
        
        // Export configuration
        outputStream.write('## Export Configuration\n');
        outputStream.write('### Included Extensions:\n');
        for (const ext of Array.from(INCLUDE_EXTENSIONS).sort()) {
            outputStream.write(`- ${ext}\n`);
        }
        outputStream.write('\n### Excluded Directories:\n');
        for (const dir of Array.from(EXCLUDE_DIRS).sort()) {
            outputStream.write(`- ${dir}\n`);
        }
        outputStream.write(`\n### Maximum File Size: ${formatSize(MAX_FILE_SIZE)}\n\n`);
        
        // File contents
        outputStream.write('## Complete File Contents\n');
        
        console.log('📄 Exporting file contents...');
        const { exportedCount, skippedCount } = await exportFiles(ROOT_DIR, outputStream);
        
        // Footer
        outputStream.write('\n' + '='.repeat(80) + '\n');
        outputStream.write('# Export Summary\n');
        outputStream.write(`- Files exported: ${exportedCount.toLocaleString()}\n`);
        outputStream.write(`- Files skipped: ${skippedCount.toLocaleString()}\n`);
        outputStream.write(`- Export completed: ${new Date().toISOString()}\n`);
        outputStream.write('='.repeat(80) + '\n');
        
        outputStream.end();
        
        // Final summary
        const outputStats = await stat(OUTPUT_FILE);
        console.log('\n✅ Export completed successfully!');
        console.log('📊 Statistics:');
        console.log(`   - Files exported: ${exportedCount.toLocaleString()}`);
        console.log(`   - Files skipped: ${skippedCount.toLocaleString()}`);
        console.log(`   - Total lines: ${stats.totalLines.toLocaleString()}`);
        console.log(`   - Total size: ${formatSize(stats.totalSize)}`);
        console.log(`📄 Output file: ${OUTPUT_FILE}`);
        console.log(`📏 Output size: ${formatSize(outputStats.size)}`);
        console.log('🎉 Codebase export complete!');
        
    } catch (error) {
        console.error('❌ Export failed:', error);
        process.exit(1);
    }
}

// Run the export
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };