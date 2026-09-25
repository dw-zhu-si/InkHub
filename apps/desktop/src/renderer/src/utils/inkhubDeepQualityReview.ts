export const INKHUB_REPAIR_REVIEW_DEFAULT_PAGE_SIZE = 8;
export const INKHUB_REPAIR_REVIEW_MAX_PAGE_SIZE = 20;

export interface InkHubBoundedRepairReviewPage<T> {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  items: T[];
}

function boundedInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

export function createBoundedRepairReviewPage<T>(
  items: readonly T[],
  requestedPage: number,
  requestedPageSize = INKHUB_REPAIR_REVIEW_DEFAULT_PAGE_SIZE
): InkHubBoundedRepairReviewPage<T> {
  const pageSize = boundedInteger(
    requestedPageSize,
    1,
    INKHUB_REPAIR_REVIEW_MAX_PAGE_SIZE
  );
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = boundedInteger(requestedPage, 1, totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(items.length, startIndex + pageSize);
  return {
    page,
    pageSize,
    totalPages,
    totalItems: items.length,
    startIndex,
    endIndex,
    items: items.slice(startIndex, endIndex)
  };
}

export function repairReviewPageAfterKey(
  currentPage: number,
  totalPages: number,
  key: string
): number {
  const safeTotal = Math.max(1, Math.trunc(totalPages));
  const safeCurrent = boundedInteger(currentPage, 1, safeTotal);
  if (key === "ArrowLeft" || key === "PageUp") return Math.max(1, safeCurrent - 1);
  if (key === "ArrowRight" || key === "PageDown") return Math.min(safeTotal, safeCurrent + 1);
  if (key === "Home") return 1;
  if (key === "End") return safeTotal;
  return safeCurrent;
}
