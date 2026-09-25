import { describe, expect, it } from "vitest";
import {
  assertLocalModelHubEndpoint,
  assertSupportedModelEndpoint,
  isSupportedModelEndpoint,
  isLocalModelHubEndpoint
} from "./modelhub-endpoint";

describe("InkHub ModelHub endpoint policy", () => {
  it("accepts only the local ModelHub gateway", () => {
    expect(assertLocalModelHubEndpoint("modelhub", "http://127.0.0.1:11435/v1").pathname)
      .toBe("/v1");
    expect(isLocalModelHubEndpoint("ModelHub", "http://localhost:11435/v1")).toBe(true);
  });

  it.each([
    ["openai", "http://127.0.0.1:11435/v1"],
    ["modelhub", "https://127.0.0.1:11435/v1"],
    ["modelhub", "http://127.0.0.1:11434/v1"],
    ["modelhub", "http://127.0.0.1.example.test:11435/v1"],
    ["modelhub", "http://user:pass@127.0.0.1:11435/v1"],
    ["modelhub", "https://api.example.test/v1"]
  ])("rejects provider/endpoint pair %s %s", (provider, baseUrl) => {
    expect(() => assertLocalModelHubEndpoint(provider, baseUrl)).toThrow();
  });
});

describe("InkHub multi-provider endpoint policy", () => {
  it("accepts HTTPS cloud providers and loopback HTTP runtimes", () => {
    expect(assertSupportedModelEndpoint("openai", "https://api.openai.com/v1").hostname)
      .toBe("api.openai.com");
    expect(assertSupportedModelEndpoint("ollama", "http://127.0.0.1:11434/v1").port)
      .toBe("11434");
    expect(isSupportedModelEndpoint("custom", "https://models.example.test/v1"))
      .toBe(true);
  });

  it.each([
    ["custom", "http://models.example.test/v1"],
    ["custom", "ftp://models.example.test/v1"],
    ["custom", "https://user:secret@models.example.test/v1"],
    ["modelhub", "https://api.example.test/v1"]
  ])("rejects an unsafe provider endpoint %s %s", (provider, baseUrl) => {
    expect(() => assertSupportedModelEndpoint(provider, baseUrl)).toThrow();
  });
});
