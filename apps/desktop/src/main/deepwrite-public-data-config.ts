const UNCONFIGURED_PUBLIC_DATA_ORIGIN = "https://deepwrite-public-data.invalid";

function runtimeValue(name: string): string {
  const runtimeValue = process.env[name];
  return typeof runtimeValue === "string" ? runtimeValue.trim() : "";
}

function normalizeBaseUrl(rawValue: string): string {
  if (!rawValue) return UNCONFIGURED_PUBLIC_DATA_ORIGIN;

  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    return UNCONFIGURED_PUBLIC_DATA_ORIGIN;
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    return UNCONFIGURED_PUBLIC_DATA_ORIGIN;
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/u, "")}`;
}

export const DEEPWRITE_PUBLIC_DATA_API_BASE_URL = normalizeBaseUrl(
  runtimeValue("INKHUB_PUBLIC_DATA_API_BASE_URL")
);

export const DEEPWRITE_PUBLIC_DATA_API_CONFIGURED =
  DEEPWRITE_PUBLIC_DATA_API_BASE_URL !== UNCONFIGURED_PUBLIC_DATA_ORIGIN;

export function deepWritePublicDataUrl(fileName: "MODEL.json" | "MODELDEEPWRITE.json" | "ALERT.json"): string {
  return `${DEEPWRITE_PUBLIC_DATA_API_BASE_URL}/deepwrite/v1/${fileName}`;
}

export function deepWriteSoftwareTokenUsageUrl(): string {
  return `${DEEPWRITE_PUBLIC_DATA_API_BASE_URL}/deepwrite/v1/software-token-usage`;
}

export function deepWritePublicDataHeaders(additional?: HeadersInit): Headers {
  return new Headers(additional);
}
