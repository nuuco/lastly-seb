export interface OnDeviceKnownItem {
  id: string;
  name: string;
  lastDoneOn?: string | null;
}

export type EngineStatus = 'idle' | 'checking' | 'downloading' | 'compiling' | 'ready' | 'error';

export interface EngineProgress {
  status: EngineStatus;
  loaded: number;
  total: number;
  message: string;
}
