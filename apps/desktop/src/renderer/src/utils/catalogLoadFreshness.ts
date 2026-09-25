export function catalogLoadRequestIsCurrent<Snapshot, Projection>(options: {
  currentSnapshot: Snapshot | null | undefined;
  currentProjection: Projection | null | undefined;
  requestedSnapshot: Snapshot;
  requestedProjection: Projection;
}): boolean {
  return (
    options.currentSnapshot === options.requestedSnapshot &&
    options.currentProjection === options.requestedProjection
  );
}
