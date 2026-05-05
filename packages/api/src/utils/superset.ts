import type { AgentConfig } from "@superset_sh/sdk";
import Superset from "@superset_sh/sdk";

type SupersetConfig = {
  apiKey: string;
  organizationId: string;
  agent: string;
  hostId: string | null;
  projectId: string | null;
  agentConfig: AgentConfig | null;
};

type LaunchAgentInput = {
  cardPublicId: string;
  cardTitle: string;
  boardName: string;
  listName: string;
  projectId: string;
  branch: string;
  workspaceName: string;
  prompt: string;
};

export type SupersetProject = {
  id: string;
  name: string;
  defaultBranch: string | null;
  mainRepoPath: string | null;
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

const getOptionalObjectString = (value: unknown, key: string) => {
  if (!value || typeof value !== "object") return null;

  const property = (value as Record<string, unknown>)[key];
  return typeof property === "string" && property.trim().length
    ? property.trim()
    : null;
};

const parseAgentConfig = (): AgentConfig | null => {
  const raw = optionalEnv("SUPERSET_AGENT_CONFIG_JSON");
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("SUPERSET_AGENT_CONFIG_JSON must be valid JSON");
  }

  const id = getOptionalObjectString(parsed, "id");
  if (!id) {
    throw new Error("SUPERSET_AGENT_CONFIG_JSON must include an id");
  }

  return {
    kind: "terminal",
    ...(parsed as Record<string, unknown>),
    id,
  } as AgentConfig;
};

const getConfig = (): SupersetConfig => ({
  apiKey: requireEnv("SUPERSET_API_KEY"),
  organizationId: requireEnv("SUPERSET_ORGANIZATION_ID"),
  agent: process.env.SUPERSET_AGENT?.trim() || "codex",
  hostId: optionalEnv("SUPERSET_HOST_ID") ?? optionalEnv("SUPERSET_DEVICE_ID"),
  projectId: optionalEnv("SUPERSET_PROJECT_ID"),
  agentConfig: parseAgentConfig(),
});

const createClient = (config: SupersetConfig) => {
  return new Superset({
    apiKey: config.apiKey,
    organizationId: config.organizationId,
    logLevel: "warn",
    timeout: 120_000,
  });
};

const getTargetHostId = async (client: Superset, config: SupersetConfig) => {
  if (config.hostId) return config.hostId;

  const hosts = await client.hosts.list();
  const host = hosts.find((item) => item.online) ?? hosts[0];

  if (!host) {
    throw new Error("No Superset hosts found for this organization");
  }

  if (!host.online) {
    throw new Error(`Superset host ${host.name} is offline`);
  }

  return host.id;
};

const getAutomationAgentConfig = async (
  client: Superset,
  agent: string,
): Promise<AgentConfig | null> => {
  try {
    const automations = await client.automations.list();
    const automation =
      automations.find((item) => item.agentConfig.id === agent) ??
      automations[0];

    return automation?.agentConfig ?? null;
  } catch {
    return null;
  }
};

export const listSupersetProjects = async (): Promise<SupersetProject[]> => {
  const config = getConfig();
  const client = createClient(config);
  const projects = await client.projects.list();

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    defaultBranch: null,
    mainRepoPath: project.repoCloneUrl,
  }));
};

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
  const client = createClient(config);
  const projectId = input.projectId || config.projectId;

  if (!projectId) throw new Error("Superset project is not configured");

  const hostId = await getTargetHostId(client, config);
  const agentConfig =
    config.agentConfig ??
    (await getAutomationAgentConfig(client, config.agent));

  const workspace = await client.workspaces.create({
    hostId,
    projectId,
    name: input.workspaceName,
    branch: input.branch,
    agents: [
      {
        agent: config.agent,
        prompt: input.prompt,
        ...(agentConfig ? { agentConfig } : {}),
      },
    ],
  });

  const agentRun = workspace.agentRuns[0];

  return {
    agent: config.agent,
    workspaceId: workspace.id,
    sessionId: agentRun?.runId ?? null,
    url: null,
    response: {
      hostId,
      projectId,
      workspace,
      agentRun,
      agentConfigSource: agentConfig
        ? config.agentConfig
          ? "env"
          : "automation"
        : "preset",
    },
  };
};
