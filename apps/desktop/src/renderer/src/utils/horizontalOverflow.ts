const WHEEL_LINE_PIXELS = 16;

function wheelDeltaInPixels(event: WheelEvent, viewportWidth: number): number {
  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;

  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return delta * WHEEL_LINE_PIXELS;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return delta * viewportWidth;
  }
  return delta;
}

/**
 * Lets a regular vertical mouse wheel navigate a horizontally overflowing row.
 * The event remains available to the page when the row has reached its edge.
 */
export function handleHorizontalOverflowWheel(event: WheelEvent): void {
  const element = event.currentTarget;
  if (!(element instanceof HTMLElement)) return;

  const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
  if (maxScrollLeft === 0) return;

  const delta = wheelDeltaInPixels(event, element.clientWidth);
  if (delta === 0) return;

  const nextScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, element.scrollLeft + delta)
  );
  if (nextScrollLeft === element.scrollLeft) return;

  element.scrollLeft = nextScrollLeft;
  event.preventDefault();
}
