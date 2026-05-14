export interface DonePayload {
  summary: string;
  artifacts?: string[];
}

/**
 * Shared mutable flag the autonomous loop watches.
 * The `done` tool fires it from inside the agent run.
 */
export class DoneSignal {
  private _fired = false;
  private _payload: DonePayload | null = null;

  get fired(): boolean {
    return this._fired;
  }
  get payload(): DonePayload | null {
    return this._payload;
  }

  fire(payload: DonePayload): void {
    this._fired = true;
    this._payload = payload;
  }

  reset(): void {
    this._fired = false;
    this._payload = null;
  }
}
