import { Logger } from '@nestjs/common';

export class ThrottledLogger {
  /**
   * The logger instance to use for logging messages.
   */
  private readonly logger: Logger;

  /**
   * The default interval in milliseconds for the throttled logger.
   */
  static readonly DEFAULT_INTERVAL_MS = 10000;

  /**
   * The interval in milliseconds for the throttled logger.
   */
  private readonly intervalMs: number;

  /**
   * A map of the last time a message was logged for each key.
   */
  private readonly lastLoggedAt = new Map<string, number>();

  /**
   * Creates a new instance of the ThrottledLogger.
   *
   * @param logger The logger instance to use for logging messages.
   * @param intervalMs The default interval in milliseconds for the throttled logger.
   */
  constructor(logger: Logger, intervalMs: number = ThrottledLogger.DEFAULT_INTERVAL_MS) {
    this.logger = logger;
    this.intervalMs = intervalMs;
  }

  /**
   * Logs a warning for one event kind at most once per interval.
   *
   * @param key - The event kind whose throttle window is used.
   * @param message - The warning message to log.
   */
  warn(key: string, message: string): void {
    const now = Date.now();
    const last = this.lastLoggedAt.get(key);

    if (last !== undefined && now - last < this.intervalMs) return;

    this.lastLoggedAt.set(key, now);
    this.logger.warn(message);
  }
}
