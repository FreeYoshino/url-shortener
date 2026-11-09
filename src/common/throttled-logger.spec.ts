import { Logger } from '@nestjs/common';
import { ThrottledLogger } from './throttled-logger';

describe('ThrottledLogger', () => {
  let throttledLogger: ThrottledLogger;
  let warn: jest.Mock;
  let nowSpy: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.fn();
    throttledLogger = new ThrottledLogger({ warn } as unknown as Logger);

    // Pin the clock so every test reasons in explicit, deterministic windows.
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log the first warning for a key', () => {
    throttledLogger.warn('error', 'boom');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('boom');
  });

  it('should suppress a repeated warning for the same key within the interval', () => {
    throttledLogger.warn('error', 'first');
    nowSpy.mockReturnValue(1_000_000 + ThrottledLogger.DEFAULT_INTERVAL_MS - 1);

    throttledLogger.warn('error', 'second');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('first');
  });

  it('should log again once the interval has elapsed', () => {
    throttledLogger.warn('error', 'first');
    nowSpy.mockReturnValue(1_000_000 + ThrottledLogger.DEFAULT_INTERVAL_MS);

    throttledLogger.warn('error', 'second');

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenLastCalledWith('second');
  });

  it('should throttle each key independently', () => {
    throttledLogger.warn('error', 'error-1');
    throttledLogger.warn('close', 'close-1');
    throttledLogger.warn('error', 'error-2');

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(1, 'error-1');
    expect(warn).toHaveBeenNthCalledWith(2, 'close-1');
  });

  it('should honor a custom interval', () => {
    const customLogger = new ThrottledLogger({ warn } as unknown as Logger, 5_000);

    customLogger.warn('key', 'first');

    nowSpy.mockReturnValue(1_000_000 + 4_999);
    customLogger.warn('key', 'second');

    nowSpy.mockReturnValue(1_000_000 + 5_000);
    customLogger.warn('key', 'third');

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(1, 'first');
    expect(warn).toHaveBeenNthCalledWith(2, 'third');
  });

  it('should not extend the window when a warning is suppressed', () => {
    throttledLogger.warn('error', 'first');

    nowSpy.mockReturnValue(1_000_000 + 6_000);
    throttledLogger.warn('error', 'suppressed');

    nowSpy.mockReturnValue(1_000_000 + ThrottledLogger.DEFAULT_INTERVAL_MS);
    throttledLogger.warn('error', 'third');

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(1, 'first');
    expect(warn).toHaveBeenNthCalledWith(2, 'third');
  });

  it('should log the first warning even when the clock is at zero', () => {
    nowSpy.mockReturnValue(0);

    throttledLogger.warn('error', 'at-zero');

    expect(warn).toHaveBeenCalledWith('at-zero');
  });
});
