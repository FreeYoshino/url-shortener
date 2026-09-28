import { INestApplication } from '@nestjs/common';
import { RequestMethod, ValidationPipe } from '@nestjs/common';

export function setupApp(app: INestApplication): INestApplication {
  // Enable global validation pipe for DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Set a global prefix for all routes
  app.setGlobalPrefix('api', {
    exclude: [
      {
        path: ':shortCode',
        method: RequestMethod.GET,
      },
    ],
  });

  return app;
}
