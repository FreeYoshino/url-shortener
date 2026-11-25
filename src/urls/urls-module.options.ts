/** Options that decide which URL routes are mounted and which redirect targets are allowed. */
export interface UrlsModuleOptions {
  /** Mount PUT / DELETE / statistics when true. */
  adminApi: boolean;
  /** Allowed redirect target hosts; an empty array means "no restriction". */
  allowedHosts: string[];
}

/** DI token for {@link UrlsModuleOptions}. */
export const URLS_MODULE_OPTIONS = Symbol('URLS_MODULE_OPTIONS');
