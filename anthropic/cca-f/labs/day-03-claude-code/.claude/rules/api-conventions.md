---
paths: ["src/api/**/*"]
---

# API Handler Conventions
- All handlers must use async/await — no raw Promise chains
- Return structured errors: `{ error: string, code: string, retryable: boolean }`
- Never throw raw exceptions — catch at the handler boundary and return structured responses
- Validate all inputs at the handler entry point before calling downstream services
