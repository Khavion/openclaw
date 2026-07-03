// Encryption at rest for customer credentials (GHL OAuth tokens, Stripe
// restricted keys) using libsodium secretbox (XSalsa20-Poly1305), per the
// design doc §2 "Secrets". Key: 32-byte KHAVION_MASTER_KEY from env.
// Wire format: nonce (24 bytes) || ciphertext.

// The package's ESM build ships a dangling ./dist/modules-esm/libsodium.mjs
// reference, so load the CJS build explicitly via createRequire.
import { createRequire } from 'node:module';
import type _sodiumType from 'libsodium-wrappers';

const require = createRequire(import.meta.url);
const _sodium = require('libsodium-wrappers') as typeof _sodiumType;

let sodiumReady: Promise<typeof _sodium> | null = null;
async function sodium(): Promise<typeof _sodium> {
  if (!sodiumReady) {
    sodiumReady = _sodium.ready.then(() => _sodium);
  }
  return sodiumReady;
}

function keyFromHex(masterKeyHex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(masterKeyHex)) {
    throw new Error('KHAVION_MASTER_KEY must be 64 hex chars (32 bytes)');
  }
  return Uint8Array.from(Buffer.from(masterKeyHex, 'hex'));
}

export async function encryptSecret(plaintext: string, masterKeyHex: string): Promise<Buffer> {
  const s = await sodium();
  const key = keyFromHex(masterKeyHex);
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const cipher = s.crypto_secretbox_easy(s.from_string(plaintext), nonce, key);
  return Buffer.concat([Buffer.from(nonce), Buffer.from(cipher)]);
}

export async function decryptSecret(blob: Buffer, masterKeyHex: string): Promise<string> {
  const s = await sodium();
  const key = keyFromHex(masterKeyHex);
  const nonce = blob.subarray(0, s.crypto_secretbox_NONCEBYTES);
  const cipher = blob.subarray(s.crypto_secretbox_NONCEBYTES);
  const plain = s.crypto_secretbox_open_easy(
    Uint8Array.from(cipher),
    Uint8Array.from(nonce),
    key
  );
  return s.to_string(plain);
}
