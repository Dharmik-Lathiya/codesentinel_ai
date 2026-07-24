export type GitHubEventType = 'push' | 'pull_request' | 'issues' | 'pull_request_review' | 'create' | 'delete' | 'fork' | 'star' | 'watch' | 'issue_comment' | 'release' | 'member';

export interface Event {
  type: GitHubEventType;
  payload: any;
}

export interface Subscriber {
  eventTypes: GitHubEventType[];
  callback: (event: Event) => void;
}