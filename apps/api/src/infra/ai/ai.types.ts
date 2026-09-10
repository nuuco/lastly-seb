import type { CadenceUnit } from '@lastly/contracts';

/** apps/ai 의 Pydantic 스키마와 1:1로 대응한다. 한쪽을 고치면 같이 고칠 것. */

export interface AiParseRequest {
  text: string;
  reference_date: string;
  known_items: Array<{ id: string; name: string; last_done_on: string | null }>;
}

export interface AiParseResponse {
  /**
   * 기록하려는 말인지, 언제 했는지 묻는 말인지 — 설계 07-C.
   * 옛 버전 AI 가 안 보낼 수 있으므로 없으면 기록으로 본다.
   */
  intent?: 'record' | 'query';
  /** 사용자가 문장에서 직접 말한 주기(일수). 말하지 않았으면 null. */
  stated_cadence_days?: number | null;
  normalized_name: string | null;
  done_on: string;
  matched_item_id: string | null;
  candidates: Array<{ item_id: string; name: string; similarity: number }>;
  confidence: number;
  /** 항목을 못 알아들은 경우 사유 (로깅용). */
  reason: string | null;
}

export interface AiCadenceRequest {
  item_name: string;
  /** 이 사용자의 실제 수행 이력. 3건 이상이면 개인 주기를 우선한다. */
  history: string[];
  /** 사용자의 전체 평균 주기 — 개인 성향 보정에 쓴다. */
  user_average_interval_days: number | null;
}

export interface AiCadenceResponse {
  unit: CadenceUnit;
  interval: number;
  weekdays: number[];
  source: 'personal' | 'community' | 'default';
  confidence: number;
  rationale: string;
}

export interface AiEmbedResponse {
  embedding: number[];
}
