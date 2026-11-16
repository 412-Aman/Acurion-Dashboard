// The version-checked save of the team case workspace (caseWorkspaces/{team}/payload), as a transaction update.
// Firebase may call it first with null even when the server holds a payload (nothing is cached yet). Proposing
// the write then is safe: the server answers with the real value and the update runs again, and only then does
// a newer version mean a teammate saved first (the update returns undefined and the save is refused).
export function payloadUpdate(version, sealed, uid, now = () => new Date().toISOString()) {
  return remote => {
    if (remote !== null && (remote?.version || 0) !== version) return undefined;
    return { ...sealed, version: version + 1, updatedAt: now(), updatedBy: uid };
  };
}
