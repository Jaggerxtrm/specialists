#!/usr/bin/env python3
import shutil
import json
import sys

def check_command(cmd):
    return shutil.which(cmd) is not None

def main():
    agents = ["gemini", "qwen"]
    found = {agent: check_command(agent) for agent in agents}
    
    if any(found.values()):
        print("Available Agents:")
        for agent, is_available in found.items():
            status = "AVAILABLE" if is_available else "NOT FOUND"
            print(f"- {agent}: {status}")
    else:
        print("No neighboring agents (gemini, qwen) found in PATH.")
        sys.exit(1)

if __name__ == "__main__":
    main()