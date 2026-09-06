/**
 * PWA 아이콘을 설계 색으로 생성한다.
 *
 * 외부 이미지 도구 없이 순수 Node로 PNG를 쓴다 — 아이콘 하나 만들자고
 * 빌드 파이프라인에 의존성을 늘리지 않기 위해서다.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const PAPER = [0xf5, 0xf2, 0xec];
const ACCENT = [0x4a, 0x43, 0x3f];
const ACTION = [0xb0, 0x55, 0x2f];

/**
 * "마지막으로 언제"를 점 세 개로 그린다.
 * 흐린 두 점은 지나간 기록, 진한 점은 가장 최근 — 앱이 무엇을 세는지를 형태로 말한다.
 */
function render(size, { maskable }) {
  const buf = Buffer.alloc(size * size * 4);
  const at = (x, y) => (y * size + x) * 4;

  // maskable은 가장자리가 잘려 나가므로 여백을 더 준다.
  const pad = Math.round(size * (maskable ? 0 : 0.08));
  const radius = Math.round(size * 0.22);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = at(x, y);
      const inside = maskable || insideRoundRect(x, y, pad, size - pad, radius);

      buf[i] = PAPER[0];
      buf[i + 1] = PAPER[1];
      buf[i + 2] = PAPER[2];
      buf[i + 3] = inside ? 255 : 0;
    }
  }

  const cy = Math.round(size / 2);
  const unit = size * 0.10;
  const gap = size * 0.155;

  paintDot(buf, at, size, Math.round(size / 2 - gap * 1.5), cy, unit * 0.4, ACCENT, 0.25);
  paintDot(buf, at, size, Math.round(size / 2 - gap * 0.75), cy, unit * 0.55, ACCENT, 0.45);
  paintDot(buf, at, size, Math.round(size / 2 + gap * 0.5), cy, unit, ACTION, 1);

  return encodePng(size, buf);
}

function insideRoundRect(x, y, min, max, r) {
  if (x < min || x >= max || y < min || y >= max) return false;

  const cx = Math.min(Math.max(x, min + r), max - r);
  const cy = Math.min(Math.max(y, min + r), max - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

/** 가장자리 1px을 부드럽게 섞어 계단이 보이지 않게 한다. */
function paintDot(buf, at, size, cx, cy, radius, color, alpha) {
  const from = Math.max(0, Math.floor(cy - radius - 1));
  const to = Math.min(size, Math.ceil(cy + radius + 1));

  for (let y = from; y < to; y += 1) {
    const xFrom = Math.max(0, Math.floor(cx - radius - 1));
    const xTo = Math.min(size, Math.ceil(cx + radius + 1));

    for (let x = xFrom; x < xTo; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > radius) continue;

      const i = at(x, y);
      const m = alpha * Math.min(1, radius - d);

      buf[i] = Math.round(buf[i] * (1 - m) + color[0] * m);
      buf[i + 1] = Math.round(buf[i + 1] * (1 - m) + color[1] * m);
      buf[i + 2] = Math.round(buf[i + 2] * (1 - m) + color[2] * m);
      buf[i + 3] = 255;
    }
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0; // 필터 없음
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 채널당 8비트
  ihdr[9] = 6; // RGBA

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../apps/web/public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable.png', 512, true],
  ['badge.png', 96, false],
]) {
  const png = render(size, { maskable });
  writeFileSync(new URL(name, out), png);
  console.log(`  ${name.padEnd(20)} ${png.length.toLocaleString()} bytes`);
}
