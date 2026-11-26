export type AppErrorContext = Record<string, unknown>;

export interface AppErrorOptions {
  cause?: unknown;
  context?: AppErrorContext;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly context?: AppErrorContext;

  public constructor(
    message: string,
    code: string,
    options: AppErrorOptions = {},
  ) {
    super(message, { cause: options.cause });

    this.name = "AppError";
    this.code = code;
    this.context = options.context;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
