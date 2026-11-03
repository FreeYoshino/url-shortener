import { describeRedisError } from './redis-error';

describe('describeRedisError', () => {
  it('should return the message of a regular Error', () => {
    expect(describeRedisError(new Error('boom'))).toBe('boom');
  });

  it('should fall back to the name and code when the message is empty', () => {
    const error = new Error('');
    (error as NodeJS.ErrnoException).code = 'ECONNREFUSED';

    expect(describeRedisError(error)).toBe('Error (ECONNREFUSED)');
  });

  it('should fall back to the name when the message and code are missing', () => {
    expect(describeRedisError(new Error(''))).toBe('Error');
  });

  it('should unwrap an AggregateError whose own message is empty', () => {
    const error = new AggregateError(
      [
        new Error('connect ECONNREFUSED ::1:6379'),
        new Error('connect ECONNREFUSED 127.0.0.1:6379'),
      ],
      '',
    );

    expect(describeRedisError(error)).toBe(
      'connect ECONNREFUSED ::1:6379; connect ECONNREFUSED 127.0.0.1:6379',
    );
  });

  it('should keep the AggregateError message when it has one', () => {
    const error = new AggregateError([new Error('inner')], 'outer');

    expect(describeRedisError(error)).toBe('outer: inner');
  });

  it('should flatten nested AggregateErrors', () => {
    const error = new AggregateError(
      [new AggregateError([new Error('first')], ''), new Error('second')],
      '',
    );

    expect(describeRedisError(error)).toBe('first; second');
  });

  it('should fall back to the name for an empty AggregateError', () => {
    expect(describeRedisError(new AggregateError([], ''))).toBe('AggregateError');
  });

  it('should stringify non-Error values', () => {
    expect(describeRedisError('plain string')).toBe('plain string');
    expect(describeRedisError(42)).toBe('42');
  });
});
