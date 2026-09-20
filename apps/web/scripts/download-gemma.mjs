#!/usr/bin/env node
/**
 * Gemma 3 1B Instruct int4 웹 모델을 apps/web/public/models 에 받는다.
 * 저장소에는 올리지 않는다. Hugging Face Gemma 라이선스 동의가 필요할 수 있다.
 */
import { config as loadEnv } from 'dotenv';
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

loadEnv({ path: path.join(import.meta.dirname, '../../../.env') });

const MODEL_FILE = 'gemma3-1b-it-int4-web.task';
const SOURCE = `https://huggingface.co/litert-community/Gemma3-1B-IT/resolve/main/${MODEL_FILE}?download=true`;
const EXPECTED_BYTES = 700_383_232;
const destDir = path.join(import.meta.dirname, '../public/models');
const dest = path.join(destDir, MODEL_FILE);

const existing = await stat(dest).catch(() => null);
if (existing?.isFile() && existing.size === EXPECTED_BYTES) {
  console.log(`이미 있습니다: ${dest}`);
  process.exit(0);
}

await mkdir(destDir, { recursive: true });

const token = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN;
const headers = { 'User-Agent': 'lastly-ondevice-fetch' };
if (token) headers.Authorization = `Bearer ${token}`;

console.log(`받는 중: ${MODEL_FILE} (${(EXPECTED_BYTES / 1_000_000).toFixed(0)}MB)`);
const res = await fetch(SOURCE, { headers, redirect: 'follow' });
if (!res.ok || !res.body) {
  console.error(
    `실패 ${res.status}. Hugging Face에서 Gemma 라이선스에 동의한 뒤 HF_TOKEN 을 넣고 다시 실행하세요.`,
  );
  process.exit(1);
}

const type = res.headers.get('content-type') ?? '';
if (type.includes('text/html')) {
  console.error(
    'HTML이 왔습니다. 모델이 게이트되어 있습니다. https://huggingface.co/google/gemma-3-1b-it 에서 동의 후 HF_TOKEN 으로 다시 받으세요.',
  );
  process.exit(1);
}

let loaded = 0;
let lastLogged = -1;
const total = Number(res.headers.get('content-length') || EXPECTED_BYTES);
const progress = new Transform({
  transform(chunk, _enc, cb) {
    loaded += chunk.length;
    const pct = total ? Math.round((loaded / total) * 100) : 0;
    if (pct !== lastLogged && pct % 5 === 0) {
      lastLogged = pct;
      console.log(`  ${pct}%  ${(loaded / 1_000_000).toFixed(0)}MB`);
    }
    cb(null, chunk);
  },
});

await pipeline(Readable.fromWeb(res.body), progress, createWriteStream(dest));

const written = await stat(dest);
if (written.size < 100_000_000) {
  console.error(`파일이 너무 작습니다 (${written.size} bytes). 다운로드가 깨졌습니다.`);
  process.exit(1);
}

console.log(`저장: ${dest} (${(written.size / 1_000_000).toFixed(0)}MB)`);
