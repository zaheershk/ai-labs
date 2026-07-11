# API Conventions — Modular Standards

These conventions apply to all API handlers across the project.
Imported into the root CLAUDE.md via `@import` to keep root clean.

## Handler shape
- All handlers must be `async` — no raw Promise chains
- Return `{ data, error, code, retryable }` — never throw past the handler boundary
- Validate inputs at entry before calling downstream services

## Error codes
| Code | Meaning |
|------|---------|
| `VALIDATION_ERROR` | Malformed input, don't retry |
| `NOT_FOUND` | Resource missing, don't retry |
| `UPSTREAM_ERROR` | Dependency failure, retryable |
| `AUTH_ERROR` | Credential/permission failure, don't retry |

## Secrets
- Never log request bodies that may contain credentials
- Never return internal stack traces to the caller
