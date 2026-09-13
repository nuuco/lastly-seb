import { z } from 'zod';

export const uuidSchema = z.string().uuid();

/** 서버는 항상 날짜만 다루는 필드를 `YYYY-MM-DD`로 직렬화한다. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다');
export const isoDateTimeSchema = z.string().datetime({ offset: true });

export type IsoDate = z.infer<typeof isoDateSchema>;
