/**
 * Gemma 3 1B int4 를 WebGPU 에서 돌리는 워커.
 * engine.ts가 init 메시지에 모델 경로와 maxTokens를 실어 보낸다.
 *
 * type: 'module' 워커에서는 MediaPipe 기본 로더(importScripts)가 실패하고
 * "ModuleFactory not set" 이 난다. WASM 로더를 ESM 으로 직접 붙인다.
 */
import { FilesetResolver, LlmInference } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/genai_bundle.mjs';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/wasm';

let llm = null;

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      await init(msg.modelUrl, msg.maxTokens, msg.id);
      self.postMessage({ id: msg.id, type: 'ready' });
      return;
    }
    if (msg.type === 'generate') {
      if (!llm) throw new Error('모델이 아직 없습니다.');
      const text = await generate(msg.prompt);
      self.postMessage({ id: msg.id, type: 'result', text });
      return;
    }
  } catch (err) {
    self.postMessage({
      id: msg.id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

async function init(modelUrl, maxTokens, requestId) {
  const genai = await loadFileset();
  const modelUrlAbs = new URL(modelUrl, self.location.origin).href;

  self.postMessage({
    id: requestId,
    type: 'progress',
    stage: 'download',
    loaded: 0,
    total: 700383232,
  });

  const bytes = await downloadModel(modelUrlAbs, requestId);

  self.postMessage({
    id: requestId,
    type: 'progress',
    stage: 'compile',
    loaded: bytes.byteLength,
    total: bytes.byteLength,
  });

  llm = await LlmInference.createFromOptions(genai, {
    baseOptions: { modelAssetBuffer: bytes },
    maxTokens,
    topK: 40,
    temperature: 0.8,
    randomSeed: 101,
    numResponses: 1,
    forceF32: true,
  });
}

async function downloadModel(url, requestId) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('모델 파일을 받지 못했어요.');

  const total =
    Number(res.headers.get('content-length') || res.headers.get('x-linked-size') || 0) || 700383232;

  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    self.postMessage({
      id: requestId,
      type: 'progress',
      stage: 'download',
      loaded: buf.byteLength,
      total: buf.byteLength,
    });
    return buf;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  let lastSent = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    if (loaded - lastSent >= 1024 * 1024 || loaded >= total) {
      lastSent = loaded;
      self.postMessage({
        id: requestId,
        type: 'progress',
        stage: 'download',
        loaded,
        total,
      });
    }
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function generate(prompt) {
  let acc = '';
  const text = await llm.generateResponse(prompt, (partial, done) => {
    acc += partial;
    if (!done && (hasClosedJson(acc) || isDegenerate(acc))) {
      llm.cancelProcessing();
    }
  });
  return (acc || text || '').trim();
}

function hasClosedJson(text) {
  const start = text.indexOf('{');
  if (start < 0) return false;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return true;
    }
  }
  return false;
}

function isDegenerate(text) {
  if (text.length < 80) return false;
  if (text.includes('{') || text.includes('"intent"')) return false;
  const chunk = text.slice(-24);
  return text.split(chunk).length >= 4;
}

async function loadFileset() {
  const genai = await FilesetResolver.forGenAiTasks(WASM_ROOT, true);

  if (typeof self.ModuleFactory !== 'function' && genai.wasmLoaderPath) {
    const loader = await import(/* webpackIgnore: true */ genai.wasmLoaderPath);
    if (typeof loader.ModuleFactory === 'function') {
      self.ModuleFactory = loader.ModuleFactory;
    } else if (typeof loader.default === 'function') {
      self.ModuleFactory = loader.default;
    }
    delete genai.wasmLoaderPath;
  }

  if (typeof self.ModuleFactory !== 'function') {
    throw new Error('WebAssembly 로더를 붙이지 못했습니다. 페이지를 새로고침한 뒤 다시 올려 보세요.');
  }

  return genai;
}
