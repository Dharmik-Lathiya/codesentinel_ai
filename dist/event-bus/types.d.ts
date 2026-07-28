export interface GitHubEvent<TPayload = unknown> {
    type: string;
    payload: TPayload;
    prNumber?: number;
    repo?: string;
    owner?: string;
}
export type HandlerResult = {
    success: true;
} | {
    success: false;
    error: Error;
};
export interface Subscriber<T = unknown> {
    name: string;
    eventTypes: readonly string[];
    handler: (event: GitHubEvent<T>) => Promise<HandlerResult>;
}
