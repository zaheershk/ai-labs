# Day 02 — Tool Design & MCP Integration

## Domain alignment
- **Primary:** D2 — Tool Design & MCP Integration (18%)
- **Task statements:** 2.1, 2.2, 2.3, 2.4, 2.5
- **Exam scenarios:** Developer Productivity with Claude, Multi-Agent Research System

## What to build

Two parts: (1) an agent demonstrating tool design principles, (2) a minimal MCP server.

---

## Part A — `src/index.ts`: Tool design & selection

### Four tools with differentiated descriptions (TS 2.1)
Design tools so each description includes: purpose, expected inputs, example queries, edge cases, and explicit "use this instead of X when…" boundaries.

| Tool | Description focus |
|------|------------------|
| `search_codebase` | Searches file **contents** for patterns (function names, error messages, imports) — use this when you know what text to find |
| `find_files` | Matches file **paths** by name/extension pattern — use this when you know the file name or type, not the content |
| `read_document` | Loads a **single full file** — use after search/find narrows to a specific file |
| `execute_command` | Runs a **shell command** — use only for build, test, or lint operations, never for file search |

These four map directly to the exam's built-in tools (Grep/Glob/Read/Bash) but are defined as custom tools to practice description writing.

### Structured error responses (TS 2.2)
Every tool must return errors in this shape:
```ts
{
  isError: true,
  errorCategory: "transient" | "validation" | "permission" | "business",
  isRetryable: boolean,
  message: string,           // human-readable, for the agent to relay
  attempted: string          // what was tried, for coordinator recovery
}
```

Implement at least one error of each `errorCategory`:
- `transient` — file system timeout (isRetryable: true)
- `validation` — invalid glob pattern (isRetryable: false)
- `permission` — path outside allowed directory (isRetryable: false)
- `business` — file too large to read (isRetryable: false, suggest chunking)

### tool_choice configurations (TS 2.3)
Demonstrate all three modes in separate API calls:
- `tool_choice: { type: "auto" }` — model decides whether to call a tool
- `tool_choice: { type: "any" }` — model must call a tool (any of them)
- `tool_choice: { type: "tool", name: "search_codebase" }` — model must call this specific tool

### Tool count principle (TS 2.3)
Add a comment block: explain why 18 tools degrades selection vs 4–5 scoped tools. Show the synthesis agent example (should not have access to web search tools).

---

## Part B — `mcp-server/src/index.ts`: MCP server

### One tool + one resource
```
Tool:     search_issues(query: string) → returns matching issue summaries
Resource: issues://summary             → exposes the full issue catalog as readable content
```

The distinction to demonstrate:
- **Tool** = agent takes an action (search with a query)
- **Resource** = agent reads a catalog (what issues exist, without querying)

### `.mcp.json` (TS 2.4)
Place at `labs/day-02-tool-mcp/.mcp.json`:
```json
{
  "mcpServers": {
    "dev-productivity": {
      "command": "ts-node",
      "args": ["mcp-server/src/index.ts"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

Key points to note in comments:
- `.mcp.json` = project-scoped (committed, shared with team)
- `~/.claude.json` = user-scoped (personal/experimental, never committed)
- All configured MCP servers are discovered at connection time and available simultaneously

## Key concepts (exam-relevant)

- Tool descriptions are the **primary mechanism** LLMs use for tool selection
- `isError: true` flag in MCP response is how failures communicate back to the agent
- Resources expose content catalogs (what exists); tools perform actions (do something)
- `tool_choice: "any"` guarantees a tool call; `"auto"` allows conversational text response
- Never give a synthesis agent web-search tools — it will misuse them

## Exam traps

| Wrong answer | Why it's wrong |
|---|---|
| "Add few-shot examples to fix tool misrouting" | Root cause is poor descriptions — fix descriptions first (sample Q2) |
| "Consolidate two similar tools into one generic tool" | Valid eventually, but not the first step when descriptions are the issue |
| "Give all agents access to all tools for flexibility" | Degrades reliability — 18 tools vs 4–5 is the benchmark in the guide |
| "MCP resources are just another type of tool" | Resources are readable content catalogs; tools perform actions |
| "Store GITHUB_TOKEN directly in .mcp.json" | Credentials must use `${ENV_VAR}` expansion — never hardcoded |

## Run & validate

```bash
# Terminal 1 — start MCP server
cd anthropic/cca-f
npm run mcp-02

# Terminal 2 — run agent
npm run lab-02
```

### Expected output
1. Four tools called with correct routing (no cross-tool confusion)
2. Each error category demonstrated with structured response
3. `tool_choice: "any"` forces a tool call on an otherwise conversational prompt
4. MCP server starts and exposes both tool and resource
