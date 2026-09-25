import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleHorizontalOverflowWheel } from "./horizontalOverflow";

class TestHTMLElement {
  scrollLeft = 0;
  scrollWidth = 500;
  clientWidth = 200;
}

function createScrollableElement(input?: {
  scrollLeft?: number;
  scrollWidth?: number;
  clientWidth?: number;
}): HTMLElement {
  const element = new TestHTMLElement();
  element.scrollLeft = input?.scrollLeft ?? 0;
  element.scrollWidth = input?.scrollWidth ?? 500;
  element.clientWidth = input?.clientWidth ?? 200;
  return element as unknown as HTMLElement;
}

describe("handleHorizontalOverflowWheel", () => {
  beforeEach(() => {
    vi.stubGlobal("HTMLElement", TestHTMLElement);
    vi.stubGlobal("WheelEvent", {
      DOM_DELTA_PIXEL: 0,
      DOM_DELTA_LINE: 1,
      DOM_DELTA_PAGE: 2
    });
  });

  it("turns a vertical mouse-wheel movement into horizontal scrolling", () => {
    const element = createScrollableElement();
    const preventDefault = vi.fn();

    handleHorizontalOverflowWheel({
      currentTarget: element,
      deltaX: 0,
      deltaY: 80,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      preventDefault
    } as unknown as WheelEvent);

    expect(element.scrollLeft).toBe(80);
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("does not capture the wheel after reaching the horizontal edge", () => {
    const element = createScrollableElement({ scrollLeft: 300 });
    const preventDefault = vi.fn();

    handleHorizontalOverflowWheel({
      currentTarget: element,
      deltaX: 0,
      deltaY: 80,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      preventDefault
    } as unknown as WheelEvent);

    expect(element.scrollLeft).toBe(300);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
