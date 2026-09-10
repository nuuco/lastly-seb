import { Injectable, NotFoundException } from '@nestjs/common';
import type { CadenceRule, CadenceSource, IsoDate } from '@lastly/contracts';

import { SupabaseService } from '../../infra/supabase/supabase.service';

/** items 테이블 한 행. snake_case 그대로 — 매핑은 서비스가 한다. */
export interface ItemRow {
  id: string;
  user_id: string;
  name: string;
  status: 'active' | 'archived';
  cadence_unit: CadenceRule['unit'];
  cadence_interval: number;
  cadence_weekdays: number[];
  notify_time: string | null;
  cadence_source: CadenceSource;
  last_done_on: IsoDate | null;
  next_due_on: IsoDate | null;
  snoozed_until: IsoDate | null;
  average_interval_days: number | null;
  log_count: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  'id, user_id, name, status, cadence_unit, cadence_interval, cadence_weekdays, notify_time, cadence_source, last_done_on, next_due_on, snoozed_until, average_interval_days, log_count, created_at, updated_at';

@Injectable()
export class ItemsRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get table() {
    return this.supabase.admin.from('items');
  }

  async listActive(userId: string): Promise<ItemRow[]> {
    const { data, error } = await this.table
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('next_due_on', { ascending: true, nullsFirst: true });

    if (error) throw error;
    return (data ?? []) as ItemRow[];
  }

  async findById(userId: string, itemId: string): Promise<ItemRow> {
    const { data, error } = await this.table
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('id', itemId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('항목을 찾을 수 없습니다.');
    return data as ItemRow;
  }

  async findByName(userId: string, name: string): Promise<ItemRow | null> {
    const { data, error } = await this.table
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('name', name)
      .maybeSingle();

    if (error) throw error;
    return (data as ItemRow) ?? null;
  }

  async insert(userId: string, input: {
    name: string;
    cadence: CadenceRule;
    cadenceSource: CadenceSource;
    embedding?: number[] | null;
  }): Promise<ItemRow> {
    const { data, error } = await this.table
      .insert({
        user_id: userId,
        name: input.name,
        cadence_unit: input.cadence.unit,
        cadence_interval: input.cadence.interval,
        cadence_weekdays: input.cadence.weekdays,
        notify_time: input.cadence.notifyTimeLocal,
        cadence_source: input.cadenceSource,
        name_embedding: input.embedding ?? null,
      })
      .select(COLUMNS)
      .single();

    if (error) throw error;
    return data as ItemRow;
  }

  async update(userId: string, itemId: string, patch: Record<string, unknown>): Promise<ItemRow> {
    const { data, error } = await this.table
      .update(patch)
      .eq('user_id', userId)
      .eq('id', itemId)
      .select(COLUMNS)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('항목을 찾을 수 없습니다.');
    return data as ItemRow;
  }

  /**
   * 지우지 않고 치워 둔다.
   *
   * 진짜 DELETE 를 하면 그 항목의 기록이 함께 사라진다. 3년치 이력이
   * 오타 한 번에 날아가면 되돌릴 방법이 없다. status 만 바꾸면 목록·검색·
   * 알림에서 모두 빠지므로 사용자가 보기엔 지워진 것과 같고,
   * 되돌리기는 status 를 되돌리는 것으로 끝난다.
   */
  async archive(userId: string, itemId: string): Promise<void> {
    const { error } = await this.table
      .update({ status: 'archived' })
      .eq('user_id', userId)
      .eq('id', itemId);
    if (error) throw error;
  }

  async restore(userId: string, itemId: string): Promise<void> {
    const { error } = await this.table
      .update({ status: 'active' })
      .eq('user_id', userId)
      .eq('id', itemId);
    if (error) throw error;
  }

  /**
   * 이름으로 찾기 — 설계 05-D.
   * 검색은 사용자가 이미 아는 것을 다시 꺼내는 일이라 의미 검색이 아니라
   * 글자 그대로 찾는다. "필터" 를 쳤으면 "필터" 가 든 것만 나와야 한다.
   */
  async searchByName(userId: string, query: string, limit = 20): Promise<ItemRow[]> {
    const { data, error } = await this.table
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('status', 'active')
      .ilike('name', `%${query}%`)
      .order('next_due_on', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as ItemRow[];
  }

  /** match_items RPC — 임베딩 + 트라이그램 + 별칭을 함께 본다. */
  async matchByMeaning(userId: string, query: string, embedding: number[] | null, limit = 5) {
    const { data, error } = await this.supabase.admin.rpc('match_items', {
      p_user_id: userId,
      p_query: query,
      p_embedding: embedding,
      p_limit: limit,
    });

    if (error) throw error;
    return (data ?? []) as Array<{
      item_id: string;
      name: string;
      similarity: number;
      last_done_on: IsoDate | null;
    }>;
  }

  /** AI가 같은 항목으로 판단한 표현을 별칭으로 학습시킨다. */
  async recordAlias(userId: string, itemId: string, phrase: string): Promise<void> {
    const { error } = await this.supabase.admin.rpc('bump_item_alias', {
      p_user_id: userId,
      p_item_id: itemId,
      p_phrase: phrase,
    });
    if (error) throw error;
  }
}
