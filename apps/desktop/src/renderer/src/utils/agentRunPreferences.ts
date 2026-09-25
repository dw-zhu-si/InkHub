import {
  resolveScriptWorkspaceAgentIdForStage,
  resolveShortWorkspaceAgentIdForStage,
  type ThinkingLevel
} from "@deepwrite/contracts";
import type { AgentApprovalMode } from "../types/conversation";
import type { WorkspaceDocument } from "../types/workspace";

export const AGENT_RUN_PREFERENCES_STORAGE_KEY =
  "deepwrite:agent-run-preferences:v2";
export const AGENT_MODEL_SELECTION_STORAGE_KEY =
  "deepwrite:agent-model-selection:v1";

export interface AgentModelSelection {
  selectedModelId: string;
  thinkingLevel: ThinkingLevel;
}

export interface AgentRunPreferences {
  temperature: number;
  approvalMode: AgentApprovalMode;
}

export type AgentRunPreferencesByScope = Record<string, AgentRunPreferences>;

export function activeAgentDocumentForSelection(
  selectedDocument: WorkspaceDocument,
  activeCreationDocument: WorkspaceDocument
): WorkspaceDocument {
  return selectedDocument.domain === "creation"
    ? activeCreationDocument
    : selectedDocument;
}

export function agentRunScopeForDocument(document: WorkspaceDocument): string {
  if (
    document.libraryId &&
    (document.domain === "skill" || document.domain === "material")
  ) {
    return `library:${document.domain}:${document.libraryId}`;
  }
  return document.workspaceId ? `book:${document.workspaceId}` : "general";
}

export function agentConversationKeyForDocument(
  document: WorkspaceDocument
): string {
  if (
    document.libraryId &&
    (document.domain === "skill" || document.domain === "material")
  ) {
    return `library:${document.domain}:${document.libraryId}`;
  }
  if (
    (document.workspaceType !== "short" && document.workspaceType !== "script") ||
    !document.workspaceId ||
    !document.stageId
  ) {
    return document.workspaceId ? `${document.workspaceId}:general` : "general";
  }
  const agentId =
    document.shortAgentId ??
    (document.workspaceType === "script"
      ? resolveScriptWorkspaceAgentIdForStage(document.stageId)
      : resolveShortWorkspaceAgentIdForStage(document.stageId));
  return `${document.workspaceId}:${agentId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validThinkingLevel(value: unknown): value is ThinkingLevel {
  return (
    value === "off" ||
    (typeof value === "string" &&
      value.length >= 1 &&
      value.length <= 64 &&
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value))
  );
}

export function parseAgentModelSelection(
  storedValue: string | null
): AgentModelSelection | undefined {
  if (!storedValue) return undefined;
  try {
    const value: unknown = JSON.parse(storedValue);
    if (
      !isRecord(value) ||
      typeof value.selectedModelId !== "string" ||
      value.selectedModelId.length > 120 ||
      !validThinkingLevel(value.thinkingLevel)
    ) {
      return undefined;
    }
    return {
      selectedModelId: value.selectedModelId,
      thinkingLevel: value.thinkingLevel
    };
  } catch {
    return undefined;
  }
}

function parseAgentRunPreference(value: unknown): AgentRunPreferences | undefined {
  if (
    !isRecord(value) ||
    typeof value.temperature !== "number" ||
    !Number.isFinite(value.temperature) ||
    value.temperature < 0 ||
    value.temperature > 2 ||
    (value.approvalMode !== "request-approval" &&
      value.approvalMode !== "auto-approve")
  ) {
    return undefined;
  }

  return {
    temperature: value.temperature,
    approvalMode: value.approvalMode
  };
}

export function parseAgentRunPreferences(
  storedValue: string | null
): AgentRunPreferencesByScope {
  if (!storedValue) return {};

  try {
    const value: unknown = JSON.parse(storedValue);
    if (!isRecord(value)) return {};

    return Object.fromEntries(
      Object.entries(value).flatMap(([scope, preference]) => {
        const maximumScopeLength = scope.startsWith("library:") ? 540 : 517;
        if (!scope.trim() || scope.length > maximumScopeLength) return [];
        const parsed = parseAgentRunPreference(preference);
        return parsed ? [[scope, parsed]] : [];
      })
    );
  } catch {
    return {};
  }
}
