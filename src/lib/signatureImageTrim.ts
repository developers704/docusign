import zlib from "node:zlib";

export type InkBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

function crc32(buf: Buffer) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return (~c) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Decode 8-bit RGB/RGBA PNG into raw RGBA pixels. */
export function decodePngRgba(bytes: Buffer): { width: number; height: number; data: Buffer } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes.toString("ascii", 1, 4) !== "PNG") return null;

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  const idat: Buffer[] = [];
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }

  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType) || !idat.length) return null;

  let inflated: Buffer;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const expected = (stride + 1) * height;
  if (inflated.length < expected) return null;

  const rgba = Buffer.alloc(width * height * 4);
  const prior = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = inflated[rowStart];
    const row = inflated.subarray(rowStart + 1, rowStart + 1 + stride);
    const recon = Buffer.alloc(stride);

    for (let i = 0; i < stride; i += 1) {
      const x = row[i];
      const a = i >= channels ? recon[i - channels] : 0;
      const b = prior[i];
      const c = i >= channels ? prior[i - channels] : 0;
      let value = x;
      if (filter === 1) value = (x + a) & 255;
      else if (filter === 2) value = (x + b) & 255;
      else if (filter === 3) value = (x + Math.floor((a + b) / 2)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        value = (x + pr) & 255;
      }
      recon[i] = value;
    }

    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      rgba[dst] = recon[src];
      rgba[dst + 1] = recon[src + 1];
      rgba[dst + 2] = recon[src + 2];
      rgba[dst + 3] = channels === 4 ? recon[src + 3] : 255;
    }
    recon.copy(prior);
  }

  return { width, height, data: rgba };
}

function isInkPixel(r: number, g: number, b: number, a: number) {
  if (a < 24) return false;
  // Near-white canvas background is not ink.
  if (r > 245 && g > 245 && b > 245) return false;
  return true;
}

export function findInkBounds(width: number, height: number, rgba: Buffer): InkBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (!isInkPixel(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  // Small padding so the underline is not clipped against ink.
  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  return { minX, minY, maxX, maxY, width, height };
}

function encodePngRgba(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const dest = y * (stride + 1);
    raw[dest] = 0; // none filter
    rgba.copy(raw, dest + 1, y * stride, y * stride + stride);
  }
  const compressed = zlib.deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Crop signature PNG to ink bounds so PDF underline matches visible strokes.
 * Returns original bytes when not a croppable PNG / no ink found.
 */
export function trimSignaturePng(bytes: Buffer): {
  bytes: Buffer;
  trimmed: boolean;
  contentWidthRatio: number;
} {
  const decoded = decodePngRgba(bytes);
  if (!decoded) {
    return { bytes, trimmed: false, contentWidthRatio: 1 };
  }
  const bounds = findInkBounds(decoded.width, decoded.height, decoded.data);
  if (!bounds) {
    return { bytes, trimmed: false, contentWidthRatio: 1 };
  }

  const cropW = bounds.maxX - bounds.minX + 1;
  const cropH = bounds.maxY - bounds.minY + 1;
  if (cropW >= decoded.width * 0.95 && cropH >= decoded.height * 0.95) {
    return {
      bytes,
      trimmed: false,
      contentWidthRatio: cropW / decoded.width,
    };
  }

  const cropped = Buffer.alloc(cropW * cropH * 4, 255);
  for (let y = 0; y < cropH; y += 1) {
    for (let x = 0; x < cropW; x += 1) {
      const src = ((bounds.minY + y) * decoded.width + (bounds.minX + x)) * 4;
      const dst = (y * cropW + x) * 4;
      cropped[dst] = decoded.data[src];
      cropped[dst + 1] = decoded.data[src + 1];
      cropped[dst + 2] = decoded.data[src + 2];
      cropped[dst + 3] = decoded.data[src + 3];
    }
  }

  return {
    bytes: encodePngRgba(cropW, cropH, cropped),
    trimmed: true,
    contentWidthRatio: 1,
  };
}
