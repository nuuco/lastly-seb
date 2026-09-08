import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.use(helmet());
  app.setGlobalPrefix('v1');
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN')?.split(',') ?? true,
    credentials: true,
  });
  // 본문 검증은 ZodValidationPipe(packages/contracts 스키마)가 전담한다.
  // 전역 ValidationPipe는 class-validator를 요구하는데 이 프로젝트는 쓰지 않는다.
  app.useGlobalFilters(new AllExceptionsFilter());

  if (config.get('NODE_ENV') !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Lastly API')
        .setDescription('마지막으로 언제 했는지 기억해주는 앱')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, doc);
  }

  const port = config.get<number>('PORT') ?? 4000;
  // 컨테이너 안에서는 0.0.0.0 에 붙어야 밖에서 닿는다. localhost로 두면 접속이 안 된다.
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on :${port}`);
}

void bootstrap();
