import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const client = new Anthropic();

// ─── Tool definitions (TS 2.1) ────────────────────────────────────────────────
// Descriptions are the PRIMARY routing mechanism. Each one answers:
//   - what does this tool do?
//   - what inputs does it expect?
//   - when should you use THIS one vs the similar alternatives?
//
// Exam trap (sample Q2): minimal descriptions ("Searches files" / "Finds files")
// cause misrouting. The fix is richer descriptions — not few-shot examples,
// not consolidating tools into one generic tool.
const tools: Anthropic.Tool[] = [
  {
    name: "search_codebase",
    description:
      "Search file CONTENTS for a text pattern across the codebase. " +
      "Use this when you know WHAT TEXT to find — a function name, error message, " +
      "import statement, variable name, or string literal. " +
      "Example queries: 'find all callers of processRefund()', " +
      "'locate where AUTH_ERROR is thrown', 'find files that import from utils/date'. " +
      "Do NOT use this to find files by name or extension — use find_files for that.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Text or regex pattern to search for" },
        directory: { type: "string", description: "Directory to search in (default: project root)" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "find_files",
    description:
      "Find files by PATH pattern — name, extension, or directory structure. " +
      "Use this when you know WHAT THE FILE IS CALLED or what type it is, " +
      "not what it contains. " +
      "Example queries: 'find all test files', 'locate config.json files', " +
      "'find all .ts files in the api/ directory'. " +
      "Do NOT use this to search file contents — use search_codebase for that.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Glob pattern e.g. '**/*.test.ts' or 'src/api/**/*'" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "read_document",
    description:
      "Read the FULL CONTENTS of a single specific file. " +
      "Use this after search_codebase or find_files has identified the exact file you need. " +
      "Do not use this to search across files — it only reads one file at a time. " +
      "Do not use this when you only need to find a file by name (use find_files) " +
      "or locate a pattern in multiple files (use search_codebase).",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Absolute or relative path to the file" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "execute_command",
    description:
      "Run a shell command. Use ONLY for build, test, lint, or install operations " +
      "— for example: 'npm test', 'tsc --noEmit', 'npm install'. " +
      "Do NOT use this for file search or reading — use search_codebase or find_files instead. " +
      "Do NOT use this for arbitrary shell operations outside of build/test/lint.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Shell command to run" },
      },
      required: ["command"],
    },
  },
];

// ─── Structured error shape (TS 2.2) ─────────────────────────────────────────
// Every tool result must be one of these two shapes.
// isError: true flags a failure to the agent so it can recover or relay the message.
interface ToolError {
  isError: true;
  errorCategory: "transient" | "validation" | "permission" | "business";
  isRetryable: boolean;
  message: string;    // human-readable; agent relays this to the user
  attempted: string;  // what was tried; coordinator uses this to plan recovery
}
interface ToolSuccess {
  isError: false;
  result: string;
}
type ToolResult = ToolError | ToolSuccess;

// ─── Simulated tool executor (TS 2.2) ────────────────────────────────────────
// Real executor would call grep/fs/shell. Here we trigger each error category
// deterministically so the demo is reproducible.
function executeSimulatedTool(name: string, input: Record<string, string>): ToolResult {
  console.log(`\n    [executor] tool="${name}"  input=${JSON.stringify(input)}`);

  // TRANSIENT — file-system index temporarily unavailable (isRetryable: true)
  if (name === "search_codebase" && (input.pattern ?? "").includes("processRefund")) {
    console.log("    [executor] => TRANSIENT error (filesystem timeout — retry is safe)");
    return {
      isError: true,
      errorCategory: "transient",
      isRetryable: true,
      message: "File-system scan timed out after 5 000 ms. The index is temporarily unavailable — retry shortly.",
      attempted: `grep -r "${input.pattern}" ${input.directory ?? "."}`,
    };
  }

  // VALIDATION — dangerous shell command rejected (isRetryable: false)
  if (name === "execute_command" && /rm\s+-rf/.test(input.command ?? "")) {
    console.log("    [executor] => VALIDATION error (dangerous command blocked — fix the command)");
    return {
      isError: true,
      errorCategory: "validation",
      isRetryable: false,
      message: `Command "${input.command}" is not permitted. Only build / test / lint operations are allowed.`,
      attempted: `sh -c "${input.command}"`,
    };
  }

  // PERMISSION — path outside the project root (isRetryable: false)
  if (name === "read_document" && /^\/(etc|usr|var|sys|root)/.test(input.file_path ?? "")) {
    console.log("    [executor] => PERMISSION error (path outside project root — cannot retry)");
    return {
      isError: true,
      errorCategory: "permission",
      isRetryable: false,
      message: `Access denied: "${input.file_path}" is outside the allowed project directory.`,
      attempted: `fs.readFile("${input.file_path}")`,
    };
  }

  // BUSINESS — file too large to load into context (isRetryable: false, suggest chunking)
  if (name === "read_document" && /(bundle|\.min\.|dist\/)/.test(input.file_path ?? "")) {
    console.log("    [executor] => BUSINESS error (file too large — use search_codebase instead)");
    return {
      isError: true,
      errorCategory: "business",
      isRetryable: false,
      message: `"${input.file_path}" is 48 MB — exceeds the 2 MB read limit. Use search_codebase to locate the specific section you need.`,
      attempted: `fs.readFile("${input.file_path}")`,
    };
  }

  console.log("    [executor] => SUCCESS");
  return { isError: false, result: `[simulated result for ${name}]` };
}

// ─── Part 1: observe tool selection ──────────────────────────────────────────
// Send three different prompts and print which tool Claude picks each time.
// No execution — just watching the routing decision.
async function observeToolSelection(prompt: string): Promise<void> {
  console.log(`\nPrompt: "${prompt}"`);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    tools,
    messages: [{ role: "user", content: prompt }],
  });

  console.log(`stop_reason : ${response.stop_reason}`);

  for (const block of response.content) {
    if (block.type === "tool_use") {
      console.log(`tool chosen : ${block.name}`);
      console.log(`input       : ${JSON.stringify(block.input)}`);
    }
    if (block.type === "text") {
      console.log(`text        : ${block.text}`);
    }
  }
}

// ─── Part 2: structured error responses ──────────────────────────────────────
// Full two-turn loop: user prompt → Claude picks tool → executor returns error
// → Claude sees the structured error and replies with a recovery suggestion.
async function demonstrateErrorScenario(scenario: string, prompt: string): Promise<void> {
  console.log(`\n  ── ${scenario}`);
  console.log(`  Prompt: "${prompt}"`);

  // Turn 1 — get Claude's tool call
  const turn1 = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    tools,
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = turn1.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) {
    console.log("  [no tool called — Claude went straight to text]");
    return;
  }
  console.log(`  Tool called : ${toolUse.name}`);
  console.log(`  Tool input  : ${JSON.stringify(toolUse.input)}`);

  // Execute the tool (returns structured error or success)
  const result = executeSimulatedTool(toolUse.name, toolUse.input as Record<string, string>);
  console.log(`  Full result : ${JSON.stringify(result)}`);

  // Turn 2 — return the result to Claude so it can acknowledge or suggest recovery
  const turn2 = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    tools,
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: turn1.content },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            is_error: result.isError,
          },
        ],
      },
    ],
  });

  const reply = turn2.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (reply) {
    console.log(`  Claude reply: ${reply.text.slice(0, 300)}`);
  }
}

// ─── Tool count principle (TS 2.3) ───────────────────────────────────────────
// More tools ≠ more capable. 18 tools degrades selection accuracy because:
//   1. Claude must scan all descriptions on every decision — more noise per call
//   2. Similar-sounding tools create ambiguity that descriptions alone can't resolve
//   3. The 4–5 scoped tools benchmark comes directly from the exam guide
//
// Scope tools to the agent's role:
//   - A synthesis agent (summarise, combine sources) must NOT have web-search tools.
//     Giving it search access causes it to re-fetch rather than synthesise, defeating
//     the purpose and burning unnecessary tokens.
//   - A file-ops agent should not have refund or order-management tools.
//
// Rule: each agent gets only the tools it needs for its specific task.

// ─── Part 3: tool_choice modes (TS 2.3) ──────────────────────────────────────
// Three modes control whether and which tools Claude may call:
//   "auto"  — Claude decides: may call a tool OR reply in plain text
//   "any"   — Claude MUST call a tool (any of the available ones)
//   "tool"  — Claude MUST call this specific named tool
//
// Key exam point: "any" is how you guarantee a tool call on prompts that would
// otherwise get a conversational text response.
async function demonstrateToolChoice(): Promise<void> {
  const prompt = "What's in the README file?";
  console.log(`\nSame prompt for all three modes: "${prompt}"\n`);

  // ── Mode 1: auto ─────────────────────────────────────────────────────────
  // Claude decides. A question like this has an obvious tool (read_document),
  // so it will likely call it — but it's allowed to answer in text if it wants.
  console.log("── Mode: auto (Claude decides)");
  const autoResp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    tools,
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: prompt }],
  });
  console.log(`stop_reason : ${autoResp.stop_reason}`);
  for (const b of autoResp.content) {
    if (b.type === "tool_use") console.log(`tool chosen : ${b.name}  input: ${JSON.stringify(b.input)}`);
    if (b.type === "text")     console.log(`text reply  : ${b.text.slice(0, 120)}`);
  }

  // ── Mode 2: any ──────────────────────────────────────────────────────────
  // Claude MUST call a tool — no plain-text response allowed.
  // Use this when you need a structured action regardless of how Claude
  // would naturally respond (e.g. always log a tool result, never free-text).
  console.log("\n── Mode: any (must call a tool — Claude's choice which one)");
  const anyResp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    tools,
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: prompt }],
  });
  console.log(`stop_reason : ${anyResp.stop_reason}`);
  for (const b of anyResp.content) {
    if (b.type === "tool_use") console.log(`tool chosen : ${b.name}  input: ${JSON.stringify(b.input)}`);
    if (b.type === "text")     console.log(`text reply  : ${b.text.slice(0, 120)}`);
  }

  // ── Mode 3: tool (specific) ───────────────────────────────────────────────
  // Claude MUST call exactly search_codebase — regardless of whether it's
  // the best fit. Use when your pipeline requires a specific tool to always run
  // (e.g. always index before responding, always log via a specific tool).
  console.log("\n── Mode: tool → search_codebase (must call this specific tool)");
  const toolResp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    tools,
    tool_choice: { type: "tool", name: "search_codebase" },
    messages: [{ role: "user", content: prompt }],
  });
  console.log(`stop_reason : ${toolResp.stop_reason}`);
  for (const b of toolResp.content) {
    if (b.type === "tool_use") console.log(`tool chosen : ${b.name}  input: ${JSON.stringify(b.input)}`);
    if (b.type === "text")     console.log(`text reply  : ${b.text.slice(0, 120)}`);
  }
}

async function main() {
  console.log("═".repeat(60));
  console.log("Part 1 — Tool selection based on descriptions");
  console.log("═".repeat(60));

  // Should pick search_codebase — looking for text content
  await observeToolSelection("Find all places in the codebase that call the processRefund function.");

  // Should pick find_files — looking for file names by type
  await observeToolSelection("List all test files in the project.");

  // Should pick read_document — wants contents of a specific file
  await observeToolSelection("Show me what's inside src/api/orders.ts.");

  // Should pick execute_command — wants to run tests
  await observeToolSelection("Run the test suite and show me the results.");

  // ── Part 2 ────────────────────────────────────────────────────────────────
  console.log("\n\n" + "═".repeat(60));
  console.log("Part 2 — Structured error responses (TS 2.2)");
  console.log("═".repeat(60));
  console.log("Each scenario: prompt → Claude picks tool → executor returns");
  console.log("structured error → Claude sees it and suggests recovery.\n");
  console.log("Error shape: { isError, errorCategory, isRetryable, message, attempted }");

  await demonstrateErrorScenario(
    "TRANSIENT — filesystem timeout  (isRetryable: true)",
    "Search the codebase for all places that call processRefund()."
  );

  await demonstrateErrorScenario(
    "VALIDATION — dangerous command blocked  (isRetryable: false)",
    "Run the shell command rm -rf . to wipe the entire build output."
  );

  await demonstrateErrorScenario(
    "PERMISSION — path outside project root  (isRetryable: false)",
    "Read the full contents of /etc/passwd."
  );

  await demonstrateErrorScenario(
    "BUSINESS — file too large for context  (isRetryable: false)",
    "Show me everything inside dist/app.bundle.min.js."
  );

  // ── Part 3 ────────────────────────────────────────────────────────────────
  console.log("\n\n" + "═".repeat(60));
  console.log("Part 3 — tool_choice modes (TS 2.3)");
  console.log("═".repeat(60));
  console.log("auto: Claude decides  |  any: must call a tool  |  tool: must call specific tool");
  await demonstrateToolChoice();
}

main().catch(console.error);
