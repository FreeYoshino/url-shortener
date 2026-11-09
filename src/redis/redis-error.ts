/**
 * Builds a non-empty, log-friendly description for anything thrown or emitted
 * by the Redis client.
 *
 * `localhost` can resolve to both `::1` and `127.0.0.1`. When both connection attempts fail, Node raises an `AggregateError` whose own `message` is empty;
 * the useful text lives in `errors`. Logging only `error.message` therefore produced `Redis error: ` with nothing after the colon.
 *
 * @param error - The value to describe.
 * @returns A non-empty description, falling back to the error name or
 *   `String(error)`.
 */
export function describeRedisError(error: unknown): string {
  if (error instanceof AggregateError) {
    const details = error.errors
      .map((inner) => describeRedisError(inner))
      .filter((message) => message.length > 0)
      .join('; ');

    if (details) return error.message ? `${error.message}: ${details}` : details;
    return error.message || error.name;
  }

  if (error instanceof Error) {
    if (error.message) return error.message;

    const { code } = error as NodeJS.ErrnoException;
    return code ? `${error.name} (${code})` : error.name;
  }

  return String(error);
}
