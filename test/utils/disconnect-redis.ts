import type Redis from 'ioredis';

/**
 * Disconnects an ioredis client and resolves once the connection has reached
 * the `end` state.
 *
 * `disconnect()` returns void, so awaiting it does nothing. Waiting for `end` (not just `close`) makes sure the socket behind the client is also gone,
 * which keeps Jest from reporting a lingering handle.
 * The listener is attached before calling `disconnect()` because a client in the `wait` state changes status synchronously.
 */
export function disconnectRedis(client: Redis): Promise<void> {
  if (client.status === 'end') return Promise.resolve();

  return new Promise<void>((resolve) => {
    client.once('end', () => resolve());
    client.disconnect();

    if (client.status === 'end') resolve();
  });
}
