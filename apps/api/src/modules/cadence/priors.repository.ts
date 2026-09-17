import { Injectable, Logger } from '@nestjs/common';
import type { CadenceRule } from '@lastly/contracts';

import { SupabaseService } from '../../infra/supabase/supabase.service';

/** cadence_priors 한 행. "보통 사람들은 이 일을 얼마마다 하는가". */
interface PriorRow {
  canonical_name: string;
  cadence_unit: CadenceRule['unit'];
  cadence_interval: number;
  confidence: number | string;
  rationale: string | null;
  observed_median_days: number | string | null;
  observed_sample_size: number;
}

export interface CadencePrior {
  name: string;
  days: number;
  confidence: number;
  rationale: string | null;
}

/**
 * 주기 사전을 직접 읽는다.
 *
 * 같은 표를 apps/ai 도 본다. 그런데 무료 호스팅에서 apps/ai 가 잠들면 그 길이 막혀,
 * 사전에 답이 있는 항목마저 "우선 2주" 기본값으로 떨어졌다. 여기서 먼저 보면
 * 흔한 항목은 AI 를 깨우지 않고 끝난다 — 40밀리초, 그리고 AI 호출 0회.
 *
 * 조회 규칙(정확 일치 우선, 트라이그램 0.5 초과)은 DB 함수 find_cadence_prior 에 있다.
 */
@Injectable()
export class PriorsRepository {
  private readonly logger = new Logger(PriorsRepository.name);

  constructor(private readonly supabase: SupabaseService) {}

  async find(name: string): Promise<CadencePrior | null> {
    const { data, error } = await this.supabase.admin.rpc('find_cadence_prior', { p_name: name });

    if (error) {
      // 사전을 못 읽어도 멈추지 않는다. 뒤에 AI 가 있다.
      this.logger.warn(`주기 사전 조회 실패: ${error.message}`);
      return null;
    }

    const row = (data as PriorRow[] | null)?.[0];
    return row ? this.toPrior(row) : null;
  }

  /**
   * 사전값을 일수로 바꾼다.
   *
   * 실사용자들의 실제 간격이 충분히 모였으면 그쪽을 쓴다 — 권장 주기보다
   * 사람들이 실제로 하는 주기가 우리 화면에 더 맞다. apps/ai 의 _prior_days 와 같은 규칙이다.
   */
  private toPrior(row: PriorRow): CadencePrior {
    const observed = Number(row.observed_median_days);
    const useObserved = Number.isFinite(observed) && observed > 0 && row.observed_sample_size >= 30;

    const perUnit = { day: 1, week: 7, month: 30 }[row.cadence_unit];
    const days = useObserved ? Math.round(observed) : row.cadence_interval * perUnit;

    return {
      name: row.canonical_name,
      days,
      confidence: Number(row.confidence) || 0.5,
      rationale: row.rationale,
    };
  }
}
