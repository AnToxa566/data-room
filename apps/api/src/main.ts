import './bigint-json';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app/app.module.js';
import { configureApp } from './app/configure-app.js';

import type { Env } from './config/env.schema.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const configService = app.get<ConfigService<Env, true>>(ConfigService);
  const port = configService.get('PORT', { infer: true });
  const globalPrefix = 'api';

  // Cloud Run requires the container to listen on 0.0.0.0:$PORT — binding to
  // 127.0.0.1/localhost fails Cloud Run's health checks. Node's implicit default
  // without a host argument is generally all-interfaces already, but explicit removes
  // any doubt. See README.md "Deployment".
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
