/**
 * Bare DNS hostname: labels of 1–63 chars separated by dots, no scheme, port,
 * path, wildcard, underscore or Unicode. 253 chars max. A trailing dot is
 * stripped before validation, so `example.com.` is accepted and normalized.
 */
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * Normalizes and validates an allowed host.
 *
 * @param host - The host to normalize and validate.
 * @returns hostname
 */
function normalizeAllowedHost(host: string): string {
  const value = host.trim().toLowerCase();
  const hostname = value.replace(/\.$/, ''); // strip trailing dot

  if (!HOSTNAME_PATTERN.test(hostname)) {
    throw new Error(`Invalid allowed host "${host}"`);
  }

  return hostname;
}

/**
 * Parses DEMO_ALLOWED_HOSTS. Undefined or blank means "no host restriction".
 *
 * @param allowedHosts - The string of allowed hosts to parse and validate.
 * @returns An array of normalized and validated hostnames.
 */
export function parseAllowedHosts(raw: string | undefined): string[] {
  if (!raw || raw.trim() === '') return [];

  return raw.split(',').map(normalizeAllowedHost);
}

/**
 * Validates an array of allowed hosts.
 *
 * @param allowedHosts - The array of allowed hosts to parse and validate.
 * @returns An array of normalized and validated hostnames.
 */
export function validateAllowedHosts(allowedHosts: string[] | undefined): string[] {
  if (!Array.isArray(allowedHosts)) {
    throw new Error(`Allowed hosts must be an array of bare hostnames`);
  }

  return allowedHosts.map(normalizeAllowedHost);
}

/**
 * Returns true only when `input` is an http(s) URL whose hostname exactly matches an entry in `allowedHosts`.
 *
 * - Protocol: only `http:` and `https:` are accepted, even when the allowlist is empty. `ftp:` and `file:` are rejected.
 *
 * - Host: exact match only. `docs.example.com` does NOT match `example.com`; list every subdomain explicitly.
 *
 * - An empty allowlist means "no host restriction" (the protocol check still applies).
 *
 * @param input - The input string to validate as a URL with an allowed hostname.
 * @param allowedHosts - An array of normalized and validated hostnames.
 * @returns true if the input is a valid URL with a hostname that is in the allowed hosts list, false otherwise.
 */
export function isAllowedHost(input: string, allowedHosts: string[]): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch (error) {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  if (allowedHosts.length === 0) return true;

  return allowedHosts.includes(url.hostname.replace(/\.$/, ''));
}
