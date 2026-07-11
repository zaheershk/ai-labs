---
name: analyze-codebase
description: Explores and maps an unfamiliar codebase structure
context: fork
allowed-tools: Read, Grep, Glob
argument-hint: "Path to analyze (default: current directory)"
---

Explore the codebase at $ARGUMENTS and produce a structured map:
1. Entry points and main execution flows
2. Key abstractions and their responsibilities
3. External dependencies and integration points
4. Potential areas of risk or complexity

Use Grep to find entry points first, then Read to trace flows.
Do NOT use Write, Edit, or Bash.
