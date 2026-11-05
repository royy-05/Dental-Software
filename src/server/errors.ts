/** Errors thrown by route handlers and services, mapped to HTTP responses by `handler()`. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = "Please sign in.", code = "unauthorized") => new ApiError(401, code, msg);
export const forbidden = (msg = "You do not have access to this.") => new ApiError(403, "forbidden", msg);
export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found.`);
export const badRequest = (msg: string, details?: unknown) => new ApiError(400, "bad_request", msg, details);
export const conflict = (msg: string, code = "conflict") => new ApiError(409, code, msg);
export const tooMany = (retryAfter: number) => new ApiError(429, "rate_limited", "Too many requests. Please try again shortly.", { retryAfter });
