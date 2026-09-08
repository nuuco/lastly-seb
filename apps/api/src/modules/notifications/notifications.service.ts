import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  private readonly cronEnabled: boolean;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly push: PushService,
    private readonly items: ItemsRepository,
    private readonly logs: LogsService,
    private readonly cadence: CadenceService,
    config: ConfigService,
  ) {
    this.cronEnabled = config.get<string>('ENABLE_CRON') !== 'false';
  }

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
   * 개발 중에는 서버가 스스로 시계를 본다.
   *
   * 배포 환경에서는 끈다(ENABLE_CRON=false). 무료 호스팅은 접속이 없으면 서버를 재우므로
   * 안에서 도는 시계는 그 시간을 그냥 흘려보낸다. 대신 밖에서 /v1/internal/dispatch-digests 를
   * 두드린다. 인스턴스를 여러 대로 늘려도 중복 발송이 생기지 않는 이점도 있다.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledDispatch(): Promise<void> {
    if (!this.cronEnabled) return;
    await this.dispatchDigests();
  }

  /**
   * 그 시각이 알림 시간인 사용자에게만 보낸다.
   * 설계 13의 "이 시간에 하루 한 번만 모아서" 정책.
   *
   * 한 사람이 실패해도 나머지는 계속 보낸다.
   */
  async dispatchDigests(): Promise<{ candidates: number; sent: number; failed: number }> {
    const { data, error } = await this.supabase.admin.rpc('users_due_for_digest', {
      p_now: new Date().toISOString(),
    });

    if (error) {
      this.logger.error(`다이제스트 대상 조회 실패: ${error.message}`);
      throw new Error(error.message);
    }

    const rows = (data ?? []) as DigestRow[];
    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        await this.sendDigest(row);
        sent += 1;
      } catch (err) {
        failed += 1;
        this.logger.warn(
          `${row.user_id} 다이제스트 실패: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(`다이제스트 대상 ${rows.length}명 · 발송 ${sent} · 실패 ${failed}`);
    return { candidates: rows.length, sent, failed };
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
