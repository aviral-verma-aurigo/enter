export type StopReason = "done" | "max_turns" | "idle_stall" | "timeout" | "aborted" | "error";

export interface StopBundle {
  reason: StopReason;
  turns: number;
  details?: unknown;
}
