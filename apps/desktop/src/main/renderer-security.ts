import { pathToFileURL } from "node:url";

export function resolveDevelopmentRendererUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl?.trim()) return null;
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "http:" ||
    (hostname !== "127.0.0.1" && hostname !== "localhost") ||
    url.username ||
    url.password
  ) {
    return null;
  }
  return url.toString();
}

export function trustedRendererUrl(input: {
  candidateUrl: string;
  packaged: boolean;
  rendererFilePath: string;
  developmentUrl?: string | undefined;
}): boolean {
  let candidate: URL;
  try {
    candidate = new URL(input.candidateUrl);
  } catch {
    return false;
  }
  if (input.packaged) {
    return candidate.href === pathToFileURL(input.rendererFilePath).href;
  }
  const developmentUrl = resolveDevelopmentRendererUrl(input.developmentUrl);
  if (developmentUrl) {
    return candidate.origin === new URL(developmentUrl).origin;
  }
  return candidate.href === pathToFileURL(input.rendererFilePath).href;
}
