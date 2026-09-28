/**
 * Gemma 파일을 OPFS에 받는 워커.
 * GPU 장치는 복제할 수 없어서 올리기는 페이지에서 한다.
 * 파일 이름·크기는 init 메시지로 받는다 (models.ts).
 */
const DOWNLOAD_STALL_MS = 30_000;

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      await ensureModelFile(msg.model, msg.id);
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

async function ensureModelFile(model, requestId) {
  const url = new URL(model.url, self.location.origin).href;
  const cached = await openCachedFile(model, url);
  if (cached) return cached;

  self.postMessage({
    id: requestId,
    type: 'progress',
    stage: 'download',
    loaded: 0,
    total: model.bytes,
  });
  return downloadModel(model, url, requestId);
}

async function openCachedFile(model, url) {
  try {
    const root = await navigator.storage.getDirectory();
    const meta = await readOpfsJson(root, model.metaFile);
    if (meta?.url && meta.url !== url) {
      await removeOpfsModel(root, model);
      return null;
    }
    const handle = await root.getFileHandle(model.opfsFile);
    const file = await handle.getFile();
    const expected = meta?.bytes > 0 ? meta.bytes : model.bytes;
    if (!isCompleteSize(file.size, expected)) {
      await removeOpfsModel(root, model);
      return null;
    }
    return file;
  } catch {
    return null;
  }
}

function isCompleteSize(size, expected) {
  return size === expected;
}

async function removeOpfsModel(root, model) {
  await Promise.allSettled([root.removeEntry(model.opfsFile), root.removeEntry(model.metaFile)]);
}

async function writeMeta(root, model, url, bytes) {
  const metaHandle = await root.getFileHandle(model.metaFile, { create: true });
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

async function downloadModel(model, url, requestId) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('모델 파일을 받지 못했어요.');

  const total =
    Number(res.headers.get('content-length') || res.headers.get('x-linked-size') || 0) ||
    model.bytes;

  const root = await navigator.storage.getDirectory();
  await removeOpfsModel(root, model);
  const handle = await root.getFileHandle(model.opfsFile, { create: true });
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
    await removeOpfsModel(root, model);
    throw err;
  }

  await writeMeta(root, model, url, loaded);
  const file = await handle.getFile();
  if (!isCompleteSize(file.size, total) && !isCompleteSize(file.size, model.bytes)) {
    await removeOpfsModel(root, model);
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
