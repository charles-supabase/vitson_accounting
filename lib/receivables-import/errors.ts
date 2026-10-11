/**
 * An error whose message is safe to show to the end user.
 * Technical detail goes in `original` / server logs, never in `message`.
 */
export class ImportError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  original?: unknown;

  constructor(
    code: string,
    message: string,
    options: { status?: number; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "ImportError";
    this.code = code;
    this.status = options.status ?? 500;
    this.details = options.details;
    this.original = options.cause;
  }
}
