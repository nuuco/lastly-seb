export type OnDeviceIntent = 'record' | 'query';

export interface OnDeviceKnownItem {
  id: string;
  name: string;
  lastDoneOn: string | null;
}

export interface OnDeviceParseResult {
  intent: OnDeviceIntent;
  itemName: string | null;
  daysAgo: number;
  matchedItemId: string | null;
  candidateIds: string[];
  confidence: number;
  statedCadenceDays: number | null;
  /** 규칙을 거친 뒤, 로그로 남길지. 조회·예정·못 함은 false. */
  willSave: boolean;
  raw: string;
}

export type EngineStatus = 'idle' | 'checking' | 'downloading' | 'compiling' | 'ready' | 'error';

export interface EngineProgress {
  status: EngineStatus;
  loaded: number;
  total: number;
  message: string;
}
