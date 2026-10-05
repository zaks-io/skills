const terminalStates = new Set([
  "returned",
  "stopped",
  "failed",
  "completed",
  "stale",
  "ended",
  "finished",
  "canceled",
  "done",
  "merged",
  "closed",
]);

export const isLiveWorker = (record) =>
  record.returned !== true &&
  record.stopped !== true &&
  !terminalStates.has(
    String(record.state ?? record.status ?? "")
      .trim()
      .toLowerCase(),
  );
