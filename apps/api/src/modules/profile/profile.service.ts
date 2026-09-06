import { Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationSettings, UpdateNotificationSettingsInput } from '@lastly/contracts';

import { SupabaseService } from '../../infra/supabase/supabase.service';

export interface ProfileRow {
  id: string;
  display_name: string | null;
  timezone: string;
  digest_time: string;
  weekend_enabled: boolean;
  onboarded_at: string | null;
}

@Injectable()
export class ProfileService {
  constructor(private readonly supabase: SupabaseService) {}

  async get(userId: string): Promise<ProfileRow> {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select('id, display_name, timezone, digest_time, weekend_enabled, onboarded_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('프로필을 찾을 수 없습니다.');
    return data as ProfileRow;
  }

  /** 화면 13의 알림 설정. pushGranted는 구독 존재 여부로 판단한다. */
  async getNotificationSettings(userId: string): Promise<NotificationSettings> {
    const profile = await this.get(userId);
    const { count } = await this.supabase.admin
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    return {
      digestTimeLocal: profile.digest_time.slice(0, 5),
      timezone: profile.timezone,
      weekendEnabled: profile.weekend_enabled,
      pushGranted: (count ?? 0) > 0,
    };
  }

  async updateNotificationSettings(
    userId: string,
    input: UpdateNotificationSettingsInput,
  ): Promise<NotificationSettings> {
    const patch: Record<string, unknown> = {};
    if (input.digestTimeLocal !== undefined) patch.digest_time = input.digestTimeLocal;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.weekendEnabled !== undefined) patch.weekend_enabled = input.weekendEnabled;

    if (Object.keys(patch).length > 0) {
      const { error } = await this.supabase.admin.from('profiles').update(patch).eq('id', userId);
      if (error) throw error;
    }

    return this.getNotificationSettings(userId);
  }

  /** 화면 13의 "기록 내보내기". */
  async exportData(userId: string) {
    const [items, logs] = await Promise.all([
      this.supabase.admin.from('items').select('*').eq('user_id', userId),
      this.supabase.admin.from('item_logs').select('*').eq('user_id', userId).order('done_on'),
    ]);

    if (items.error) throw items.error;
    if (logs.error) throw logs.error;

    return {
      exportedAt: new Date().toISOString(),
      items: items.data ?? [],
      logs: logs.data ?? [],
    };
  }

  /**
   * 화면 13-B의 계정 영구 삭제.
   * auth.users를 지우면 나머지는 on delete cascade로 함께 사라진다.
   */
  async deleteAccount(userId: string): Promise<void> {
    const { error } = await this.supabase.admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  }
}
