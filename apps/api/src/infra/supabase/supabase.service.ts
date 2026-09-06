import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * service_role 클라이언트는 RLS를 우회한다.
 * 따라서 모든 쿼리에 user_id 조건을 직접 거는 책임이 레포지토리 레이어에 있다.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  admin: SupabaseClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.admin = createClient(
      this.config.getOrThrow<string>('NEXT_PUBLIC_SUPABASE_URL'),
      this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
}
