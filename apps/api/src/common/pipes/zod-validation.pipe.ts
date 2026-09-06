import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * packages/contracts의 zod 스키마로 요청을 검증한다.
 * 프론트와 서버가 같은 정의를 공유하므로 형식이 어긋날 수 없다.
 *
 * 커스텀 파라미터 데코레이터로 만들지 않는 이유:
 * NestJS는 데코레이터 인자에 `transform` 메서드가 있으면 그걸 파이프로 간주한다.
 * zod 스키마에도 `.transform()`이 있어서, 스키마를 인자로 넘기면
 * 파이프로 오인되고 정작 데이터는 undefined로 들어온다.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: '요청 형식이 올바르지 않습니다.',
        details: result.error.flatten(),
      });
    }

    return result.data;
  }
}

/** `@Body(zodBody(schema))` 처럼 짧게 쓰기 위한 헬퍼. */
export const zodBody = (schema: ZodSchema) => new ZodValidationPipe(schema);
