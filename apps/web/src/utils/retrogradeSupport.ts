export type SupportParameterKey =
  | "eventId"
  | "userId"
  | "emmaUserId"
  | "email"
  | "issueCategory"
  | "dateRange"
  | "reportedAt"
  | "sourceChannel"
  | "ariSessionId"
  | "ariSessionUrl"
  | "repoFullName";

export interface SupportParameter {
  key: SupportParameterKey;
  label: string;
  value: string;
}

export interface SupportContext {
  parameters: SupportParameter[];
  byKey: Partial<Record<SupportParameterKey, string>>;
}

const hardParameterLabels: Record<
  string,
  { key: SupportParameterKey; label: string }
> = {
  "event id": { key: "eventId", label: "Event ID" },
  "user id": { key: "userId", label: "User ID" },
  "emma user id": { key: "emmaUserId", label: "Emma user ID" },
  email: { key: "email", label: "Email" },
  "issue category": { key: "issueCategory", label: "Issue category" },
  "date range": { key: "dateRange", label: "Date range" },
  "reported at": { key: "reportedAt", label: "Reported at" },
  "source channel": { key: "sourceChannel", label: "Source channel" },
  "ari session id": { key: "ariSessionId", label: "Ari session ID" },
  "ari session url": { key: "ariSessionUrl", label: "Ari session URL" },
  repo: { key: "repoFullName", label: "Repo" },
};

function normalizeParameterLabel(label: string) {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeParameterValue(value: string) {
  const trimmed = value.trim();
  return trimmed && trimmed !== "Unknown" ? trimmed : null;
}

export function parseRetrogradeSupportContext(
  description: string | null | undefined,
): SupportContext | null {
  if (!description?.includes("## Hard Parameters")) return null;

  const parameters: SupportParameter[] = [];
  const byKey: Partial<Record<SupportParameterKey, string>> = {};
  let inHardParameterSection = false;

  for (const line of description.split(/\r?\n/)) {
    if (/^##\s+Hard Parameters\s*$/i.test(line.trim())) {
      inHardParameterSection = true;
      continue;
    }

    if (inHardParameterSection && /^##\s+/.test(line.trim())) {
      break;
    }

    if (!inHardParameterSection) continue;

    const match = line.match(/^\s*[-*]\s+([^:]+):\s*(.+?)\s*$/);
    if (!match) continue;

    const rawLabel = match[1];
    const rawValue = match[2];
    if (!rawLabel || !rawValue) continue;

    const labelInfo = hardParameterLabels[normalizeParameterLabel(rawLabel)];
    const value = normalizeParameterValue(rawValue);

    if (!labelInfo || !value) continue;

    parameters.push({
      key: labelInfo.key,
      label: labelInfo.label,
      value,
    });
    byKey[labelInfo.key] = value;
  }

  return parameters.length > 0 ? { parameters, byKey } : null;
}
