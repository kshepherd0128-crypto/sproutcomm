// Runtime configuration.
//
// Secrets live outside the repo. The server reads META_API_KEY from the
// process environment; for local runs it also reads ~/.config/sproutcomm/env
// (mode 600, never committed). The key is never written to the repo, never
// sent to the browser, and never logged.

import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const SECRET_FILE = path.join(os.homedir(), '.config', 'sproutcomm', 'env');

function loadSecretFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Real environment always wins over the secret file.
    if (!process.env[name]) process.env[name] = value;
  }
}

loadSecretFile(SECRET_FILE);

export const config = {
  port: Number(process.env.PORT || 8787),
  // Mobile browsers only expose the microphone in a secure context. Set
  // HTTPS=1 to serve the same app over TLS with a generated self-signed cert
  // so a phone on the local network can record voice notes.
  https: process.env.HTTPS === '1',
  httpsPort: Number(process.env.HTTPS_PORT || 8443),
  certDir: new URL('../data/certs/', import.meta.url).pathname,
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.SPROUT_DB || new URL('../data/sproutcomm.db', import.meta.url).pathname,
  audioDir: process.env.SPROUT_AUDIO_DIR || new URL('../data/audio/', import.meta.url).pathname,
  // Signs short-lived audio URLs so <audio> can play a note without an
  // Authorization header. Rotates on restart, which is fine for this slice.
  audioSecret: process.env.AUDIO_URL_SECRET || randomBytes(24).toString('hex'),
  meta: {
    baseUrl: process.env.META_BASE_URL || 'https://api.meta.ai',
    apiKey: process.env.META_API_KEY || '',
    // Model ids are fixed by the signed API contract. Nothing containing
    // "contributor" is ever used: family content must not train anyone.
    models: {
      translate: 'muse-spark-1.3',
      document: 'muse-wonder-1.0',
      transcribe: 'muse-voice-transcribe-1.0'
    }
  },
  demo: {
    advocatePasscode: process.env.ADVOCATE_PASSCODE || '1111'
  }
};

export function hasMetaKey() {
  return Boolean(config.meta.apiKey);
}

export function metaKeyProblem() {
  return 'META_API_KEY is not set on the server. Add it to the environment or to ~/.config/sproutcomm/env.';
}
