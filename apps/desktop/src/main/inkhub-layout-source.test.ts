import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesSource = readFileSync(
  new URL("../renderer/src/styles.css", import.meta.url),
  "utf8"
);

describe("InkHub host layout source", () => {
  it("spans both writing columns and keeps the collapsed-sidebar affordance visible", () => {
    expect(stylesSource).toMatch(
      /\.marketplace-main-view,\s*\.inkhub-library-main-view\s*\{[^}]*grid-column:\s*2\s*\/\s*4;/su
    );
    expect(stylesSource).toMatch(
      /\.marketplace-expand-sidebar,\s*\.inkhub-library-expand-sidebar\s*\{/su
    );
  });
});
