import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

/** 모든 에러를 { error: { code, message, details } } 한 가지 모양으로 내보낸다. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof ZodError) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: '요청 형식이 올바르지 않습니다.',
          details: exception.flatten(),
        },
      });
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      return res.status(exception.getStatus()).json({
        error: {
          code: exception.name,
          message: typeof body === 'string' ? body : ((body as Record<string, unknown>).message ?? exception.message),
        },
      });
    }

    this.logger.error(`Unhandled ${req.method} ${req.url}`, exception instanceof Error ? exception.stack : String(exception));
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: 'INTERNAL_ERROR', message: '일시적인 오류가 발생했습니다.' },
    });
  }
}
