import { BadRequestException } from '@nestjs/common';
import { AllowedHostPipe } from './allowed-host.pipe';
import { UrlsModuleOptions } from './urls-module.options';

describe('AllowedHostPipe', () => {
  const options: UrlsModuleOptions = { adminApi: true, allowedHosts: ['allowed.com'] };

  it('should pass a URL whose host is in the allowlist', () => {
    const pipe = new AllowedHostPipe(options);
    const value = { url: 'https://allowed.com/path' };

    expect(pipe.transform(value)).toBe(value);
  });

  it('should reject a URL whose hostname is not in the allowlist with the ValidationPipe error shape', () => {
    const pipe = new AllowedHostPipe(options);

    expect(() => pipe.transform({ url: 'https://notallowed.com' })).toThrow(BadRequestException);
  });

  it('should pass any http(s) host when the allowlist is empty', () => {
    const pipe = new AllowedHostPipe({ adminApi: true, allowedHosts: [] });

    expect(pipe.transform({ url: 'https://notallowed.com' })).toEqual({
      url: 'https://notallowed.com',
    });
  });

  it('should reject non-http(s) targets even when the host is allowed', () => {
    const pipe = new AllowedHostPipe(options);

    expect(() => pipe.transform({ url: 'ftp://allowed.com/file' })).toThrow(BadRequestException);
  });

  it('should reject non-http(s) targets even when the allowlist is empty', () => {
    const pipe = new AllowedHostPipe({ adminApi: true, allowedHosts: [] });

    expect(() => pipe.transform({ url: 'ftp://notallowed.com/file' })).toThrow(BadRequestException);
  });

  it('should not throw when the body has no url (global validation reports it first)', () => {
    const pipe = new AllowedHostPipe(options);

    expect(pipe.transform({})).toEqual({});
    expect(pipe.transform(undefined)).toBeUndefined();
  });
});
