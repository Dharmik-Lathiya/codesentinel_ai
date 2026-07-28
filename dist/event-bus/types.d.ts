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
    handler: (event: GitHubEvent) => Promise<void>;
}
