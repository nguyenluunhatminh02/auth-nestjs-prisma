import { Module, Global } from '@nestjs/common';
import { RedisService } from './services/redis.service';
import { ScheduledDeleteService } from './services/scheduled-delete.service';
import { CsrfService } from './services/csrf.service';
import { CaptchaService } from './services/captcha.service';
import { DeviceFingerprintService } from './services/device-fingerprint.service';
import { SecurityQuestionService } from './services/security-question.service';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { TransformInterceptor } from './interceptors/transform.interceptor';
import { ThrottlerGuard } from '@nestjs/throttler';

@Global()
@Module({
  imports: [],
  providers: [
    RedisService,
    ScheduledDeleteService,
    CsrfService,
    CaptchaService,
    DeviceFingerprintService,
    SecurityQuestionService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [RedisService, CsrfService, CaptchaService, DeviceFingerprintService, SecurityQuestionService],
})
export class CommonModule {}
