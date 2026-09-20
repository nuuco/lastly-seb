/**
 * Gemma 3 270M int4 를 WebGPU 에서 돌리는 워커.
 *
 * type: 'module' 워커에서는 MediaPipe 기본 로더(importScripts)가 실패하고
 * "ModuleFactory not set" 이 난다. WASM 로더를 ESM 으로 직접 붙인다.
 */
import { FilesetResolver, LlmInference } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/genai_bundle.mjs';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/wasm';
/**
 * gemma3-270m-it-q4_0-web.task 에 박힌 KV 크기. 모델에 박힌 값과 정확히 같아야 한다.
 * 1B는 1280이었는데 270M 변환본의 실제 값은 확인 못 했다 — 구글 변환 노트북 예시값(1024)을
 * 넣어뒀다. "memory access out of bounds" 류 에러가 나면 이 값이 안 맞는 것이니
 * 모델 카드나 변환 스크립트를 다시 확인해야 한다.
 */
const MAX_TOKENS = 1024;

let llm = null;

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      await init(msg.modelUrl, msg.id);
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

async function init(modelUrl, requestId) {
  const genai = await loadFileset();

  self.postMessage({
    id: requestId,
    type: 'progress',
    stage: 'compile',
    loaded: 0,
    total: 1,
  });

  const modelAssetPath = new URL(modelUrl, self.location.origin).href;
  const options = {
    maxTokens: MAX_TOKENS,
    topK: 40,
    temperature: 0.8,
    randomSeed: 101,
    numResponses: 1,
    forceF32: true,
  };

  llm = await LlmInference.createFromOptions(genai, {
    baseOptions: { modelAssetPath },
    ...options,
  });
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
