import { parseAllowedHosts, validateAllowedHosts, isAllowedHost } from './allowed-hosts';

describe('parseAllowedHosts', () => {
  it('should return an empty array when the value is undefined or blank', () => {
    expect(parseAllowedHosts(undefined)).toEqual([]);
    expect(parseAllowedHosts('')).toEqual([]);
    expect(parseAllowedHosts('   ')).toEqual([]);
  });

  it('should normalize input by trimming whitespace, converting to lowercase, and stripping trailing dots', () => {
    expect(parseAllowedHosts('  Example.com  ,  Sub.Example.com.  ')).toEqual([
      'example.com',
      'sub.example.com',
    ]);
  });

  it('should accept subdomain when it is explicitly listed', () => {
    expect(parseAllowedHosts('example.com,sub.example.com')).toEqual([
      'example.com',
      'sub.example.com',
    ]);
  });

  it.each([
    ['scheme', 'https://example.com'],
    ['port', 'example.com:443'],
    ['path', 'example.com/path'],
    ['wildcard', '*.example.com'],
    ['underscore', 'bad_host.example.com'],
    ['Unicode lookalike', 'gіthub.com'], // Cyrillic і
    ['empty entry', 'example.com,'],
    ['space inside', 'exa mple.com'],
  ])('rejects %s with a startup error', (_label, raw) => {
    expect(() => parseAllowedHosts(raw)).toThrow(/Invalid allowed host/);
  });
});

describe('validateAllowedHosts', () => {
  it('should normalize provided array of allowed hosts', () => {
    expect(validateAllowedHosts(['  Example.com  ', '  Sub.Example.com.  '])).toEqual([
      'example.com',
      'sub.example.com',
    ]);
  });

  it('should throw an error when the input is not an array', () => {
    expect(() => validateAllowedHosts(undefined)).toThrow(
      `Allowed hosts must be an array of bare hostnames`,
    );
    expect(() => validateAllowedHosts('example.com' as any)).toThrow(
      `Allowed hosts must be an array of bare hostnames`,
    );
  });

  it('should throw on invalid hostnames', () => {
    expect(() => validateAllowedHosts(['https://example.com'])).toThrow(
      `Invalid allowed host "https://example.com"`,
    );
  });
});

describe('isAllowedHost', () => {
  const allowedHosts = parseAllowedHosts('github.com');

  it('should allow http and https hosts when the allowlist is empty', () => {
    expect(isAllowedHost('http://example.com', [])).toBe(true);
    expect(isAllowedHost('https://example.com', [])).toBe(true);
  });

  it.each(['ftp://github.com/x', 'file:///etc/passwd', 'javascript:alert(1)'])(
    'rejects %s even when the allowlist is empty',
    (input) => {
      expect(isAllowedHost(input, [])).toBe(false);
    },
  );

  it('should allow exact matches of allowed hosts', () => {
    expect(isAllowedHost('https://github.com', allowedHosts)).toBe(true);
  });

  it('should reject subdomains that are not explicitly listed', () => {
    expect(isAllowedHost('https://gist.github.com', allowedHosts)).toBe(false);
  });

  it('should allow subdomains that are explicitly listed', () => {
    const allowedHostWithSubdomain = parseAllowedHosts('github.com,gist.github.com');
    expect(isAllowedHost('https://gist.github.com', allowedHostWithSubdomain)).toBe(true);
  });

  it.each([
    ['uppercase scheme and host', 'HTTPS://GITHUB.COM/x'],
    ['trailing dot', 'https://github.com./x'],
    ['non-default port', 'https://github.com:8443/x'],
  ])('normalizes %s', (_label, input) => {
    expect(isAllowedHost(input, allowedHosts)).toBe(true);
  });

  it('should reject invalid URLs', () => {
    expect(isAllowedHost('not a url', allowedHosts)).toBe(false);
    expect(isAllowedHost('not a url', [])).toBe(false);
  });
});
