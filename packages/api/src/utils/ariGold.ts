import { createHmac } from "node:crypto";

type CodingAgent = "opencode" | "pi";

type LaunchAriGoldInput = {
  eventId: string;
  title: string;
  repo: string;
  prompt: string;
  callbackUrl?: string;
  supportContext?: Record<string, unknown>;
  gsdTicket?: {
    create?: boolean;
    title?: string;
    summary?: string;
    priority?: "urgent" | "high" | "medium" | "low";
    parameters?: Record<string, unknown>;
  };
};

export type LaunchAriGoldResult = {
  agent: "ari-gold";
  sessionId: string | null;
  url: string | null;
  response: unknown;
};

const DEFAULT_WEBHOOK_URL =
  "https://agent-webhook-ari-gold.retrogradeai.workers.dev/webhooks/external-agent";
const DEFAULT_REPO = "getretrograde/agency-inbox-mgmt-backend";
const DEFAULT_MODEL = "openai/gpt-5.5";
const DEFAULT_REASONING_EFFORT = "xhigh";
const DEFAULT_CODING_AGENT: CodingAgent = "pi";

const requireEnv = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

const optionalEnv = (key: string) => process.env[key]?.trim() || undefined;

function signPayload(body: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return { timestamp, signature: `sha256=${signature}` };
}

function getCodingAgent(): CodingAgent {
  const value = optionalEnv("ARI_GOLD_DEFAULT_CODING_AGENT");
  return value === "opencode" || value === "pi" ? value : DEFAULT_CODING_AGENT;
}

export function getAriGoldRepo(fallback?: string | null) {
  return fallback ?? optionalEnv("ARI_GOLD_DEFAULT_REPO") ?? DEFAULT_REPO;
}

export function buildAriGoldSupportPrompt(input: {
  title: string;
  description: string | null;
  boardName: string;
  listName: string;
  ticketNumber: string | null;
  cardUrl: string | null;
}) {
  const cardReference = input.ticketNumber ?? input.cardUrl ?? input.title;

  return `Work this GSD support ticket through to human review.

Ticket: ${cardReference}
Title: ${input.title}
Board: ${input.boardName}
Current list: ${input.listName}
Card URL: ${input.cardUrl ?? "not available"}

Ticket description:
${input.description ?? "No description supplied."}

Outcome required:
- Diagnose the issue using the hard parameters in the ticket.
- If this is a product/code bug, make the smallest safe code change and leave evidence of the checks you ran.
- If this needs a production data/state fix, do not mutate production directly unless the task explicitly authorizes it; produce the exact reviewed action/runbook and evidence instead.
- If there is no bug or no code change is needed, explain the genuine reason clearly and cite the evidence you used.
- If a code change is made, commit it and open a pull request when the environment supports it.
- Finish with a concise review summary: root cause, user impact, fix or recommended action, verification, and anything a human needs to review.

At the very end, include exactly one machine-readable ticket update block:

<gsd_ticket_update>
{"status":"ready_for_review","summary":"short operator summary","rootCause":"what happened","userImpact":"customer/user impact","fix":"what changed or recommended action","verification":"checks/evidence","reviewNotes":"what a human should review","prUrl":"https://github.com/org/repo/pull/123"}
</gsd_ticket_update>

Use "status":"ready_for_review" when there is a PR, code diff, migration, SQL/runbook, or other human review action. Use "status":"resolved" when no code/data action is needed and the ticket is fully answered by evidence. Use "status":"needs_input" only when an operator-owned clarification is required to continue. Use "status":"failed" only if the run could not complete.

This is an internal engineering/support run. Do not send a creator-facing message and do not create another GSD ticket for this card.`;
}

export async function launchAriGoldAgent(
  input: LaunchAriGoldInput,
): Promise<LaunchAriGoldResult> {
  const webhookUrl =
    optionalEnv("ARI_GOLD_EXTERNAL_AGENT_WEBHOOK_URL") ?? DEFAULT_WEBHOOK_URL;
  const secret = requireEnv("ARI_GOLD_EXTERNAL_AGENT_WEBHOOK_SECRET");
  const payload = {
    eventId: input.eventId,
    repo: input.repo,
    prompt: input.prompt,
    title: input.title,
    mode: "coding",
    model: optionalEnv("ARI_GOLD_DEFAULT_MODEL") ?? DEFAULT_MODEL,
    reasoningEffort:
      optionalEnv("ARI_GOLD_DEFAULT_REASONING_EFFORT") ??
      DEFAULT_REASONING_EFFORT,
    codingAgent: getCodingAgent(),
    callbackUrl: input.callbackUrl,
    supportContext: input.supportContext,
    gsdTicket: input.gsdTicket,
  };
  const body = JSON.stringify(payload);
  const { timestamp, signature } = signPayload(body, secret);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ari-Webhook-Event-Id": input.eventId,
      "X-Ari-Webhook-Timestamp": timestamp,
      "X-Ari-Webhook-Signature": signature,
    },
    body,
  });

  const result = (await response.json().catch(() => null)) as {
    ok?: boolean;
    sessionId?: string;
    sessionUrl?: string;
    error?: string;
  } | null;

  if (!response.ok || !result?.ok) {
    throw new Error(
      result?.error ?? `Ari Gold webhook failed with ${response.status}`,
    );
  }

  return {
    agent: "ari-gold",
    sessionId: result.sessionId ?? null,
    url: result.sessionUrl ?? null,
    response: result,
  };
}
