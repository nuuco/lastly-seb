/**
 * Gemma 파일을 OPFS에 받는 워커.
 * GPU 장치는 복제할 수 없어서 올리기는 페이지에서 한다.
 */
const MODEL_OPFS_FILE = 'gemma3-270m-it-q8-web.task';
const MODEL_META_FILE = 'gemma3-270m-it-q8-web.meta.json';
const DEFAULT_MODEL_BYTES = 276_168_704;
/** 이전에 받던 1B 파일. 새 모델을 받기 전에 지운다. */
const LEGACY_OPFS_FILES = ['gemma3-1b-it-int4-web.task', 'gemma3-1b-it-int4-web.meta.json'];
const DOWNLOAD_STALL_MS = 30_000;

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      await ensureModelFile(msg.modelUrl, msg.id);
      self.postMessage({ id: msg.id, type: 'ready' });
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

async function ensureModelFile(modelUrl, requestId) {
  const modelUrlAbs = new URL(modelUrl, self.location.origin).href;
  await removeLegacyFiles();
  const cached = await openCachedFile(modelUrlAbs);
  if (cached) return cached;

  self.postMessage({
    id: requestId,
    type: 'progress',
    stage: 'download',
    loaded: 0,
    total: DEFAULT_MODEL_BYTES,
  });
  return downloadModel(modelUrlAbs, requestId);
}

async function openCachedFile(url) {
  try {
    const root = await navigator.storage.getDirectory();
    const meta = await readOpfsJson(root, MODEL_META_FILE);
    if (meta?.url && meta.url !== url) {
      await removeOpfsModel(root);
      return null;
    }
    const handle = await root.getFileHandle(MODEL_OPFS_FILE);
    const file = await handle.getFile();
    const expected = meta?.bytes > 0 ? meta.bytes : DEFAULT_MODEL_BYTES;
    if (!isCompleteSize(file.size, expected)) {
      await removeOpfsModel(root);
      return null;
    }
    return file;
  } catch {
    return null;
  }
}

async function removeLegacyFiles() {
  try {
    const root = await navigator.storage.getDirectory();
    await Promise.allSettled(LEGACY_OPFS_FILES.map((name) => root.removeEntry(name)));
  } catch {
    // ignore
  }
}

function isCompleteSize(size, expected) {
  return size === expected;
}

async function removeOpfsModel(root) {
  await Promise.allSettled([
    root.removeEntry(MODEL_OPFS_FILE),
    root.removeEntry(MODEL_META_FILE),
  ]);
}

async function writeMeta(root, url, bytes) {
  const metaHandle = await root.getFileHandle(MODEL_META_FILE, { create: true });
  const metaWritable = await metaHandle.createWritable();
  await metaWritable.write(JSON.stringify({ url, bytes }));
  await metaWritable.close();
}

async function readOpfsJson(root, name) {
  try {
    const handle = await root.getFileHandle(name);
    const text = await (await handle.getFile()).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function downloadModel(url, requestId) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('모델 파일을 받지 못했어요.');

  const total =
    Number(res.headers.get('content-length') || res.headers.get('x-linked-size') || 0) ||
    DEFAULT_MODEL_BYTES;

  const root = await navigator.storage.getDirectory();
  await removeOpfsModel(root);
  const handle = await root.getFileHandle(MODEL_OPFS_FILE, { create: true });
  const writable = await handle.createWritable();

  let loaded = 0;
  try {
    if (!res.body) throw new Error('모델 파일을 받지 못했어요.');
    const reader = res.body.getReader();
    let lastSent = 0;
    while (true) {
      const { done, value } = await readChunk(reader);
      if (done) break;
      await writable.write(value);
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
    await writable.close();
  } catch (err) {
    try {
      await writable.abort();
    } catch {
      // ignore
    }
    await removeOpfsModel(root);
    throw err;
  }

  await writeMeta(root, url, loaded);
  const file = await handle.getFile();
  if (!isCompleteSize(file.size, total) && !isCompleteSize(file.size, DEFAULT_MODEL_BYTES)) {
    await removeOpfsModel(root);
    throw new Error('모델 파일이 덜 받아졌어요. 다시 받아 주세요.');
  }
  return file;
}

function readChunk(reader) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('모델 받기가 멈췄어요. 네트워크를 확인하고 다시 받아 주세요.'));
    }, DOWNLOAD_STALL_MS);
    reader.read().then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
