# Codebase Analysis Scripts

Scripts for aggregating and analyzing the complete MeetingMind codebase using AI tools.

## Scripts Overview

### 1. `aggregate_codebase.py`
Collects the entire codebase into a single context for LLM analysis.

### 2. `send_to_gemini.py`
Sends the aggregated codebase to Google Gemini for analysis.

## Setup

### Install Dependencies
```bash
# Install Google Generative AI library
pip install google-generativeai

# Set your Gemini API key
export GEMINI_API_KEY="your_api_key_here"
```

### Get Gemini API Key
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Set it as environment variable or pass with `--api-key`

## Usage Examples

### 1. Generate Codebase Context Only
```bash
# Generate markdown context
python scripts/aggregate_codebase.py --format markdown --output codebase.md

# Generate JSON context
python scripts/aggregate_codebase.py --format json --output codebase.json

# From specific directory
python scripts/aggregate_codebase.py --root /path/to/project --output context.md
```

### 2. Full Codebase Analysis with Gemini
```bash
# Analyze entire codebase
python scripts/send_to_gemini.py --output analysis.md

# From specific directory
python scripts/send_to_gemini.py --root /path/to/project --output analysis.md

# With custom API key
python scripts/send_to_gemini.py --api-key "your_key" --output analysis.md
```

### 3. Ask Specific Questions
```bash
# Ask specific question about the codebase
python scripts/send_to_gemini.py --question "How does the transcription system work?"

# More specific questions
python scripts/send_to_gemini.py --question "What are the main security vulnerabilities?"
python scripts/send_to_gemini.py --question "How can I optimize the audio processing pipeline?"
python scripts/send_to_gemini.py --question "What testing frameworks are used and how comprehensive is the coverage?"
```

### 4. Custom Analysis Prompts
```bash
# Create custom prompt file
cat > custom_prompt.txt << EOF
Please analyze this codebase and focus on:
1. API design patterns
2. Database schema and relationships
3. Real-time communication architecture
4. Scalability bottlenecks
5. Recommended improvements for production deployment
EOF

# Use custom prompt
python scripts/send_to_gemini.py --prompt-file custom_prompt.txt --output custom_analysis.md
```

## Example Workflow

### Complete Codebase Analysis
```bash
# Set API key
export GEMINI_API_KEY="your_gemini_api_key"

# Run full analysis
python scripts/send_to_gemini.py --root /mnt/d/Claude/MeetingsHacker --output full_analysis.md

# Ask follow-up questions
python scripts/send_to_gemini.py --question "Based on the analysis, what are the top 3 priorities for improving this codebase?"
```

### Quick Context Generation (for manual use)
```bash
# Generate context file to manually copy-paste to any LLM
python scripts/aggregate_codebase.py --format markdown --output codebase_context.md

# Then copy the content and paste into ChatGPT, Claude, etc.
```

## Output Examples

### Codebase Summary
The aggregator will generate a summary like:
```
# MeetingMind Codebase Analysis
Generated: 2024-01-15T10:30:00

## Overview
- Total Files: 45
- Total Lines: 12,450
- Total Characters: 487,234

## File Distribution by Category:
### Backend (23 files)
- Lines: 8,234
- Characters: 312,456
- Files: main.py, transcription_service.py, audio_processor.py...
```

### Gemini Analysis
The Gemini analysis will provide:
- Architecture overview
- Technology stack assessment
- Code quality analysis
- Security considerations
- Scalability analysis
- Improvement recommendations

## Configuration Options

### Aggregator Options
- `--root`: Root directory to scan
- `--format`: Output format (markdown, json, plain)
- `--output`: Output file
- `--max-size`: Maximum file size to include fully (bytes)

### Gemini Options
- `--api-key`: Gemini API key
- `--question`: Specific question to ask
- `--prompt-file`: Custom analysis prompt file
- `--output`: Output file for analysis

## File Filtering

The aggregator automatically:
- **Includes**: `.py`, `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.yaml`, `.md`, etc.
- **Excludes**: `node_modules`, `__pycache__`, `.git`, build files, logs
- **Truncates**: Files larger than 50KB (configurable)

## Limitations

- **API Limits**: Gemini has token/character limits (~1M chars)
- **Rate Limits**: May need to wait between requests
- **Cost**: Gemini API calls cost money
- **Context Size**: Very large codebases may need chunking

## Tips

1. **Start Small**: Test with a subset of files first
2. **Specific Questions**: More targeted questions get better answers
3. **Multiple Sessions**: Break large analysis into multiple questions
4. **Save Results**: Always save analysis results for reference
5. **Version Control**: Include analysis in your documentation

## Troubleshooting

### Common Issues
- **API Key Error**: Check `GEMINI_API_KEY` environment variable
- **Rate Limit**: Wait and retry, or upgrade API plan
- **Large Context**: Reduce `--max-size` or analyze specific directories
- **Import Error**: Install `google-generativeai` package

### Debug Mode
Add print statements or use `--verbose` flag for debugging.