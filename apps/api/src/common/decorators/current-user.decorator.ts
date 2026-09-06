import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthenticatedUser, RequestWithUser } from '../guards/supabase-auth.guard';

export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const { user } = ctx.switchToHttp().getRequest<RequestWithUser>();
    return field ? user[field] : user;
  },
);
