import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const client = new Anthropic();

// ─── Tool definitions ─────────────────────────────────────────────────────────
// Descriptions are the PRIMARY mechanism Claude uses for tool selection.
// Each one includes: purpose, when to use it vs similar tools, what inputs it takes.
const tools: Anthropic.Tool[] = [
  {
    name: "get_customer",
    description:
      "Look up a customer account by email address or customer ID. " +
      "ALWAYS call this first before any other tool — it verifies the customer " +
      "exists and returns the verified customer ID required by lookup_order and " +
      "process_refund. Use this when the customer provides their email or says 'my account'.",
    input_schema: {
      type: "object" as const,
      properties: {
        identifier: {
          type: "string",
          description: "Customer email address or customer ID (e.g. 'user@example.com' or 'CUST-001')",
        },
      },
      required: ["identifier"],
    },
  },
  {
    name: "lookup_order",
    description:
      "Retrieve order details for a specific order ID. Requires a verified customer ID " +
      "from get_customer — do not call this before get_customer has succeeded. " +
      "Use this when the customer asks about order status, shipping, or wants to initiate a return.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string", description: "Verified customer ID from get_customer" },
        order_id:    { type: "string", description: "Order ID to look up (e.g. 'ORD-9921')" },
      },
      required: ["customer_id", "order_id"],
    },
  },
  {
    name: "process_refund",
    description:
      "Issue a refund for an order. Requires a verified customer ID from get_customer. " +
      "Only call after lookup_order has confirmed the order exists and is eligible. ",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        order_id:    { type: "string" },
        amount:      { type: "number", description: "Refund amount in USD" },
        reason:      { type: "string", description: "e.g. 'damaged_item', 'wrong_item', 'not_received'" },
      },
      required: ["customer_id", "order_id", "amount", "reason"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand off to a human support agent. Use when: (1) customer explicitly requests a human, " +
      "(2) refund exceeds policy limits, (3) situation requires a policy exception, " +
      "or (4) you cannot make meaningful progress. Do not use for cases you can resolve autonomously.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id:        { type: "string" },
        customer_name:      { type: "string" },
        order_id:           { type: "string" },
        issue_summary:      { type: "string" },
        refund_amount:      { type: "number" },
        recommended_action: { type: "string" },
        reason: {
          type: "string",
          enum: ["customer_requested", "refund_exceeds_threshold", "policy_exception", "unable_to_resolve"],
        },
      },
      required: ["customer_id", "customer_name", "order_id", "issue_summary", "refund_amount", "recommended_action", "reason"],
    },
  },
];

// ─── Mock tool executors ──────────────────────────────────────────────────────
// Deliberately messy formats — Unix timestamp, numeric status, US date.
// We'll normalize these in Part 5 with the PostToolUse hook.
//
// verifiedCustomerId is passed in and updated here — the gate lives in this
// function so it's enforced in code, not reliant on Claude following instructions.
function executeTool(
  name: string,
  input: Record<string, unknown>,
  verifiedCustomerId: string | null
): { result: string; updatedCustomerId: string | null } {

  // ── Prerequisite gate ──────────────────────────────────────────────────────
  // lookup_order and process_refund require a verified customer ID.
  // If get_customer hasn't run yet, block the call and return a structured error.
  // This is deterministic — prompt instructions alone have a non-zero failure rate.
  if ((name === "lookup_order" || name === "process_refund") && !verifiedCustomerId) {
    console.log(`  🚫 [GATE] '${name}' blocked — get_customer has not run yet`);
    return {
      result: JSON.stringify({
        errorCategory: "validation",
        isRetryable:   false,
        message:       `Cannot call ${name} before verifying the customer. Call get_customer first.`,
      }),
      updatedCustomerId: null,
    };
  }

  switch (name) {
    case "get_customer": {
      const data = {
        customer_id:  "CUST-001",
        name:         "Sarah Chen",
        email:        "sarah.chen@example.com",
        status:       1,               // numeric — will normalize to "active" in Part 5
        created_at:   1704067200,      // Unix timestamp — will normalize to ISO 8601 in Part 5
        tier:         "premium",
      };
      // Capture the verified ID so downstream tools can proceed
      return { result: JSON.stringify(data), updatedCustomerId: data.customer_id };
    }

    case "lookup_order":
      return {
        result: JSON.stringify({
          order_id:        input.order_id,
          product:         "Wireless Headphones Pro",
          amount:          749.99,
          order_date:      "03/15/2024",  // US format — will normalize in Part 5
          status:          1,
          return_eligible: true,
        }),
        updatedCustomerId: verifiedCustomerId,
      };

    case "process_refund":
      return {
        result: JSON.stringify({
          refund_id:       "REF-4421",
          order_id:        input.order_id,
          amount_refunded: input.amount,
          status:          "approved",
          estimated_days:  3,
        }),
        updatedCustomerId: verifiedCustomerId,
      };

    case "escalate_to_human":
      return {
        result: JSON.stringify({ status: "escalated", assigned_to: "human-queue" }),
        updatedCustomerId: verifiedCustomerId,
      };

    default:
      return {
        result: JSON.stringify({ error: `Unknown tool: ${name}` }),
        updatedCustomerId: verifiedCustomerId,
      };
  }
}

// ─── PostToolUse hook — data normalization ────────────────────────────────────
// Runs AFTER a tool executes, BEFORE the result enters conversation history.
// Normalizes heterogeneous formats from different backend systems so Claude
// always sees consistent data — deterministic, unlike prompt instructions.
function postToolUseHook(toolName: string, rawResult: string): string {
  const data = JSON.parse(rawResult) as Record<string, unknown>;
  let changed = false;

  // Unix timestamp → ISO 8601
  if (typeof data.created_at === "number") {
    const before = data.created_at;
    data.created_at = new Date(data.created_at * 1000).toISOString();
    console.log(`  🔧 [hook] created_at: ${before} → "${data.created_at}"`);
    changed = true;
  }

  // Numeric status code → human-readable string
  if (data.status === 1) {
    data.status = "active";
    console.log(`  🔧 [hook] status: 1 → "active"`);
    changed = true;
  } else if (data.status === 0) {
    data.status = "inactive";
    console.log(`  🔧 [hook] status: 0 → "inactive"`);
    changed = true;
  }

  // US date MM/DD/YYYY → ISO 8601 YYYY-MM-DD
  if (typeof data.order_date === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(data.order_date)) {
    const [mm, dd, yyyy] = data.order_date.split("/");
    const before = data.order_date;
    data.order_date = `${yyyy}-${mm}-${dd}`;
    console.log(`  🔧 [hook] order_date: "${before}" → "${data.order_date}"`);
    changed = true;
  }

  if (!changed) console.log(`  🔧 [hook] ${toolName} — nothing to normalize`);

  return JSON.stringify(data);
}

// ─── PreToolCall interception hook ───────────────────────────────────────────
// Runs BEFORE a tool executes. Can rewrite the tool name and input entirely.
// Here: block refunds > $500 and redirect to escalation.
// Deterministic — cannot be bypassed by Claude's reasoning or prompt wording.
function preToolCallHook(
  toolName: string,
  toolInput: Record<string, unknown>
): { toolName: string; toolInput: Record<string, unknown> } {
  if (toolName === "process_refund") {
    const amount = toolInput.amount as number;
    if (amount > 500) {
      console.log(`  ⚡ [hook] process_refund $${amount} exceeds threshold → rewriting to escalate_to_human`);
      return {
        toolName: "escalate_to_human",
        toolInput: {
          customer_id:        toolInput.customer_id,
          customer_name:      "Sarah Chen",
          order_id:           toolInput.order_id,
          issue_summary:      `Customer requesting refund of $${amount} for order ${toolInput.order_id}`,
          refund_amount:      amount,
          recommended_action: `Review and approve/deny refund of $${amount} — exceeds automated threshold`,
          reason:             "refund_exceeds_threshold",
        },
      };
    }
  }

  // All other calls pass through unchanged
  return { toolName, toolInput };
}

// ─── Agentic loop ─────────────────────────────────────────────────────────────
// stop_reason === "tool_use"  → execute tools, append results, continue
// stop_reason === "end_turn"  → Claude is done, exit
// MAX_STEPS                   → safety cap only, not the primary terminator
const MAX_STEPS = 10;

async function runAgent(userMessage: string): Promise<void> {
  console.log("User:", userMessage, "\n");

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let step = 0;
  let verifiedCustomerId: string | null = null;

  while (step < MAX_STEPS) {
    step++;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      tools,
      messages,
    });

    console.log(`[step ${step}] stop_reason: ${response.stop_reason}`);

    // ── Termination: end_turn ─────────────────────────────────────────────
    if (response.stop_reason === "end_turn") {
      const text = response.content.find(b => b.type === "text");
      if (text && text.type === "text") {
        console.log("\nClaude:", text.text);
      }
      break;
    }

    // ── Tool use: execute each tool call, collect results ─────────────────
    if (response.stop_reason === "tool_use") {
      // Append assistant turn (contains the tool_use blocks) to history
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const rawInput = block.input as Record<string, unknown>;
        const { toolName, toolInput } = preToolCallHook(block.name, rawInput);
        console.log(`  → ${toolName}(${JSON.stringify(toolInput)})`);
        const { result, updatedCustomerId } = executeTool(
          toolName,
          toolInput,
          verifiedCustomerId
        );
        verifiedCustomerId = updatedCustomerId ?? verifiedCustomerId;
        console.log(`  ← ${result}`);
        const normalizedResult = postToolUseHook(block.name, result);
        console.log(`  ✓  normalized: ${normalizedResult}\n`);

        toolResults.push({
          type:        "tool_result",
          tool_use_id: block.id,
          content:     normalizedResult,
        });
      }

      // Append all results as a single user turn, then loop
      messages.push({ role: "user", content: toolResults });
    }
  }
}

async function main() {
  console.log("═".repeat(60));
  console.log("Scenario A — normal flow (get_customer runs first)");
  console.log("═".repeat(60));
  await runAgent(
    "Hi, I'm sarah.chen@example.com. My order ORD-9921 arrived damaged. I'd like a refund."
  );

  console.log("\n" + "═".repeat(60));
  console.log("Scenario B — gate test (order ID given, no email)");
  console.log("═".repeat(60));
  await runAgent(
    "My order ORD-9921 arrived damaged. Please process a refund of $50."
  );

  console.log("\n" + "═".repeat(60));
  console.log("Scenario C — small refund (hook passes through)");
  console.log("═".repeat(60));
  await runAgent(
    "Hi, I'm sarah.chen@example.com. Order ORD-9921 had a missing item worth $30. Can I get a partial refund?"
  );
}

main().catch(console.error);
