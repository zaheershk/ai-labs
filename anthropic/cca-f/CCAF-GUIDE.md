# CCA-F Exam Study Guide
### 5-Day Hands-On Lab Summary

---

---

# Page 1 — Day 01: Agentic Architecture & Orchestration
**Exam weight: 27% — the heaviest domain**

A multi-step customer support agent that routes tool calls, enforces a loop guard, and handles multi-turn tool use across a full agentic cycle.

---

## Sub-topic 1.1 — Tool Definitions & Description-Driven Routing

### What we learnt
- Tool descriptions are the **primary mechanism** Claude uses to decide which tool to call — not the tool name
- A description must answer: what it does, when to use it, and when NOT to use it (vs similar tools)
- Minimal descriptions like `"Searches files"` cause misrouting — richer descriptions with contrast language fix it
- Tool selection happens before execution — a bad description means the wrong tool gets called regardless of implementation

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Tool definition | `Anthropic.Tool` type — `@anthropic-ai/sdk` | `const tools: Anthropic.Tool[] = [{ name, description, input_schema }]` |
| Rich description | `description` field on each tool | `"...Do NOT use this to find files by name — use find_files for that."` |
| Input schema | `input_schema` — JSON Schema object | `{ type: "object", properties: { identifier: { type: "string" } }, required: ["identifier"] }` |
| Passing tools to API | `tools` param on `client.messages.create()` | `client.messages.create({ model, tools, messages })` |

---

## Sub-topic 1.2 — Agentic Loop with MAX_STEPS Guard

### What we learnt
- Every agentic loop must have a hard step cap — without it, a confused model can call tools indefinitely
- The loop continues only while `stop_reason === "tool_use"` — `"end_turn"` means the model is done
- Tool results are fed back as `user` role messages with `tool_result` content blocks
- The conversation history accumulates: assistant turn (tool_use) → user turn (tool_result) → repeat

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| API call | `client.messages.create()` — `@anthropic-ai/sdk` | Called on every loop iteration with accumulated `messages` |
| Stop signal | `response.stop_reason` | `if (response.stop_reason !== "tool_use") break` |
| Tool call detection | `response.content` — array of content blocks | `response.content.filter(b => b.type === "tool_use")` |
| Feeding results back | `tool_result` content block — `user` role | `{ role: "user", content: [{ type: "tool_result", tool_use_id, content }] }` |
| Message history type | `Anthropic.MessageParam[]` | Accumulated array passed as `messages` each turn |
| Loop guard | `MAX_STEPS = 10` — CLAUDE.md requirement | Enforced in every agentic loop across all labs |

---

## Sub-topic 1.3 — Parallel Tool Calls in a Single Response

### What we learnt
- Claude can emit multiple `tool_use` blocks in one response — these should be executed in parallel
- Processing them sequentially when they are independent wastes latency
- All tool results must be returned in a single `user` message — one `tool_result` per `tool_use` block

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Multiple tool calls | `response.content` — multiple `tool_use` blocks | `const toolUses = response.content.filter(b => b.type === "tool_use")` |
| Tool call identity | `tool_use.id` field | Each `tool_result` must reference its matching `tool_use_id` |
| Parallel execution | `Anthropic.ToolResultBlockParam[]` | All results returned in one `user` turn via `Promise.all` |

---

## Exam Tips — Day 01
| Trap | Correct answer |
|---|---|
| "Minimal tool descriptions are fine — the model figures it out" | Descriptions are the routing mechanism; minimal = misrouting |
| "Return tool results one at a time across multiple turns" | All results for a single assistant response go in one user turn |
| "There is no risk of infinite loops in agentic systems" | Always set MAX_STEPS; runaway loops are a real production risk |
| "stop_reason = tool_use means the agent is done" | Opposite — tool_use means continue; end_turn means done |

---
---

# Page 2 — Day 02: Tool Design & MCP Integration
**Exam weight: 18%**

A codebase search agent with two tools that solve similar problems differently, plus an MCP server that exposes those tools to Claude Code via a standard protocol.

---

## Sub-topic 2.1 — Distinguishing Similar Tools via Descriptions

### What we learnt
- Two tools that do related things must have descriptions that explicitly contrast them
- `search_codebase` (file contents) vs `find_files` (file names/paths) — both sound like "search" but are fundamentally different
- Without contrast language, the model picks arbitrarily — the fix is always richer descriptions, not fewer tools or few-shot examples

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Contrast language in descriptions | `description` field | `"Do NOT use this to search file contents — use search_codebase for that."` |
| Tool array | `Anthropic.Tool[]` passed to `client.messages.create()` | Both tools in same `tools` array — model chooses based on description |
| Model used | `claude-haiku-4-5-20251001` | Default model per CLAUDE.md — `@anthropic-ai/sdk` |

---

## Sub-topic 2.2 — MCP Server Setup

### What we learnt
- MCP (Model Context Protocol) exposes tools to Claude Code without custom SDK code per integration
- The server defines tools using the same `name`, `description`, `inputSchema` pattern as SDK tools
- Claude Code connects to MCP servers via `.mcp.json` — at project or user level
- MCP servers run as separate processes — started independently from the agent

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| MCP server class | `McpServer` — `@modelcontextprotocol/sdk/server/mcp.js` | `const server = new McpServer({ name: "dev-productivity", version: "1.0.0" })` |
| Tool registration | `server.tool(name, zodSchema, handler)` | `server.tool("search_codebase", { query: z.string() }, async ({ query }) => { ... })` |
| Input validation | `zod` schemas on MCP tools | `{ query: z.string(), file_glob: z.string().optional() }` |
| Transport layer | `StdioServerTransport` — `@modelcontextprotocol/sdk/server/stdio.js` | `server.connect(new StdioServerTransport())` |
| Claude Code config | `.mcp.json` — `mcpServers` key | `{ "mcpServers": { "dev-productivity": { "command": "ts-node", "args": [...] } } }` |
| Token env var | `env` block in `.mcp.json` | `"env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }` |

---

## Sub-topic 2.3 — Input Schema Design

### What we learnt
- `required` fields should only include what the tool cannot function without
- Optional parameters with defaults reduce friction — model less likely to skip a tool call
- `description` on each property guides the model on format and valid values

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| JSON Schema in tool | `input_schema.properties` | Each property has `type` + `description` |
| Optional fields | Omit from `required` array | `required: ["query"]` — `file_glob`, `case_sensitive` are optional |
| Property descriptions | `description` per property | `"Optional glob e.g. '**/*.ts' — omit to search all files"` |

---

## Exam Tips — Day 02
| Trap | Correct answer |
|---|---|
| "Consolidate similar tools into one generic tool to avoid confusion" | Keep tools separate with contrast descriptions — generic tools lose specificity |
| "Few-shot examples fix tool misrouting" | Richer descriptions fix misrouting — examples are for output format, not tool selection |
| "MCP and SDK tools are interchangeable in all contexts" | MCP is for Claude Code integrations; SDK tools are for programmatic agents |
| "MCP server must run in the same process as the agent" | MCP servers are separate processes connected via .mcp.json |

---
---

# Page 3 — Day 03: Claude Code Configuration & Workflows
**Exam weight: 20%**

Config artifacts for a production Claude Code setup — CLAUDE.md hierarchy, path-specific rules, slash commands, skills, and a CI/CD code review pipeline built on the Anthropic SDK.

---

## Sub-topic 3.1 — CLAUDE.md Hierarchy & `@import`

### What we learnt
- Project-level `CLAUDE.md` is committed to git — shared with the entire team on clone
- User-level `~/.claude/CLAUDE.md` is NOT version-controlled — personal only, never team conventions
- `@import` pulls in a sub-file inline — keeps the root `CLAUDE.md` short while allowing modular standards
- Subdirectory `CLAUDE.md` applies to that subtree only — cannot handle files spread across directories

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Project instructions | `CLAUDE.md` — project root | Committed to git; loaded automatically by Claude Code on every session |
| Modular import | `@import` directive — Claude Code syntax | `@import ./labs/day-03-claude-code/standards/api-conventions.md` |
| Scoped instructions | Subdirectory `CLAUDE.md` | Applies only to files under that directory |
| User-level instructions | `~/.claude/CLAUDE.md` | Never version-controlled; personal only |

---

## Sub-topic 3.2 — Path-Specific Rules & Slash Commands

### What we learnt
- `.claude/rules/` files with `paths` frontmatter activate only when Claude edits matching files — scoped automatically
- Glob-pattern rules handle cross-directory file types (`**/*.test.ts`) — subdirectory CLAUDE.md cannot
- `.claude/commands/` slash commands are project-scoped (committed) — available to all devs on clone
- `~/.claude/commands/` slash commands are personal — never shared

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Path-scoped rules | `.claude/rules/*.md` with YAML frontmatter | `---\npaths: ["**/*.test.ts", "**/*.spec.ts"]\n---` |
| Glob pattern matching | `paths` array in rule frontmatter | Handles cross-directory file types — subdirectory CLAUDE.md cannot |
| Project slash command | `.claude/commands/review.md` | Invoked via `/review` in Claude Code; committed to git |
| Personal slash command | `~/.claude/commands/` | Not version-controlled; personal only |

---

## Sub-topic 3.3 — Skills with Frontmatter

### What we learnt
- Skills are on-demand invocation — NOT always-loaded like CLAUDE.md
- `context: fork` runs the skill in an isolated sub-agent — verbose output doesn't pollute the main conversation
- `allowed-tools` restricts which tools the skill can use — prevents destructive actions in read-only skills
- `argument-hint` prompts for a parameter when invoked without arguments

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Skill definition | `.claude/skills/<name>/SKILL.md` | `name`, `description`, `context`, `allowed-tools`, `argument-hint` in YAML frontmatter |
| Isolated execution | `context: fork` frontmatter option | Runs in sub-agent; verbose output doesn't pollute main conversation |
| Tool restriction | `allowed-tools: Read, Grep, Glob` | Prevents `Write`, `Edit`, `Bash` — read-only enforcement |
| Argument passing | `$ARGUMENTS` placeholder | Resolved at invocation time — `argument-hint` shown when omitted |

---

## Sub-topic 3.4 — CI/CD Invocation & Plan Mode

### What we learnt
- `-p` / `--print` flag is the only correct way to run Claude Code non-interactively — without it the job hangs
- `--output-format json` produces machine-parseable output for PR comments
- Plan mode is for multi-file or architectural changes where complexity is known upfront
- Direct execution is for single-file, well-scoped changes with a clear cause

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Non-interactive mode | `claude -p` CLI flag | `claude -p "Review this PR for security issues"` — exits after one response |
| Machine output | `--output-format json` CLI flag | Pipe into jq or post as inline PR comments |
| Model selection | `claude-haiku-4-5-20251001` via SDK | Used in `client.messages.create({ model: "claude-haiku-4-5-20251001" })` |
| Two-pass review | Two separate `client.messages.create()` calls | Pass 1: per-file; Pass 2: all file summaries for cross-file issues |
| SDK package | `@anthropic-ai/sdk` | `import Anthropic from "@anthropic-ai/sdk"` |

---

## Exam Tips — Day 03
| Trap | Correct answer |
|---|---|
| "Put team conventions in ~/.claude/CLAUDE.md" | User-level — not version-controlled, not shared |
| "Use a CLAUDE.md in each test subdirectory" | Test files span directories — use glob rules in .claude/rules/ |
| "Skills are always-loaded like CLAUDE.md" | Skills are on-demand; CLAUDE.md is always-loaded |
| "CLAUDE_HEADLESS=true runs Claude Code non-interactively" | This env var does not exist — use -p flag |
| "Start direct execution, switch to plan if complexity emerges" | Complexity is known upfront — choose plan from the start |
| "context: fork is for all skills" | Fork is for verbose/exploratory skills; simple one-liners don't need it |

---
---

# Page 4 — Day 04: Prompt Engineering & Structured Output
**Exam weight: 20%**

A contract extraction pipeline with JSON schema tools, validation-retry, few-shot examples, batch processing, and a two-pass code review architecture.

---

## Sub-topic 4.1 — Extraction Tool Schema Design

### What we learnt
- Nullable fields (`["string", "null"]`) force the model to explicitly return `null` for absent data — prevents fabrication
- `required` fields on data that may be absent cause hallucination — only mark truly always-present fields as required
- Enum + `"other"` + detail field: structured enumeration with an escape hatch for edge cases
- A `confidence` field lets the model signal uncertainty rather than guess

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Tool definition | `Anthropic.Tool` — `@anthropic-ai/sdk` | `const extractionTool: Anthropic.Tool = { name, description, input_schema }` |
| Nullable field | JSON Schema `type: ["string", "null"]` | `expiry_date: { type: ["string", "null"], description: "null if open-ended" }` |
| Enum field | JSON Schema `enum` array | `contract_type: { type: "string", enum: ["service", "nda", "other", ...] }` |
| Confidence signal | Custom enum field in schema | `extraction_confidence: { type: "string", enum: ["high", "medium", "low", "unclear"] }` |
| Required vs optional | `required` array in `input_schema` | Only `contract_id`, `parties`, `effective_date`, `contract_type`, `extraction_confidence` |

---

## Sub-topic 4.2 — `tool_choice` Modes

### What we learnt
- `auto` — Claude decides whether to call any tool; may respond in plain text
- `any` — Claude must call at least one tool; picks which one
- `tool` — Claude must call this specific named tool; strongest guarantee for extraction pipelines
- For guaranteed structured output, always use `tool` or `any` — never `auto`

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Optional tool use | `tool_choice: { type: "auto" }` — `Anthropic.ToolChoice` | Model may or may not call a tool |
| Guaranteed tool use | `tool_choice: { type: "any" }` | Model must call at least one tool |
| Forced specific tool | `tool_choice: { type: "tool", name: "extract_contract_data" }` | Guarantees this exact tool is called |
| Type annotation | `Anthropic.ToolChoice` | Used to type the `tool_choice` parameter correctly |

---

## Sub-topic 4.3 — Validation-Retry Loop

### What we learnt
- Retry only works when you explain the specific rule violated — "try again" alone does nothing
- Two outcomes: **resolvable** (format errors, unknown business rules) and **unresolvable** (data absent from document)
- JSON schema eliminates syntax errors but not semantic errors — `""` is not `null` even if schema says `["string", "null"]`
- Always strip markdown code fences before `JSON.parse` — models ignore format instructions occasionally

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Retry via multi-turn | `messages` array — `@anthropic-ai/sdk` | Failed extraction + error message appended as new `user` turn |
| Forced re-extraction | `tool_choice: { type: "tool", name: "extract_contract_data" }` | Same tool forced on retry call |
| Error in prompt | `client.messages.create()` called again | Retry `content` includes prior JSON + specific validation error text |
| Defensive parsing | Strip fences before `JSON.parse` | `raw.replace(/^\`\`\`(?:json)?\n?/m, "").replace(/\n?\`\`\`$/m, "").trim()` |

---

## Sub-topic 4.4 — Few-Shot Examples

### What we learnt
- Few-shot examples in the system prompt teach the model a **rule**, not just one case — they generalise to novel patterns
- Examples cover: date from footer only, ambiguous type → `"other"`, absent clause → `null` not fabricated
- Without examples, models pick the closest-sounding enum value and may invent absent field values
- Examples belong in the `system` prompt — not in the `user` turn

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| System prompt | `system` parameter — `client.messages.create()` | `client.messages.create({ model, system: SYSTEM_WITH_EXAMPLES, tools, ... })` |
| Few-shot placement | Inline markdown in `system` string | `## Examples\n### Example 1 — Date in footer only\n...` |
| Baseline comparison | Two calls — with and without `system` examples | Same document, same tool; compared `contract_type` and `penalty_clause` output |

---

## Sub-topic 4.5 — Message Batches API

### What we learnt
- `custom_id` is the only link between a batch request and its response — always set it to something meaningful
- Batch API has a **24-hour processing window** with no latency SLA — never use for blocking workflows
- Results include `type: "succeeded" | "errored" | "expired"` — handle all three
- Failure resubmission: collect failed `custom_id`s and create a **new batch** with only those requests

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Batch submission | `client.messages.batches.create()` — `@anthropic-ai/sdk` | `requests: docs.map(doc => ({ custom_id, params: { model, tools, messages } }))` |
| Status polling | `client.messages.batches.retrieve(batchId)` | `batch.processing_status === "in_progress" \| "ended"` |
| Result counts | `batch.request_counts` | `{ succeeded, errored, processing, canceled, expired }` |
| Result iteration | `client.messages.batches.results(batchId)` — async iterator | `for await (const result of await client.messages.batches.results(id))` |
| Result correlation | `result.custom_id` | Links response back to source document |
| Result type check | `result.result.type` | `"succeeded"` → process; anything else → collect for resubmission |

---

## Sub-topic 4.6 — Explicit Review Criteria & Multi-Pass Architecture

### What we learnt
- Explicit `REPORT`/`SKIP` categories outperform vague instructions like "only high-confidence issues"
- Single-pass on many files causes attention dilution — findings become shallower for later files
- A larger context model does NOT fix attention quality — multi-pass architecture is the correct solution
- Two-pass: per-file first, then integration pass on summaries for cross-file data flow issues

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Explicit criteria | `messages[].content` prompt engineering | `REPORT only: SQL_INJECTION \| HARDCODED_SECRET\nSKIP: variable naming, formatting` |
| Vague vs explicit | Two separate `client.messages.create()` calls | Same code snippet; compared noise in output |
| Two-pass review | Two `client.messages.create()` calls sequentially | Pass 1: per-file `messages`; Pass 2: all summaries in one prompt |
| Model | `claude-haiku-4-5-20251001` | Both passes use Haiku — multi-pass beats switching to a larger model |

---

## Exam Tips — Day 04
| Trap | Correct answer |
|---|---|
| "JSON schema guarantees correct output" | Eliminates syntax errors only — semantic errors still occur |
| "Add 'be conservative, only high-confidence findings'" | Vague filtering doesn't reduce noise — explicit REPORT/SKIP does |
| "Use batch API for pre-merge checks to save costs" | Batch has 24h window, no SLA — developers can't wait |
| "Run 3 passes on full PR, flag issues appearing in 2+" | Suppresses real bugs caught intermittently |
| "Switch to a larger model for better multi-file attention" | Larger context ≠ better attention quality — use multi-pass |
| "tool_choice: auto guarantees extraction" | auto may return plain text — use tool or any for guaranteed extraction |

---
---

# Page 5 — Day 05: Context Management & Reliability
**Exam weight: 15%**

A multi-agent research pipeline demonstrating context trimming, parallel subagent coordination, structured error recovery, crash-safe scratchpad persistence, and human review routing.

---

## Sub-topic 5.1 — Case Facts Block & Context Trimming

### What we learnt
- Models have a "lost in the middle" effect — attention degrades for content in the middle of a long prompt
- Critical facts must be injected at the **top** of every prompt — not appended or buried in history
- Verbose tool output must be trimmed **before** it enters context — not after
- Transactional facts (amounts, dates, IDs) must survive verbatim — summarisation must never compress them

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Top-loading context | `messages[0].content` structure | Facts block prepended as first lines of `content` string — before the actual question |
| Model attention | `claude-haiku-4-5-20251001` | Haiku used for coordinator — facts block at top compensates for "lost in middle" effect |
| API call | `client.messages.create()` — `@anthropic-ai/sdk` | `messages: [{ role: "user", content: \`${factsBlock}\n\n${question}\` }]` |
| Context control | `max_tokens: 512` | Limiting coordinator response size — coordinator summarises, not expands |

---

## Sub-topic 5.2 — Parallel Subagent Spawning

### What we learnt
- Parallel subagent execution = multiple Task calls in **one coordinator response** — not across two turns
- Two separate coordinator turns = sequential — this is the exam trap
- Subagents are completely stateless — inherit zero coordinator context; everything passed explicitly
- `Promise.all` in SDK code is the equivalent of a coordinator emitting two Task calls in one response

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Parallel API calls | `Promise.all` over `client.messages.create()` | `const [claimsA, claimsB] = await Promise.all([runSubagent(...), runSubagent(...)])` |
| Subagent isolation | Separate `system` + `messages` per call | Each subagent gets its own `system` prompt and receives `factsBlock` explicitly |
| Tool scoping | Different `tools` arrays per subagent | Subagent-A: `[searchWebTool]`; Subagent-B: `[readDocumentTool]` |
| Loop guard | `MAX_STEPS = 10` per subagent | Each `runSubagent` enforces its own step cap |
| Stop reason | `response.stop_reason` | `"end_turn"` exits subagent loop; `"tool_use"` continues |

---

## Sub-topic 5.3 — Structured Error Propagation

### What we learnt
- A failing subagent must return a structured error — not silence, not a generic string
- `is_empty_result: false` = access failure → coordinator retries
- `is_empty_result: true` = valid empty result → coordinator proceeds, annotates gap
- `partial_results` preserves whatever was found before failure — coordinator uses it rather than discarding

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Retry subagent call | `client.messages.create()` called again | New call with narrower query from `alternative_approaches[0]` |
| Tool result feeding | `tool_result` content blocks in `messages` | Partial results from failed subagent fed into retry prompt |
| System prompt | `system` parameter | Retry subagent given same system prompt — stateless, no memory of first attempt |
| Model | `claude-haiku-4-5-20251001` | Same model for retry — structured error gives enough context to succeed |

---

## Sub-topic 5.4 — Scratchpad File for Crash Recovery

### What we learnt
- Writing to disk between phases enables crash recovery — coordinator resumes from scratchpad, not from scratch
- Scratchpad solves context degradation — phase 2 reads facts from disk, not from a long drifted history
- The scratchpad contains: topic, phase, claims, coverage gaps, sources, timestamp
- Phase 2 must be able to reconstruct full context from the scratchpad alone

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Phase 2 prompt | `messages[0].content` built from scratchpad | `content: \`Topic: ${prior.topic}\n\nClaims:\n${claimsList}\`` — no conversation history used |
| System prompt | `system` parameter on synthesis call | `"Preserve exact statistics and source names — do not paraphrase numbers"` |
| API call | `client.messages.create()` — `@anthropic-ai/sdk` | Fresh call with scratchpad-built prompt; no prior message history passed |
| Model | `claude-haiku-4-5-20251001` | Synthesis call — scratchpad provides full context so Haiku is sufficient |

---

## Sub-topic 5.5 — Human Review Routing & Escalation Criteria

### What we learnt
- Route by **field-level confidence**, not aggregate accuracy — 97% overall can hide 40% failure on a specific field
- Conflicting sources must be preserved with both values and full attribution — never resolved arbitrarily
- Escalation criteria must be explicit with few-shot examples — vague rules cause wrong escalations
- Customer frustration ≠ escalate; agent low confidence ≠ escalate; explicit request = escalate immediately

### How we used it
| Claude feature | Element used | Snippet / mention |
|---|---|---|
| Escalation rules | `system` parameter — `client.messages.create()` | Full `ESCALATE / DO NOT escalate` rule block with examples in system prompt |
| Few-shot in system | Inline examples in `system` string | `Example 1 — ESCALATE: "I want to speak to a human"\nAction: escalate_to_human immediately` |
| Structured output | JSON response format instruction | `system` asks for `{ "action": "escalate"\|"resolve", "reason", "response" }` |
| Three test calls | Three separate `client.messages.create()` calls | One per customer message — compared escalation decisions |
| Model | `claude-haiku-4-5-20251001` | Applied escalation rules correctly from explicit system prompt |

---

## Exam Tips — Day 05
| Trap | Correct answer |
|---|---|
| "Emit Task calls across two coordinator turns for parallel execution" | Parallel = single response with multiple Task calls |
| "Summarise all findings into prose before passing to synthesis" | Loses claim-source attribution — pass structured mappings |
| "Escalate when customer sentiment score exceeds threshold" | Sentiment ≠ complexity; explicit request is the escalation signal |
| "Return empty results on subagent timeout to avoid blocking" | Silent suppression — coordinator cannot make recovery decisions |
| "97% accuracy means human review can be reduced" | Aggregate masks field-level failures — validate by field |
| "Use /compact to start fresh when context fills" | /compact reduces context while maintaining continuity — don't restart |
| "Subagents inherit coordinator context automatically" | Subagents are stateless — pass all context explicitly |
