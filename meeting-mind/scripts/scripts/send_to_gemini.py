#!/usr/bin/env python3
"""
Send Codebase to Google Gemini
Script to send the aggregated codebase to Google Gemini API
"""

import os
import argparse
import json
from pathlib import Path
import sys

# Add the parent directory to the path so we can import the aggregator
sys.path.append(str(Path(__file__).parent))
from aggregate_codebase import CodebaseAggregator

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("Warning: google-generativeai not installed")
    print("Install with: pip install google-generativeai")

class GeminiCodebaseAnalyzer:
    """Sends codebase to Gemini for analysis"""
    
    def __init__(self, api_key: str = None):
        if not GEMINI_AVAILABLE:
            raise RuntimeError("Google Generative AI library not available")
        
        # Configure Gemini
        api_key = api_key or os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable or api_key parameter required")
        
        genai.configure(api_key=api_key)
        
        # Use Gemini Pro model
        self.model = genai.GenerativeModel('gemini-pro')
    
    def analyze_codebase(self, root_path: str, analysis_prompt: str = None) -> str:
        """Analyze entire codebase with Gemini"""
        
        print(f"Aggregating codebase from: {root_path}")
        
        # Generate codebase context
        aggregator = CodebaseAggregator(root_path)
        codebase_context = aggregator.generate_context('markdown')
        
        print(f"Codebase context generated: {len(codebase_context):,} characters")
        
        # Default analysis prompt
        if not analysis_prompt:
            analysis_prompt = """
Please analyze this complete MeetingMind codebase and provide:

1. **Architecture Overview**: High-level system architecture and component relationships
2. **Technology Stack**: Technologies, frameworks, and libraries used
3. **Key Features**: Main functionality and capabilities
4. **Code Quality Assessment**: Overall code quality, patterns, and best practices
5. **Areas for Improvement**: Potential optimizations, refactoring opportunities
6. **Security Considerations**: Security measures and potential vulnerabilities
7. **Scalability Analysis**: How well the system scales and bottlenecks
8. **Documentation Quality**: Quality of code documentation and comments
9. **Testing Coverage**: Testing approach and coverage assessment
10. **Deployment Readiness**: Production readiness and deployment considerations

Please be thorough and provide specific examples from the code where relevant.
"""
        
        # Combine prompt with codebase
        full_prompt = f"{analysis_prompt}\n\n# Complete Codebase:\n\n{codebase_context}"
        
        print("Sending to Gemini for analysis...")
        print(f"Total prompt size: {len(full_prompt):,} characters")
        
        try:
            # Check if prompt is too large
            if len(full_prompt) > 1000000:  # 1MB limit for safety
                print("Warning: Prompt is very large, may hit API limits")
            
            response = self.model.generate_content(full_prompt)
            return response.text
            
        except Exception as e:
            print(f"Error calling Gemini API: {e}")
            return None
    
    def ask_specific_question(self, root_path: str, question: str) -> str:
        """Ask a specific question about the codebase"""
        
        print(f"Asking specific question about codebase: {question}")
        
        # Generate codebase context
        aggregator = CodebaseAggregator(root_path)
        codebase_context = aggregator.generate_context('markdown')
        
        # Create targeted prompt
        prompt = f"""
Based on this complete MeetingMind codebase, please answer the following question:

{question}

Please provide a detailed answer with specific code references and examples where applicable.

# Complete Codebase:

{codebase_context}
"""
        
        print("Sending question to Gemini...")
        
        try:
            response = self.model.generate_content(prompt)
            return response.text
            
        except Exception as e:
            print(f"Error calling Gemini API: {e}")
            return None

def main():
    parser = argparse.ArgumentParser(description='Send MeetingMind codebase to Google Gemini for analysis')
    parser.add_argument('--root', default='.', help='Root directory to analyze (default: current directory)')
    parser.add_argument('--api-key', help='Gemini API key (or set GEMINI_API_KEY env var)')
    parser.add_argument('--question', help='Specific question to ask about the codebase')
    parser.add_argument('--output', help='Output file for analysis (default: stdout)')
    parser.add_argument('--prompt-file', help='File containing custom analysis prompt')
    
    args = parser.parse_args()
    
    if not GEMINI_AVAILABLE:
        print("Error: google-generativeai library not installed")
        print("Install with: pip install google-generativeai")
        sys.exit(1)
    
    try:
        analyzer = GeminiCodebaseAnalyzer(args.api_key)
        
        if args.question:
            # Ask specific question
            result = analyzer.ask_specific_question(args.root, args.question)
        else:
            # Full analysis
            custom_prompt = None
            if args.prompt_file:
                with open(args.prompt_file, 'r') as f:
                    custom_prompt = f.read()
            
            result = analyzer.analyze_codebase(args.root, custom_prompt)
        
        if result:
            if args.output:
                with open(args.output, 'w', encoding='utf-8') as f:
                    f.write(result)
                print(f"Analysis written to: {args.output}")
            else:
                print("\n" + "="*80)
                print("GEMINI ANALYSIS RESULT:")
                print("="*80)
                print(result)
        else:
            print("Failed to get analysis from Gemini")
            sys.exit(1)
    
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()