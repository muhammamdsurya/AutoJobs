// QRIS payloads (EMVCo merchant-presented QR, tag-length-value). The merchant's static code (decoded from the image
// an admin uploads) becomes one QR per purchase that carries the amount: Point of Initiation (tag 01) = 12 "dynamic"
// and tag 54 = the amount, so the payer's banking app fills it in. Same conversion as github.com/yono99/dana-api-gateway.

type Tag = { id: string; value: string };

// CRC-16/CCITT-FALSE over the payload up to and including "6304", as 4 uppercase hex digits.
export function crc16(s: string) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function parse(payload: string): Tag[] | null {
  const tags: Tag[] = [];
  for (let i = 0; i < payload.length; ) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d\d$/.test(id) || !/^\d\d$/.test(payload.slice(i + 2, i + 4)) || i + 4 + len > payload.length) return null;
    tags.push({ id, value: payload.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return tags;
}

const build = (tags: Tag[]) => tags.map((t) => `${t.id}${String(t.value.length).padStart(2, '0')}${t.value}`).join('');

// A whole, intact QRIS: format indicator first, Indonesia, and a CRC that matches.
export function isQris(payload: string) {
  const tags = parse(payload.trim());
  const crc = tags?.at(-1);
  return !!tags && tags[0]?.id === '00' && tags.some((t) => t.id === '58' && t.value === 'ID') && crc?.id === '63'
    && crc16(payload.trim().slice(0, -4)) === crc.value;
}

// Merchant name (tag 59), to show which account the QRIS pays.
export const merchantName = (payload: string) => parse(payload.trim())?.find((t) => t.id === '59')?.value ?? null;

// The static payload with this amount (rupiah) filled in; tags stay in ascending order, CRC recomputed.
export function withAmount(staticPayload: string, amount: number) {
  const tags = parse(staticPayload.trim())?.filter((t) => t.id !== '54' && t.id !== '63');
  if (!tags) throw new Error('QRIS tidak valid');
  const out = tags.map((t) => (t.id === '01' ? { id: '01', value: '12' } : t));
  if (!out.some((t) => t.id === '01')) out.splice(1, 0, { id: '01', value: '12' });
  const at = out.findIndex((t) => t.id > '54');
  out.splice(at === -1 ? out.length : at, 0, { id: '54', value: String(Math.round(amount)) });
  const body = `${build(out)}6304`;
  return body + crc16(body);
}
