// Audio normalization. Every upload is converted before it reaches the
// transcription API: mono, 16-bit PCM WAV, 16 kHz.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const MAX_NOTE_MS = 120000;

export async function toWav16k(inputPath, outputPath) {
  try {
    await run(
      'ffmpeg',
      [
        '-y',
        '-v', 'error',
        '-i', inputPath,
        '-vn',
        '-ac', '1',
        '-ar', '16000',
        '-sample_fmt', 's16',
        outputPath
      ],
      { timeout: 60000 }
    );
  } catch (err) {
    const detail = String(err.stderr || err.message || '').slice(0, 300);
    const error = new Error('That recording could not be read as audio');
    error.status = 400;
    error.detail = detail;
    throw error;
  }
}

export async function durationMs(filePath) {
  const { stdout } = await run(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
    { timeout: 20000 }
  );
  const seconds = Number.parseFloat(String(stdout).trim());
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}
