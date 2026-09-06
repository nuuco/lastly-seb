import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { SupabaseService } from '../../infra/supabase/supabase.service';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * Authorization: Bearer <supabase access token> 을 검증한다.
 * 검증은 Supabase에 위임하고, 이후 레이어는 req.user.id만 신뢰한다.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('인증이 필요합니다.');
    }

    const { data, error } = await this.supabase.admin.auth.getUser(header.slice(7));
    if (error || !data.user) {
      throw new UnauthorizedException('세션이 만료되었습니다. 다시 로그인해 주세요.');
    }

    req.user = { id: data.user.id, email: data.user.email ?? null };
    return true;
  }
}
