export interface MiniCozeSDKErrorOptions extends ErrorOptions {
  httpStatus?: number;
  errorCode?: string;
  traceId?: string;
}

export interface MiniCozeHTTPErrorOptions extends MiniCozeSDKErrorOptions {
  httpStatus: number;
}

export interface MiniCozeTimeoutErrorOptions extends MiniCozeSDKErrorOptions {
  timeoutMs: number;
}

export class MiniCozeSDKError extends Error {
  readonly httpStatus?: number;
  readonly errorCode?: string;
  readonly traceId?: string;

  constructor(message: string, options: MiniCozeSDKErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.httpStatus = options.httpStatus;
    this.errorCode = options.errorCode;
    this.traceId = options.traceId;
  }
}

export class MiniCozeHTTPError extends MiniCozeSDKError {
  constructor(message: string, options: MiniCozeHTTPErrorOptions) {
    super(message, options);
  }
}

export class MiniCozeNetworkError extends MiniCozeSDKError {}

export class MiniCozeResponseParseError extends MiniCozeSDKError {}

export class MiniCozeStreamError extends MiniCozeSDKError {}

export class MiniCozeAbortError extends MiniCozeSDKError {}

export class MiniCozeTimeoutError extends MiniCozeSDKError {
  readonly timeoutMs: number;

  constructor(message: string, options: MiniCozeTimeoutErrorOptions) {
    super(message, options);
    this.timeoutMs = options.timeoutMs;
  }
}
