export interface GitHubEvent<TPayload = unknown> {
  type: string;
  payload: TPayload;
  prNumber?: number;
  repo?: string;
  owner?: string;
}

export interface Subscriber {
  name: string;
  eventTypes: readonly string[];
  // ℹ️ Any errors thrown by the handler must be caught by the subscriber invoker.
  handler: (event: GitHubEvent) => Promise<void>;
}
