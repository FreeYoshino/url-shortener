import { BadRequestException, Inject, Injectable, PipeTransform } from '@nestjs/common';
import { isAllowedHost } from './allowed-hosts';
import { URLS_MODULE_OPTIONS } from './urls-module.options';
import type { UrlsModuleOptions } from './urls-module.options';

/** Validates redirect target URLs against the configured allowed hosts. */
@Injectable()
export class AllowedHostPipe implements PipeTransform {
  private readonly options: UrlsModuleOptions;

  /**
   * Creates the pipe with the URL module's configuration.
   *
   * @param options - The URL module options containing the allowed hosts.
   */
  constructor(@Inject(URLS_MODULE_OPTIONS) options: UrlsModuleOptions) {
    this.options = options;
  }

  /**
   * Checks the URL in the input value against the configured allowed hosts.
   *
   * @param value - The value containing the URL to validate, if provided.
   * @returns The original value when its URL is allowed or absent.
   * @throws BadRequestException if the URL host is not allowed.
   */
  transform(value: { url?: string } | undefined): { url?: string } | undefined {
    if (value?.url && !isAllowedHost(value.url, this.options.allowedHosts)) {
      throw new BadRequestException(`URL host is not allowed: ${value.url}`);
    }

    return value;
  }
}
