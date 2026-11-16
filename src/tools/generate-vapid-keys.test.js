import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { generateVapidKeys } from './generate-vapid-keys.js';

test('as chaves VAPID têm o formato do Web Push e formam um par válido', () => {
  const { publicKey, privateKey } = generateVapidKeys();
  assert.match(publicKey, /^[A-Za-z0-9_-]{87}$/);
  assert.match(privateKey, /^[A-Za-z0-9_-]{43}$/);
  const pub = Buffer.from(publicKey, 'base64url');
  assert.equal(pub.length, 65);
  assert.equal(pub[0], 0x04);
  assert.equal(Buffer.from(privateKey, 'base64url').length, 32);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
  assert.equal(ecdh.getPublicKey().toString('base64url'), publicKey);
});
test('cada execução gera chaves diferentes', () => {
  assert.notEqual(generateVapidKeys().privateKey, generateVapidKeys().privateKey);
});
