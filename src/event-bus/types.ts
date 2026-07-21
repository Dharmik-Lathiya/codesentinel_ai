export interface GitHubEvent {
  type: string;
  payload: Record<string, unknown>;
  prNumber?: number;
  repo?: string;
  owner?: string;
}

export interface Subscriber {
  name: string;
  eventTypes: string[];
  handler: (event: GitHubEvent) => Promise<void>;
}
