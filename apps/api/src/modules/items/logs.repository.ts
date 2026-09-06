import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateLogInput, IsoDate } from '@lastly/contracts';
import { format } from 'date-fns';

import { SupabaseService } from '../../infra/supabase/supabase.service';

export interface LogRow {
  id: string;
  item_id: string;
  user_id: string;
  done_on: IsoDate;
  note: string | null;
  source: 'manual' | 'voice' | 'text' | 'notification';
  raw_input: string | null;
  created_at: string;
}

const COLUMNS = 'id, item_id, user_id, done_on, note, source, raw_input, created_at';

@Injectable()
export class LogsRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get table() {
    return this.supabase.admin.from('item_logs');
  }

  async listByItem(userId: string, itemId: string, limit = 20): Promise<LogRow[]> {
    const { data, error } = await this.table
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('item_id', itemId)
      .order('done_on', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as LogRow[];
  }

  async insert(
    userId: string,
    itemId: string,
    input: CreateLogInput,
    source: LogRow['source'],
    rawInput: string | null = null,
  ): Promise<LogRow> {
    const { data, error } = await this.table
      .insert({
        user_id: userId,
        item_id: itemId,
        done_on: input.doneOn,
        note: input.note,
        source,
        raw_input: rawInput,
      })
      .select(COLUMNS)
      .single();

    if (error) throw error;
    return data as LogRow;
  }

  async update(userId: string, logId: string, patch: Record<string, unknown>): Promise<LogRow> {
    const { data, error } = await this.table
      .update(patch)
      .eq('user_id', userId)
      .eq('id', logId)
      .select(COLUMNS)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('기록을 찾을 수 없습니다.');
    return data as LogRow;
  }

  async remove(userId: string, logId: string): Promise<void> {
    const { error } = await this.table.delete().eq('user_id', userId).eq('id', logId);
    if (error) throw error;
  }

  async countSince(userId: string, since: Date): Promise<number> {
    const { count, error } = await this.table
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('done_on', format(since, 'yyyy-MM-dd'));

    if (error) throw error;
    return count ?? 0;
  }
}
