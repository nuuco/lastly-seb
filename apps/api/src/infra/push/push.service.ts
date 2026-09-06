import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationAction } from '@lastly/contracts';
import webpush, { type PushSubscription } from 'web-push';

import { SupabaseService } from '../supabase/supabase.service';

export interface PushPayload {
  title: string;
  body: string;
  itemId: string;
  /** 잠금화면에서 바로 처리할 수 있는 액션 (화면 14). */
  actions: NotificationAction[];
}

/** 구독이 만료됐음을 알리는 상태 코드. 해당 구독은 정리한다. */
const GONE_STATUS = new Set([404, 410]);

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  onModuleInit() {
    webpush.setVapidDetails(
      this.config.getOrThrow<string>('VAPID_SUBJECT'),
      this.config.getOrThrow<string>('VAPID_PUBLIC_KEY'),
      this.config.getOrThrow<string>('VAPID_PRIVATE_KEY'),
    );
  }

  /**
   * 한 사용자의 모든 기기로 보낸다.
   * 만료된 구독은 조용히 정리하고, 나머지 기기 전송은 계속한다.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    const { data, error } = await this.supabase.admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId);

    if (error) throw error;

    const subscriptions = data ?? [];
    const results = await Promise.allSettled(
      subscriptions.map((row) =>
        this.deliver({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, row.id),
      ),
    );

    return results.filter((r) => r.status === 'fulfilled' && r.value).length;
  }

  private async deliver(sub: PushSubscription, payload: PushPayload, rowId: string): Promise<boolean> {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      await this.supabase.admin
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', rowId);
      return true;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;

      if (status && GONE_STATUS.has(status)) {
        await this.supabase.admin.from('push_subscriptions').delete().eq('id', rowId);
        this.logger.log(`만료된 구독 정리: ${rowId}`);
        return false;
      }

      this.logger.warn(`푸시 전송 실패(${status ?? 'unknown'}): ${rowId}`);
      return false;
    }
  }
}
