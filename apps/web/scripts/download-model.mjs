#!/usr/bin/env node
/**
 * 온디바이스 모델 파일을 apps/web/public/models 에 받는다. 저장소에는 올리지 않는다.
 *
 *   node apps/web/scripts/download-model.mjs gemma3-270m
 *
 * Gemma 원본은 Hugging Face 에서 라이선스 동의가 필요하다.
 * 동의한 계정의 토큰을 HF_TOKEN 에 넣고 실행한다.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SOURCES = {
  'gemma3-270m': {
    file: 'gemma3-270m-it-q4_0-web.task',
    url: 'https://huggingface.co/litert-community/gemma-3-270m-it/resolve/main/gemma3-270m-it-q4_0-web.task',
  },
  'gemma3-1b': {
    file: 'gemma3-1b-it-int4-web.task',
    url: 'https://huggingface.co/litert-community/Gemma3-1B-IT/resolve/main/gemma3-1b-it-int4-web.task',
  },
};

const id = process.argv[2];
const source = SOURCES[id];
if (!source) {
  console.error(`모델 id 를 넣어 주세요: ${Object.keys(SOURCES).join(' | ')}`);
  process.exit(1);
}

const destDir = path.join(import.meta.dirname, '../public/models');
const dest = path.join(destDir, source.file);
await mkdir(destDir, { recursive: true });

const token = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN;
const headers = token ? { Authorization: `Bearer ${token}` } : {};

console.log(`받는 중: ${source.file}`);
const res = await fetch(source.url, { headers, redirect: 'follow' });
const type = res.headers.get('content-type') ?? '';
if (!res.ok || !res.body || type.includes('text/html')) {
  console.error(
    `받지 못했어요 (${res.status}). Hugging Face 에서 Gemma 라이선스에 동의한 뒤 HF_TOKEN 을 넣고 다시 실행하세요.`,
  );
  process.exit(1);
}

await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
const written = await stat(dest);
console.log(`저장: ${dest} (${(written.size / 1_000_000).toFixed(0)}MB)`);
console.log(`models.ts 의 bytes 를 ${written.size} 로 맞추면 진행률이 정확해져요.`);
