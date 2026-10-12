export const THROTTLER_LIMITS = {
  WRITE_LIMIT: Number(process.env.THROTTLE_WRITE_LIMIT) || 10,
  REDIRECT_LIMIT: Number(process.env.THROTTLE_REDIRECT_LIMIT) || 60,
};
