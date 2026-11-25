import { Module, DynamicModule } from '@nestjs/common';
import { UrlsService } from './urls.service';
import { AnalyticsService } from './analytics.service';
import { UrlCacheService } from './url-cache.service';
import { UrlsController } from './urls.controller';
import { AdminUrlsController } from './admin-urls.controller';
import { RedirectController } from './redirect.controller';
import { validateAllowedHosts } from './allowed-hosts';
import { UrlsModuleOptions, URLS_MODULE_OPTIONS } from './urls-module.options';
import { AllowedHostPipe } from './allowed-host.pipe';

@Module({})
export class UrlsModule {
  static register(options: UrlsModuleOptions): DynamicModule {
    const allowedHosts = validateAllowedHosts(options.allowedHosts);

    return {
      module: UrlsModule,
      providers: [
        UrlsService,
        AnalyticsService,
        UrlCacheService,
        AllowedHostPipe,
        {
          provide: URLS_MODULE_OPTIONS,
          useValue: {
            adminApi: options.adminApi,
            allowedHosts: allowedHosts,
          },
        },
      ],
      controllers: [
        UrlsController,
        RedirectController,
        ...(options.adminApi ? [AdminUrlsController] : []),
      ],
    };
  }
}
