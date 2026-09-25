export interface MainWindowStartupGate {
  requestShow(): void;
  markReady(): void;
}

export function createMainWindowStartupGate(
  showMainWindow: () => void
): MainWindowStartupGate {
  let ready = false;
  let showRequested = false;

  return {
    requestShow(): void {
      if (!ready) {
        showRequested = true;
        return;
      }
      showMainWindow();
    },

    markReady(): void {
      if (ready) return;
      ready = true;
      if (!showRequested) return;
      showRequested = false;
      showMainWindow();
    }
  };
}
