export const INKHUB_MODELHUB_ORIGIN = "http://127.0.0.1:11435";
export const INKHUB_MODELHUB_BASE_URL = `${INKHUB_MODELHUB_ORIGIN}/v1`;

function parseEndpoint(rawBaseUrl: string, label: string): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(rawBaseUrl.trim());
  } catch {
    throw new Error(`${label}地址格式无效。`);
  }
  if (endpoint.username || endpoint.password) {
    throw new Error("不要把密钥写入 API 地址，请使用独立的 API Key 字段。");
  }
  return endpoint;
}

export function assertLocalModelHubEndpoint(
  provider: string,
  rawBaseUrl: string
): URL {
  if (provider.trim().toLowerCase() !== "modelhub") {
    throw new Error("墨枢只允许通过本机 ModelHub 调用模型。");
  }
  const endpoint = parseEndpoint(rawBaseUrl, "ModelHub ");
  const hostname = endpoint.hostname.toLowerCase();
  const localHost = hostname === "127.0.0.1" || hostname === "localhost";
  if (
    endpoint.protocol !== "http:" ||
    !localHost ||
    endpoint.port !== "11435" ||
    endpoint.username ||
    endpoint.password
  ) {
    throw new Error("墨枢只允许连接本机 ModelHub（127.0.0.1:11435）。");
  }
  return endpoint;
}

/**
 * Public desktop endpoint policy: cloud providers must use HTTPS, while local
 * runtimes may use loopback HTTP. ModelHub retains its fixed local gateway.
 */
export function assertSupportedModelEndpoint(
  provider: string,
  rawBaseUrl: string
): URL {
  if (provider.trim().toLowerCase() === "modelhub") {
    return assertLocalModelHubEndpoint(provider, rawBaseUrl);
  }
  const endpoint = parseEndpoint(rawBaseUrl, "API ");
  const hostname = endpoint.hostname.toLowerCase();
  const loopback =
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1";
  if (endpoint.protocol === "https:") {
    return endpoint;
  }
  if (endpoint.protocol === "http:" && loopback) {
    return endpoint;
  }
  throw new Error("云端模型 API 必须使用 HTTPS；HTTP 仅允许连接本机回环地址。");
}

export function isSupportedModelEndpoint(provider: string, baseUrl: string): boolean {
  try {
    assertSupportedModelEndpoint(provider, baseUrl);
    return true;
  } catch {
    return false;
  }
}

export function isLocalModelHubEndpoint(provider: string, baseUrl: string): boolean {
  try {
    assertLocalModelHubEndpoint(provider, baseUrl);
    return true;
  } catch {
    return false;
  }
}
