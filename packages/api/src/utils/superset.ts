import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const DEFAULT_MCP_URL = "https://api.superset.sh/api/agent/mcp";

type ToolResponse = {
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
};

type SupersetConfig = {
  apiKey: string;
  mcpUrl: string;
  agent: string;
  workspaceId: string | null;
  deviceId: string | null;
  projectId: string | null;
  sourceWorkspaceId: string | null;
  createWorkspaceTool: string;
  startAgentTool: string;
};

type LaunchAgentInput = {
  cardPublicId: string;
  cardTitle: string;
  boardName: string;
  listName: string;
  branch: string;
  workspaceName: string;
  prompt: string;
};

export type LaunchAgentResult = {
  agent: string;
  workspaceId: string | null;
  sessionId: string | null;
  url: string | null;
  response: unknown;
};

const requireEnv = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

const optionalEnv = (key: string) => process.env[key]?.trim() || null;

const getConfig = (): SupersetConfig => ({
  apiKey: requireEnv("SUPERSET_API_KEY"),
  mcpUrl: process.env.SUPERSET_MCP_URL?.trim() || DEFAULT_MCP_URL,
  agent: process.env.SUPERSET_AGENT?.trim() || "codex",
  workspaceId: optionalEnv("SUPERSET_WORKSPACE_ID"),
  deviceId: optionalEnv("SUPERSET_DEVICE_ID"),
  projectId: optionalEnv("SUPERSET_PROJECT_ID"),
  sourceWorkspaceId: optionalEnv("SUPERSET_SOURCE_WORKSPACE_ID"),
  createWorkspaceTool:
    process.env.SUPERSET_CREATE_WORKSPACE_TOOL?.trim() || "create_workspace",
  startAgentTool:
    process.env.SUPERSET_START_AGENT_TOOL?.trim() ||
    "start_agent_session_with_prompt",
});

const createClient = async (config: SupersetConfig) => {
  const client = new Client({
    name: "kan-superset-integration",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(config.mcpUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    },
  });

  await client.connect(transport);

  return { client, transport };
};

const getStructuredContent = (response: unknown) => {
  const toolResponse = response as ToolResponse;

  if (toolResponse.structuredContent) return toolResponse.structuredContent;

  const text = toolResponse.content?.find((item) => item.type === "text")?.text;
  if (!text) return response;

  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
};

const getString = (value: unknown, keys: string[]): string | null => {
  for (const key of keys) {
    let current = value;

    for (const segment of key.split(".")) {
      if (Array.isArray(current)) {
        current = current[Number(segment)];
        continue;
      }

      if (current && typeof current === "object") {
        current = (current as Record<string, unknown>)[segment];
        continue;
      }

      current = null;
      break;
    }

    if (typeof current === "string" && current.length > 0) return current;
  }

  return null;
};

const buildCreateWorkspaceArgs = (
  config: SupersetConfig,
  input: LaunchAgentInput,
) => {
  if (!config.deviceId) throw new Error("SUPERSET_DEVICE_ID is not configured");
  if (!config.projectId) throw new Error("SUPERSET_PROJECT_ID is not configured");

  return {
    deviceId: config.deviceId,
    projectId: config.projectId,
    workspaces: [
      {
        name: input.workspaceName,
        branchName: input.branch,
        ...(config.sourceWorkspaceId
          ? { sourceWorkspaceId: config.sourceWorkspaceId }
          : {}),
      },
    ],
  };
};

const buildStartAgentArgs = (
  config: SupersetConfig,
  workspaceId: string,
  input: LaunchAgentInput,
) => ({
  deviceId: config.deviceId,
  workspaceId,
  agent: config.agent,
  prompt: input.prompt,
});

export const buildSupersetPrompt = (args: {
  title: string;
  description: string | null;
  labels: string[];
  priority: string | null;
  boardName: string;
  listName: string;
  ticketNumber: string | null;
  cardUrl: string | null;
}) => {
  return [
    "Please work on this Kan task in a fresh branch/workspace.",
    "",
    `Title: ${args.title}`,
    args.ticketNumber ? `Ticket: ${args.ticketNumber}` : null,
    `Board: ${args.boardName}`,
    `List: ${args.listName}`,
    args.priority ? `Priority: ${args.priority}` : null,
    args.labels.length ? `Labels: ${args.labels.join(", ")}` : null,
    args.cardUrl ? `Card URL: ${args.cardUrl}` : null,
    "",
    "Description:",
    args.description?.trim() || "(No description)",
    "",
    "Expected output:",
    "- Make the requested code changes.",
    "- Keep the implementation scoped to this task.",
    "- Run the relevant checks if available.",
    "- Commit the work or leave a clear summary of changed files and verification.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
};

export const toSupersetBranchName = (cardPublicId: string, title: string) => {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "kan-task";

  return `kan/${cardPublicId}-${slug}`;
};

export const launchSupersetAgent = async (
  input: LaunchAgentInput,
): Promise<LaunchAgentResult> => {
  const config = getConfig();
  const { client, transport } = await createClient(config);

  try {
    if (!config.deviceId) throw new Error("SUPERSET_DEVICE_ID is not configured");

    let workspaceId = config.workspaceId;
    let createWorkspaceResponse: unknown = null;

    if (!workspaceId) {
      const createWorkspaceResult = await client.callTool({
        name: config.createWorkspaceTool,
        arguments: buildCreateWorkspaceArgs(config, input),
      });
      createWorkspaceResponse = getStructuredContent(createWorkspaceResult);
      workspaceId = getString(createWorkspaceResponse, [
        "workspaceId",
        "id",
        "workspace.id",
        "workspaces.0.id",
      ]);

      if (!workspaceId) {
        throw new Error("Superset did not return a workspace id");
      }
    }

    const startAgentResult = await client.callTool({
      name: config.startAgentTool,
      arguments: buildStartAgentArgs(config, workspaceId, input),
    });
    const startAgentResponse = getStructuredContent(startAgentResult);

    return {
      agent: config.agent,
      workspaceId,
      sessionId: getString(startAgentResponse, [
        "sessionId",
        "agentSessionId",
        "id",
        "session.id",
      ]),
      url:
        getString(startAgentResponse, ["url", "session.url", "workspace.url"]) ??
        getString(createWorkspaceResponse, ["url", "workspace.url"]),
      response: {
        workspace: createWorkspaceResponse,
        session: startAgentResponse,
      },
    };
  } finally {
    await transport.close().catch(() => undefined);
  }
};
