export interface WaitForOptions {
  timeoutMs?: number;
  timeIntervalMs?: number;
  description?: string;
}

export async function waitFor<T>(
  predicate: () => Promise<T | null | undefined | false>,
  options: WaitForOptions = {},
): Promise<T> {
  const { timeoutMs = 5000, timeIntervalMs = 50, description = 'condition' } = options;
  const startTime = Date.now();
  let lastError: unknown;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await predicate();

      // when the predicate returns a truthy value, we consider the condition met
      if (result !== null && result !== undefined && result !== false) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, timeIntervalMs));
  }

  // timeout reached, throw an error with the last encountered error if any
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Timeout of ${timeoutMs}ms reached while waiting for ${description}. ${message}`);
}
