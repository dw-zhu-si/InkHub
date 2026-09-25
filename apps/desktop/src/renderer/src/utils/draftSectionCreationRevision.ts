export interface DraftSectionCreationRevisionCursor {
  baseRevision: string;
  currentRevision: string;
}

export function draftSectionCreationRevisionKey(
  runId: string,
  workspaceId: string
): string {
  return `${runId}\u0000${workspaceId}`;
}

export function expectedDraftSectionCreationRevision(
  proposalBaseRevision: string,
  cursor: DraftSectionCreationRevisionCursor | undefined
): string {
  return cursor?.baseRevision === proposalBaseRevision
    ? cursor.currentRevision
    : proposalBaseRevision;
}

export function advanceDraftSectionCreationRevision(
  proposalBaseRevision: string,
  currentRevision: string,
  cursor: DraftSectionCreationRevisionCursor | undefined
): DraftSectionCreationRevisionCursor {
  return {
    baseRevision:
      cursor?.baseRevision === proposalBaseRevision
        ? cursor.baseRevision
        : proposalBaseRevision,
    currentRevision
  };
}

export type DraftSectionCreationCommitPlan =
  | {
      mode: "current";
      baseProjectRevision?: number;
    }
  | {
      mode: "idempotent-recovery";
      baseProjectRevision: number;
    }
  | {
      mode: "conflict";
    };

/**
 * Selects the only safe project revision for a batch-create call.
 *
 * A directory mismatch can mean either an external edit or an earlier call
 * whose response was lost. Replaying the frozen project revision lets Core's
 * operation receipt distinguish those cases without allowing a fresh write on
 * top of an unrelated directory.
 */
export function resolveDraftSectionCreationCommitPlan(input: {
  currentDirectoryRevision: string | undefined;
  expectedDirectoryRevision: string;
  capturedBaseProjectRevision: number | undefined;
  currentProjectRevision: number | undefined;
}): DraftSectionCreationCommitPlan {
  if (input.currentDirectoryRevision === input.expectedDirectoryRevision) {
    return {
      mode: "current",
      ...(input.currentProjectRevision === undefined
        ? {}
        : { baseProjectRevision: input.currentProjectRevision })
    };
  }
  if (input.capturedBaseProjectRevision !== undefined) {
    return {
      mode: "idempotent-recovery",
      baseProjectRevision: input.capturedBaseProjectRevision
    };
  }
  return { mode: "conflict" };
}
