import type { AgentTool } from "@earendil-works/pi-agent-core";
import type {
  AgentWriteApprovalMode,
  CommandResult,
  LongAgentProfile,
  LongChapterBodyChange,
  LongChapterReadiness,
  LongCharacterFileChange,
  LongCommitChapterInput,
  LongContinuityFileChange,
  LongWorkspaceCommandEnvelope,
  LongWorkspaceOperationBatch,
  LongWorkspaceRuntimeContext,
  LongWorldbuildingFileChange,
  LongWritingScope,
  WorkspaceRuntimeContext
} from "@deepwrite/contracts";
import { createLongToolContext } from "./context";
import {
  buildCatalogTools,
  buildLoadSkillTool,
  buildQueryLinkedMaterialEntriesTool
} from "./catalog-tools";
import { buildSettingTools } from "./setting-tools";
import { buildPlotDesignTools } from "./plot-design-tools";
import { buildChapterReadinessTools, buildChapterTools } from "./chapter-tools";
import { buildContinuityTools } from "./continuity-tools";

export type LongQueryCommandEnvelope = Extract<
  LongWorkspaceCommandEnvelope,
  {
    type:
      | "long.getWorkspaceIndex"
      | "long.readDocument"
      | "long.search";
  }
>;

export type LongCommandExecutor = (
  command: LongQueryCommandEnvelope,
  signal?: AbortSignal
) => Promise<CommandResult>;

export type LongAgentToolDetails =
  | { kind: "none" }
  | {
      kind: "long-mutation-proposal";
      bookId: string;
      agentId: LongAgentProfile["id"];
      batch: LongWorkspaceOperationBatch;
      baseProjectRevision: number;
      summary: string;
    }
  | {
      kind: "long-worldbuilding-file-proposal";
      bookId: string;
      agentId: LongAgentProfile["id"];
      batch: LongWorkspaceOperationBatch;
      baseProjectRevision: number;
      summary: string;
      files: LongWorldbuildingFileChange[];
    }
  | {
      kind: "long-character-file-proposal";
      bookId: string;
      agentId: LongAgentProfile["id"];
      batch: LongWorkspaceOperationBatch;
      baseProjectRevision: number;
      summary: string;
      files: LongCharacterFileChange[];
    }
  | {
      kind: "long-continuity-file-proposal";
      bookId: string;
      agentId: LongAgentProfile["id"];
      batch: LongWorkspaceOperationBatch;
      baseProjectRevision: number;
      summary: string;
      files: LongContinuityFileChange[];
    }
  | {
      kind: "long-chapter-write-proposal";
      bookId: string;
      agentId: LongAgentProfile["id"];
      batch: LongWorkspaceOperationBatch;
      baseProjectRevision: number;
      file: LongChapterBodyChange;
      summary: string;
    }
  | {
      kind: "long-ledger-commit-proposal";
      bookId: string;
      agentId: LongAgentProfile["id"];
      input: LongCommitChapterInput;
      summary: string;
    }
  | {
      kind: "long-chapter-dispatch-proposal";
      bookId: string;
      agentId: LongAgentProfile["id"];
      scope: LongWritingScope;
      chapterCardId: string;
      title: string;
      chapters: LongChapterReadiness[];
      workspaceRevision: number;
      projectRevision: number;
      summary: string;
    };

export interface BuildLongWorkspaceToolsInput {
  workspace: LongWorkspaceRuntimeContext;
  profile: LongAgentProfile;
  sessionId: string;
  runId: string;
  writeApprovalMode?: AgentWriteApprovalMode;
  attachedSkills?: WorkspaceRuntimeContext["attachedSkills"];
  attachedMaterials?: WorkspaceRuntimeContext["attachedMaterials"];
  executor?: LongCommandExecutor;
}

export function buildLongWorkspaceTools(
  input: BuildLongWorkspaceToolsInput
): AgentTool[] {
  const ctx = createLongToolContext(input);
  const tools: AgentTool[] = [
    buildQueryLinkedMaterialEntriesTool(input),
    buildLoadSkillTool(input)
  ];
  tools.push(...buildCatalogTools(ctx));
  tools.push(...buildChapterReadinessTools(ctx));
  tools.push(...buildSettingTools(ctx));
  tools.push(...buildPlotDesignTools(ctx));
  tools.push(...buildChapterTools(ctx));
  tools.push(...buildContinuityTools(ctx));
  return tools;
}

export {
  classifyLongChapterReadiness,
  isLongAgentToolDetails,
  selectLongChaptersForWritingScope,
  selectNextLongChapterForDispatch
} from "./dispatch";
export type { SelectLongWritingScopeInput } from "./dispatch";
export type {
  LongReadDocumentResult,
  LongSearchResult
} from "@deepwrite/contracts";
