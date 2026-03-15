import Anthropic from "@anthropic-ai/sdk";

// ─── Env guard — fail fast with a clear message ────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}

const client = new Anthropic();

// ─── Tool Definitions ──────────────────────────────────────────────────────
// These are the "skills" we give to Claude. It decides when and how to use them.

const tools: Anthropic.Tool[] = [
  {
    name: "calculator",
    description:
      "Evaluates a mathematical expression and returns the result. " +
      "Use this for any arithmetic: totals, percentages, comparisons.",
    input_schema: {
      type: "object" as const,
      properties: {
        expression: {
          type: "string",
          description: "A JS-style math expression, e.g. '(30 * 3) + 25'",
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "get_cloud_pricing",
    description:
      "Returns approximate monthly USD cost for a common cloud service. " +
      "Call this before doing any cost math so you have real numbers.",
    input_schema: {
      type: "object" as const,
      properties: {
        service: {
          type: "string",
          description:
            "Service to look up, e.g. 'EC2 t3.medium', 'RDS postgres small', 'S3 100GB'",
        },
      },
      required: ["service"],
    },
  },
];

// ─── Tool Implementations ──────────────────────────────────────────────────
// Real logic that runs when Claude decides to use a tool.

function calculator(expression: string): string {
  try {
    // Function constructor limits scope — safer than raw eval
    const result = new Function(`"use strict"; return (${expression})`)();
    return `${expression} = ${result}`;
  } catch {
    return `Error: could not evaluate "${expression}"`;
  }
}

function getCloudPricing(service: string): string {
  const catalog: Record<string, number> = {
    "ec2 t3.micro": 8.5,
    "ec2 t3.small": 17,
    "ec2 t3.medium": 30,
    "ec2 t3.large": 60,
    "ec2 t3.xlarge": 120,
    "s3 100gb": 2.3,
    "s3 1tb": 23,
    "rds postgres small": 25,
    "rds postgres medium": 50,
    "rds postgres large": 100,
    "lambda 1m requests": 0.2,
    "cloudfront cdn": 8.5,
    "elasticache small": 25,
  };

  const key = service.toLowerCase();
  for (const [name, price] of Object.entries(catalog)) {
    if (key.includes(name) || name.includes(key)) {
      return `${service}: ~$${price}/month`;
    }
  }
  return (
    `No exact match for "${service}". ` +
    `Available: EC2 (t3.micro/small/medium/large/xlarge), ` +
    `S3 (100GB/1TB), RDS Postgres (small/medium/large), ` +
    `Lambda 1M requests, CloudFront CDN, ElastiCache small.`
  );
}

function executeTool(name: string, input: Record<string, string>): string {
  if (name === "calculator") return calculator(input.expression);
  if (name === "get_cloud_pricing") return getCloudPricing(input.service);
  return `Unknown tool: ${name}`;
}

// ─── Agent Loop ────────────────────────────────────────────────────────────
// This is the core of Day 1: the ReAct loop.
// Reason → Act (tool call) → Observe (result) → repeat until done.

async function runAgent(userQuestion: string): Promise<void> {
  console.log("\n" + "═".repeat(60));
  console.log(`USER: ${userQuestion}`);
  console.log("═".repeat(60));

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userQuestion },
  ];

  let step = 0;
  const MAX_STEPS = 10; // safety ceiling

  while (step < MAX_STEPS) {
    step++;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001", // use Haiku for learning — switch to claude-sonnet-4-6 for demos
      max_tokens: 1024,
      tools,
      messages,
    });

    console.log(`\n[Step ${step}] stop_reason = "${response.stop_reason}"`);

    // ── Case 1: Claude is finished ─────────────────────────────────────
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

    // ── Case 2: Claude wants to call tools ────────────────────────────
    if (response.stop_reason === "tool_use") {
      // Add Claude's full response (including its reasoning text) to history
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

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      // Feed all tool results back so Claude can continue reasoning
      messages.push({ role: "user", content: toolResults });
    }
  }
}

// ─── Entry Point ───────────────────────────────────────────────────────────

const question =
  process.argv.slice(2).join(" ") ||
  "I want to run a small web app: 2 EC2 t3.medium instances, " +
    "one RDS Postgres small, and S3 100GB. " +
    "What's my total monthly AWS cost? " +
    "And how much would I save if I downgraded the EC2s to t3.small?";

runAgent(question).catch((err) => {
  console.error("Agent error:", err.message);
  process.exit(1);
});
