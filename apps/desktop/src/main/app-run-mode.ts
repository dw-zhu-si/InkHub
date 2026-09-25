export type DeepWriteAppMode = "runtime" | "evaluation";

/**
 * Evaluation capture is strictly opt-in. Missing, misspelled, or unsupported
 * values all retain the normal runtime behavior.
 */
export function resolveDeepWriteAppMode(value: string | undefined): DeepWriteAppMode {
  return value?.trim().toLowerCase() === "evaluation"
    ? "evaluation"
    : "runtime";
}
