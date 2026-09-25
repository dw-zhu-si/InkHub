import type {
  ResourceTreeNode,
  ResourceTreeSection
} from "../types/workspace";

export interface ResourceTreeLookup {
  nodeById: ReadonlyMap<string, ResourceTreeNode>;
  resourceIdByDocumentId: ReadonlyMap<string, string>;
  targetDocumentIdByResourceId: ReadonlyMap<string, string>;
}

/** Builds lookup tables for the final visible tree, including virtual nodes. */
export function createResourceTreeLookup(
  sections: readonly ResourceTreeSection[]
): ResourceTreeLookup {
  const nodeById = new Map<string, ResourceTreeNode>();
  const resourceIdByDocumentId = new Map<string, string>();
  const targetDocumentIdByResourceId = new Map<string, string>();
  const stack = sections.flatMap((section) => section.nodes).reverse();

  while (stack.length) {
    const node = stack.pop()!;
    if (!nodeById.has(node.id)) nodeById.set(node.id, node);
    if (!resourceIdByDocumentId.has(node.id)) {
      resourceIdByDocumentId.set(node.id, node.id);
    }
    for (const documentId of [
      node.targetDocumentId,
      node.characterStateDocumentId
    ]) {
      if (documentId && !resourceIdByDocumentId.has(documentId)) {
        resourceIdByDocumentId.set(documentId, node.id);
      }
    }
    const targetDocumentId =
      node.targetDocumentId ??
      (node.shortAgentId === "expert_draft_coordinator"
        ? node.children?.find((child) => child.targetDocumentId)
            ?.targetDocumentId
        : undefined) ??
      node.id;
    targetDocumentIdByResourceId.set(node.id, targetDocumentId);

    const children = node.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!);
    }
  }

  return {
    nodeById,
    resourceIdByDocumentId,
    targetDocumentIdByResourceId
  };
}
