const VALID_TEAM_ID = /^[A-Z0-9]{10}$/u;

export function normalizeOptionalTeamId(value) {
  const teamId = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (teamId && !VALID_TEAM_ID.test(teamId)) {
    throw new Error("INKHUB_APPLE_TEAM_ID 必须是 10 位 Apple Team ID。");
  }
  return teamId;
}

export function selectAppleSigningIdentity(report, certificateType, expectedTeamId = "") {
  const requestedTeam = normalizeOptionalTeamId(expectedTeamId);
  const escapedType = certificateType.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`"(${escapedType}: (.+ \\(([A-Z0-9]{10})\\)))"`, "u");
  const candidates = report.split(/\r?\n/u).flatMap((line) => {
    if (/CSSMERR|REVOKED|EXPIRED/u.test(line)) return [];
    const match = line.match(pattern);
    if (!match || (requestedTeam && match[3] !== requestedTeam)) return [];
    return [{ identity: match[1], qualifier: match[2], teamId: match[3] }];
  });
  const unique = [...new Map(candidates.map((candidate) => [candidate.identity, candidate])).values()];
  if (unique.length !== 1) {
    const scope = requestedTeam ? ` Team ID ${requestedTeam}` : "";
    throw new Error(`必须恰好找到一个可用的 ${certificateType}${scope} 签名身份。`);
  }
  return unique[0];
}
