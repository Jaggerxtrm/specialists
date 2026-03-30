#!/usr/bin/env python3
"""
Python Quality Gate - PostToolUse hook for Claude Code.
Runs ruff (linting/formatting) and mypy (type checking) on edited Python files.

Exit codes:
  0 - All checks passed
  1 - Fatal error
  2 - Blocking errors found (Claude must fix)
"""

import json
import os
import sys
import subprocess
import shutil
from pathlib import Path

# Colors for output
class Colors:
    RED = '\x1b[0;31m'
    GREEN = '\x1b[0;32m'
    YELLOW = '\x1b[0;33m'
    BLUE = '\x1b[0;34m'
    CYAN = '\x1b[0;36m'
    RESET = '\x1b[0m'

def log_info(msg: str):
    print(f"{Colors.BLUE}[INFO]{Colors.RESET} {msg}", file=sys.stderr)

def log_error(msg: str):
    print(f"{Colors.RED}[ERROR]{Colors.RESET} {msg}", file=sys.stderr)

def log_success(msg: str):
    print(f"{Colors.GREEN}[OK]{Colors.RESET} {msg}", file=sys.stderr)

def log_warning(msg: str):
    print(f"{Colors.YELLOW}[WARN]{Colors.RESET} {msg}", file=sys.stderr)

def log_debug(msg: str):
    if os.environ.get('CLAUDE_HOOKS_DEBUG', 'false').lower() == 'true':
        print(f"{Colors.CYAN}[DEBUG]{Colors.RESET} {msg}", file=sys.stderr)

def find_project_root(file_path: str) -> str:
    """Find project root by looking for pyproject.toml, setup.py, or .git"""
    path = Path(file_path).parent
    while path != path.parent:
        if (path / 'pyproject.toml').exists() or \
           (path / 'setup.py').exists() or \
           (path / '.git').exists():
            return str(path)
        path = path.parent
    return str(path)

def is_python_file(file_path: str) -> bool:
    """Check if file is a Python source file"""
    return file_path.endswith('.py') and not file_path.endswith('__init__.py')

def check_ruff(file_path: str, project_root: str, autofix: bool = False) -> tuple[bool, list[str], list[str]]:
    """
    Run ruff linting and formatting checks.
    Returns: (passed, errors, autofixes)
    """
    errors = []
    autofixes = []
    
    # Check if ruff is available
    ruff_path = shutil.which('ruff')
    if not ruff_path:
        log_debug('Ruff not found in PATH - skipping ruff checks')
        return True, errors, autofixes
    
    log_info('Running Ruff linting...')
    
    # Run ruff check
    cmd = ['ruff', 'check', '--output-format=full', file_path]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=project_root)
        
        if result.returncode != 0:
            if autofix:
                log_warning('Ruff issues found, attempting auto-fix...')
                fix_cmd = ['ruff', 'check', '--fix', file_path]
                fix_result = subprocess.run(fix_cmd, capture_output=True, text=True, cwd=project_root)
                
                if fix_result.returncode == 0:
                    log_success('Ruff auto-fixed all issues!')
                    autofixes.append('Ruff auto-fixed linting issues')
                else:
                    errors.append(f'Ruff found issues that could not be auto-fixed')
                    errors.extend(result.stdout.strip().split('\n'))
            else:
                errors.append(f'Ruff found linting issues in {os.path.basename(file_path)}')
                errors.extend(result.stdout.strip().split('\n'))
        else:
            log_success('Ruff linting passed')
            
    except Exception as e:
        log_debug(f'Ruff check error: {e}')
    
    # Run ruff format check
    log_info('Running Ruff format check...')
    format_cmd = ['ruff', 'format', '--check', file_path]
    try:
        result = subprocess.run(format_cmd, capture_output=True, text=True, cwd=project_root)
        
        if result.returncode != 0:
            if autofix:
                log_warning('Ruff format issues found, auto-formatting...')
                format_fix_cmd = ['ruff', 'format', file_path]
                format_fix_result = subprocess.run(format_fix_cmd, capture_output=True, text=True, cwd=project_root)
                
                if format_fix_result.returncode == 0:
                    log_success('Ruff auto-formatted the file!')
                    autofixes.append('Ruff auto-formatted the file')
                else:
                    errors.append(f'Ruff formatting issues in {os.path.basename(file_path)}')
            else:
                errors.append(f'Ruff formatting issues in {os.path.basename(file_path)}')
        else:
            log_success('Ruff formatting correct')
            
    except Exception as e:
        log_debug(f'Ruff format error: {e}')
    
    return len(errors) == 0, errors, autofixes

def check_mypy(file_path: str, project_root: str) -> tuple[bool, list[str]]:
    """
    Run mypy type checking.
    Returns: (passed, errors)
    """
    errors = []
    
    # Check if mypy is available
    mypy_path = shutil.which('mypy')
    if not mypy_path:
        log_debug('Mypy not found in PATH - skipping type checking')
        return True, errors
    
    log_info('Running Mypy type checking...')
    
    # Build mypy command with strictness flags
    # Default: --disallow-untyped-defs catches untyped function parameters
    # Opt-in: CLAUDE_HOOKS_MYPY_STRICT=true enables full --strict mode
    mypy_strict = os.environ.get('CLAUDE_HOOKS_MYPY_STRICT', 'false').lower() == 'true'
    
    if mypy_strict:
        cmd = ['mypy', '--strict', '--pretty', file_path]
        log_debug('Running mypy with --strict (full strictness)')
    else:
        cmd = ['mypy', '--disallow-untyped-defs', '--pretty', file_path]
        log_debug('Running mypy with --disallow-untyped-defs (baseline strictness)')
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=project_root)
        
        if result.returncode != 0:
            errors.append(f'Mypy found type errors in {os.path.basename(file_path)}')
            if result.stdout:
                errors.extend(result.stdout.strip().split('\n'))
            if result.stderr:
                errors.extend(result.stderr.strip().split('\n'))
        else:
            log_success('Mypy type checking passed')
            
    except Exception as e:
        log_debug(f'Mypy error: {e}')
    
    return len(errors) == 0, errors

def check_pytest_suggestions(file_path: str, project_root: str):
    """Suggest running tests if test file exists"""
    base_name = file_path.replace('.py', '')
    test_paths = [
        f'{base_name}_test.py',
        f'{base_name}_tests.py',
        f'test_{Path(file_path).name}',
    ]
    
    # Check same directory
    for test_path in test_paths:
        if Path(test_path).exists():
            log_warning(f'💡 Related test found: {os.path.basename(test_path)}')
            log_warning('   Consider running: pytest')
            return
    
    # Check __tests__ directory
    tests_dir = Path(file_path).parent / '__tests__'
    if tests_dir.exists():
        for test_path in tests_dir.glob(f'test_{Path(file_path).name}'):
            log_warning(f'💡 Related test found: __tests__/{test_path.name}')
            log_warning('   Consider running: pytest')
            return
    
    log_warning(f'💡 No test file found for {os.path.basename(file_path)}')

def print_summary(errors: list[str], autofixes: list[str]):
    """Print summary of errors and autofixes"""
    if autofixes:
        print(f'\n{Colors.BLUE}═══ Auto-fixes Applied ═══{Colors.RESET}', file=sys.stderr)
        for fix in autofixes:
            print(f'{Colors.GREEN}✨{Colors.RESET} {fix}', file=sys.stderr)
        print(f'{Colors.GREEN}Automatically fixed {len(autofixes)} issue(s)!{Colors.RESET}', file=sys.stderr)
    
    if errors:
        print(f'\n{Colors.BLUE}═══ Quality Check Summary ═══{Colors.RESET}', file=sys.stderr)
        for error in errors:
            print(f'{Colors.RED}❌{Colors.RESET} {error}', file=sys.stderr)
        print(f'\n{Colors.RED}Found {len(errors)} issue(s) that MUST be fixed!{Colors.RESET}', file=sys.stderr)
        print(f'{Colors.RED}══════════════════════════════════════{Colors.RESET}', file=sys.stderr)
        print(f'{Colors.RED}❌ ALL ISSUES ARE BLOCKING ❌{Colors.RESET}', file=sys.stderr)
        print(f'{Colors.RED}══════════════════════════════════════{Colors.RESET}', file=sys.stderr)
        print(f'{Colors.RED}Fix EVERYTHING above until all checks are ✅ GREEN{Colors.RESET}', file=sys.stderr)

def parse_json_input() -> dict:
    """Parse JSON input from stdin"""
    input_data = sys.stdin.read().strip()
    
    if not input_data:
        log_warning('No JSON input provided.')
        print(f'\n{Colors.YELLOW}👉 Hook executed but no input to process.{Colors.RESET}', file=sys.stderr)
        sys.exit(0)
    
    try:
        return json.loads(input_data)
    except json.JSONDecodeError as e:
        log_error(f'Failed to parse JSON: {e}')
        sys.exit(1)

def extract_file_path(input_data: dict) -> str | None:
    """Extract file path from tool input, including Serena relative_path."""
    tool_input = input_data.get('tool_input', {})
    file_path = (
        tool_input.get('file_path')
        or tool_input.get('path')
        or tool_input.get('relative_path')
    )
    if not file_path:
        return None

    # Serena tools pass relative_path relative to the project root.
    if not os.path.isabs(file_path):
        project_root = os.environ.get('CLAUDE_PROJECT_DIR') or os.getcwd()
        return str(Path(project_root) / file_path)

    return file_path

def main():
    """Main entry point"""
    print('', file=sys.stderr)
    print(f'📦 Python Quality Check - Starting...', file=sys.stderr)
    print('─────────────────────────────────────', file=sys.stderr)
    
    # Parse input
    input_data = parse_json_input()
    file_path = extract_file_path(input_data)
    
    if not file_path:
        log_warning('No file path found in JSON input.')
        print(f'\n{Colors.YELLOW}👉 No file to check - tool may not be file-related.{Colors.RESET}', file=sys.stderr)
        sys.exit(0)
    
    # Check if file exists
    if not Path(file_path).exists():
        log_info(f'File does not exist: {file_path}')
        print(f'\n{Colors.YELLOW}👉 File skipped - doesn\'t exist.{Colors.RESET}', file=sys.stderr)
        sys.exit(0)
    
    # Skip non-Python files
    if not is_python_file(file_path):
        log_info(f'Skipping non-Python file: {file_path}')
        print(f'\n{Colors.GREEN}✅ No checks needed for {os.path.basename(file_path)}{Colors.RESET}', file=sys.stderr)
        sys.exit(0)
    
    # Update header
    print('', file=sys.stderr)
    print(f'🔍 Validating: {os.path.basename(file_path)}', file=sys.stderr)
    print('─────────────────────────────────────', file=sys.stderr)
    log_info(f'Checking: {file_path}')
    
    # Find project root
    project_root = find_project_root(file_path)
    log_debug(f'Project root: {project_root}')
    
    # Get config from environment
    autofix = os.environ.get('CLAUDE_HOOKS_AUTOFIX', 'true').lower() == 'true'
    ruff_enabled = os.environ.get('CLAUDE_HOOKS_RUFF_ENABLED', 'true').lower() != 'false'
    mypy_enabled = os.environ.get('CLAUDE_HOOKS_MYPY_ENABLED', 'true').lower() != 'false'
    
    all_errors = []
    all_autofixes = []
    
    # Run ruff checks
    if ruff_enabled:
        ruff_passed, ruff_errors, ruff_autofixes = check_ruff(file_path, project_root, autofix)
        all_errors.extend(ruff_errors)
        all_autofixes.extend(ruff_autofixes)
    
    # Run mypy checks
    if mypy_enabled:
        mypy_passed, mypy_errors = check_mypy(file_path, project_root)
        all_errors.extend(mypy_errors)
    
    # Print summary
    print_summary(all_errors, all_autofixes)
    
    # Exit with appropriate code
    if all_errors:
        print(f'\n{Colors.RED}🛑 FAILED - Fix issues in your edited file! 🛑{Colors.RESET}', file=sys.stderr)
        print(f'{Colors.CYAN}💡 CLAUDE.md CHECK:{Colors.RESET}', file=sys.stderr)
        print(f'{Colors.CYAN}  → What CLAUDE.md pattern would have prevented this?{Colors.RESET}', file=sys.stderr)
        print(f'{Colors.YELLOW}📋 NEXT STEPS:{Colors.RESET}', file=sys.stderr)
        print(f'{Colors.YELLOW}  1. Fix the issues listed above{Colors.RESET}', file=sys.stderr)
        print(f'{Colors.YELLOW}  2. The hook will run again automatically{Colors.RESET}', file=sys.stderr)
        print(f'{Colors.YELLOW}  3. Continue once all checks pass{Colors.RESET}', file=sys.stderr)
        sys.exit(2)
    else:
        print(f'\n{Colors.GREEN}✅ Quality check passed for {os.path.basename(file_path)}{Colors.RESET}', file=sys.stderr)
        if all_autofixes:
            print(f'\n{Colors.YELLOW}👉 File quality verified. Auto-fixes applied. Continue with your task.{Colors.RESET}', file=sys.stderr)
        else:
            print(f'\n{Colors.YELLOW}👉 File quality verified. Continue with your task.{Colors.RESET}', file=sys.stderr)
        
        # Suggest tests
        check_pytest_suggestions(file_path, project_root)
        
        sys.exit(0)

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        log_error(f'Fatal error: {e}')
        sys.exit(1)
