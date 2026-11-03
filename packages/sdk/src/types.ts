export interface MiniCozeClientOptions {
  /** Base URL of the MiniCoze public API. Must use HTTP or HTTPS. */
  baseURL: string;
  /** API key used to authenticate public API requests. */
  apiKey: string;
  /** Request timeout in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number;
}
