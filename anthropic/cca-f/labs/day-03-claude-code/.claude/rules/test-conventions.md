---
paths: ["**/*.test.ts", "**/*.spec.ts"]
---

# Test Conventions
- Use descriptive test names: "should [behavior] when [condition]"
- Each test must have exactly one assertion focus
- Mock external dependencies at the module boundary only
- Do not test implementation details — test observable behavior
- Every test file must have at least one edge case (null, empty, boundary value)
