import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { NotificationAction, PushSubscriptionInput } from '@lastly/contracts';
import { addDays, format, nextSaturday, parseISO } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

import { PushService } from '../../infra/push/push.service';
import { SupabaseService } from '../../infra/supabase/supabase.service';
import { CadenceService } from '../cadence/cadence.service';
import { ItemsRepository } from '../items/items.repository';
import { LogsService } from '../items/logs.service';

interface DigestRow {
  user_id: string;
  display_name: string | null;
  timezone: string;
  weekend_enabled: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly push: PushService,
    private readonly items: ItemsRepository,
    private readonly logs: LogsService,
    private readonly cadence: CadenceService,
  ) {}

  async subscribe(userId: string, input: PushSubscriptionInput): Promise<void> {
    const { error } = await this.supabase.admin.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        user_agent: input.userAgent ?? null,
      },
      { onConflict: 'endpoint' },
    );

    if (error) throw error;
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    const { error } = await this.supabase.admin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    if (error) throw error;
  }

  /**
   * 알림 액션 처리 (화면 14).
   * complete는 오늘 날짜로 기록하고, snooze는 예정일만 미룬다.
   */
  async handleAction(userId: string, itemId: string, action: NotificationAction, today = new Date()) {
    if (action === 'complete') {
      return this.logs.completeToday(userId, itemId, today);
    }

    const nextDue =
      action === 'snooze_3d' ? addDays(today, 3) : nextSaturday(today);

    await this.items.update(userId, itemId, { next_due_on: format(nextDue, 'yyyy-MM-dd') });
    return { snoozedUntil: format(nextDue, 'yyyy-MM-dd') };
  }

  /**
   * 매시 정각에 돌면서, 그 시각이 알림 시간인 사용자에게만 보낸다.
   * 화면 13의 "이 시간에 하루 한 번만 모아서" 정책.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async dispatchDigests(): Promise<void> {
    const { data, error } = await this.supabase.admin.rpc('users_due_for_digest', {
      p_now: new Date().toISOString(),
    });

    if (error) {
      this.logger.error(`다이제스트 대상 조회 실패: ${error.message}`);
      return;
    }

    for (const row of (data ?? []) as DigestRow[]) {
      await this.sendDigest(row).catch((err) =>
        this.logger.warn(`${row.user_id} 다이제스트 실패: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  }

  private async sendDigest(user: DigestRow): Promise<void> {
    const localToday = toZonedTime(new Date(), user.timezone);

    // 주말 알림을 껐으면 토·일에는 보내지 않는다.
    const dow = localToday.getDay();
    if (!user.weekend_enabled && (dow === 0 || dow === 6)) return;

    const rows = await this.items.listActive(user.user_id);
    const due = rows.filter((r) => {
      const days = this.cadence.daysUntil(r.next_due_on, localToday);
      return days !== null && days <= 0;
    });

    if (due.length === 0) return;

    const head = due[0]!;
    const daysSince = this.cadence.daysSince(head.last_done_on, localToday);

    const title = due.length === 1 ? `${head.name}할 때가 됐어요` : `오늘 챙길 것 ${due.length}가지`;
    const body =
      due.length === 1
        ? `마지막 ${daysSince ?? 0}일 전${head.last_done_on ? ` · ${this.formatKoreanDate(head.last_done_on)}` : ''}`
        : due.map((d) => d.name).slice(0, 3).join(', ');

    const sent = await this.push.sendToUser(user.user_id, {
      title,
      body,
      itemId: head.id,
      actions: ['complete', 'snooze_3d', 'snooze_weekend'],
    });

    if (sent > 0) {
      await this.supabase.admin.from('notifications').insert({
        user_id: user.user_id,
        item_id: head.id,
        title,
        body,
        scheduled_at: fromZonedTime(localToday, user.timezone).toISOString(),
        sent_at: new Date().toISOString(),
      });
    }
  }

  /** "8월 25일" — 알림 본문에 쓰는 형식. */
  private formatKoreanDate(iso: string): string {
    const d = parseISO(iso);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
}
