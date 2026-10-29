import { describe, expect, it } from "vitest";
import { appendAuthorPreferences, createAuthorPreferencesStorage, formatAuthorPreferences, type AuthorPreference } from "./authorPreferences";

const preference: AuthorPreference = { id: "pref_test", label: "人物声音", content: "多用动作呈现情绪。", enabled: true, scopes: ["long"] };
function memory() {
  let raw: string | null = null;
  let fail = false;
  return { getItem: () => raw, setItem: (_key: string, value: string) => { if (fail) throw new Error("QuotaExceededError"); raw = value; }, replace: (value: string) => { raw = value; }, fail: () => { fail = true; } };
}
describe("author preferences", () => {
  it("only applies enabled preferences for the chosen writing scope", () => {
    for (const scope of ["short", "script"] as const) expect(formatAuthorPreferences([preference], scope)).toBe("");
    expect(formatAuthorPreferences([{ ...preference, enabled: false }], "long")).toBe("");
    expect(formatAuthorPreferences([preference], "long")).toContain(preference.content);
    expect(formatAuthorPreferences([preference], "long")).toContain("系统指令与安全规则优先");
  });
  it("persists changes and deletion and uses the current saved value for the next request", () => {
    const storage = memory();
    const archive = createAuthorPreferencesStorage(storage);
    archive.read();
    archive.write([preference]);
    expect(appendAuthorPreferences("续写本章", "long", storage)).toContain(preference.content);
    archive.write([{ ...preference, content: "保留含蓄对白。" }]);
    expect(appendAuthorPreferences("续写本章", "long", storage)).toContain("保留含蓄对白");
    archive.write([]);
    expect(appendAuthorPreferences("续写本章", "long", storage)).toBe("续写本章");
  });
  it("retains saved values after storage failure and rejects stale writes", () => {
    const storage = memory();
    const archive = createAuthorPreferencesStorage(storage);
    archive.read(); archive.write([preference]);
    const saved = storage.getItem();
    storage.fail();
    expect(() => archive.write([])).toThrow();
    expect(storage.getItem()).toBe(saved);
    storage.replace("[]");
    expect(() => archive.write([preference])).toThrow("其他窗口更新");
  });
  it("does not overwrite bad data or send it as model context", () => {
    const storage = memory(); storage.replace("broken");
    const archive = createAuthorPreferencesStorage(storage);
    expect(() => archive.read()).toThrow();
    expect(() => archive.write([])).toThrow("不能覆盖");
    expect(appendAuthorPreferences("写作", "long", storage)).toBe("写作");
    expect(storage.getItem()).toBe("broken");
  });
  it("bounds configuration and does not apply preferences in general/library conversations", () => {
    const storage = memory(); const archive = createAuthorPreferencesStorage(storage); archive.read();
    expect(() => archive.write([{ ...preference, content: "字".repeat(1001) }])).toThrow();
    archive.write([preference]);
    expect(appendAuthorPreferences("检查技能", undefined, storage)).toBe("检查技能");
  });
});
