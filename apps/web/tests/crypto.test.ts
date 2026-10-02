import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
const { decrypt, encrypt } = await import('@autojobs/shared/crypto');

test('AES-256-GCM round trip, and tampering is rejected', () => {
  const blob = encrypt('rahasia: cookie sesi portal');
  assert.equal(decrypt(blob).toString(), 'rahasia: cookie sesi portal');
  assert.notEqual(encrypt('x').toString('hex'), encrypt('x').toString('hex'), 'random IV per message');
  blob[blob.length - 1] ^= 1;
  assert.throws(() => decrypt(blob));
});
