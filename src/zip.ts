/**
 * A stored (uncompressed) ZIP, for downloading the workshop's MP3s in one
 * file: MP3 does not compress, so storing is all a ZIP has to do here. The
 * same writer as the ElevenLabs workshop's (`core.js` → `zipStore`).
 */
export function zipStore(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, sum = crc(data);
    const h = new Uint8Array(30 + name.length), v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(12, 33, true);
    v.setUint32(14, sum, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true); h.set(name, 30);
    parts.push(h, data);
    const c = new Uint8Array(46 + name.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(14, 33, true);
    cv.setUint32(16, sum, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); c.set(name, 46);
    central.push(c);
    offset += h.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, size, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end].map((p) => p.slice().buffer), { type: "application/zip" });
}

/** "dosya_adı, duygu, metin" rows: commas in the text are kept, the feeling may be empty */
export interface Row { name: string; feeling: string; text: string; error: string; line: number }
export function parseRows(source: string): Row[] {
  const seen = new Set<string>();
  return source.split(/\r?\n/).map((line, i) => ({ line, i })).filter((x) => x.line.trim()).map(({ line, i }) => {
    const a = line.indexOf(","), b = line.indexOf(",", a + 1);
    const name = line.slice(0, a).trim().replace(/\.mp3$/i, "");
    const feeling = line.slice(a + 1, b).trim();
    const text = line.slice(b + 1).trim();
    let error = "";
    if (a < 0 || b < 0) error = "Biçim: dosya_adı, duygu, metin";
    else if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) error = "Dosya adında harf, rakam, _ ya da - kullanın.";
    else if (seen.has(name.toLowerCase())) error = "Dosya adı tekrarlanıyor.";
    else if (!text) error = "Metin boş olamaz.";
    seen.add(name.toLowerCase());
    return { name, feeling, text, error, line: i + 1 };
  });
}
