import Anthropic from "@anthropic-ai/sdk";

// ─── Env guard — fail fast with a clear message ────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}

const client = new Anthropic();

// ─── Tool Definitions ──────────────────────────────────────────────────────
const tools: Anthropic.Tool[] = [
  // TODO: define tools for this challenge
];

// ─── Tool Implementations ──────────────────────────────────────────────────
function executeTool(name: string, input: Record<string, string>): string {
  // TODO: implement tool logic
  return `Unknown tool: ${name}`;
}

// ─── Agent Loop ────────────────────────────────────────────────────────────
async function runAgent(userQuestion: string): Promise<void> {
  console.log("\n" + "═".repeat(60));
  console.log(`USER: ${userQuestion}`);
  console.log("═".repeat(60));

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userQuestion },
  ];

  let step = 0;
  const MAX_STEPS = 10;

  while (step < MAX_STEPS) {
    step++;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001", // switch to claude-sonnet-4-6 for demos
      max_tokens: 1024,
      tools,
      messages,
    });

    console.log(`\n[Step ${step}] stop_reason = "${response.stop_reason}"`);

    if (response.stop_reason === "end_turn") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      console.log("\n" + "─".repeat(60));
      console.log(`AGENT: ${text}`);
      console.log("─".repeat(60) + "\n");
      break;
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) {
          console.log(`  REASONING: ${block.text.trim()}`);
        }
        if (block.type === "tool_use") {
          const input = block.input as Record<string, string>;
          console.log(`  TOOL CALL: ${block.name}(${JSON.stringify(input)})`);
          const result = executeTool(block.name, input);
          console.log(`  TOOL RESULT: ${result}`);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }
}

// ─── Entry Point ───────────────────────────────────────────────────────────
const question = process.argv.slice(2).join(" ") || "TODO: set a default question";

runAgent(question).catch((err) => {
  console.error("Agent error:", err.message);
  process.exit(1);
});
