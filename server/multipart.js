// Minimal multipart/form-data parser for small audio uploads.
// Node has no built-in parser and this keeps the server dependency-free.

import { httpError } from './http.js';

export async function readMultipart(req, { maxBytes = 15 * 1024 * 1024 } = {}) {
  const contentType = req.headers['content-type'] || '';
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!/^multipart\/form-data/i.test(contentType) || !match) {
    throw httpError(400, 'Expected multipart form data');
  }
  const boundary = (match[1] || match[2]).trim();

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw httpError(413, 'Recording is too large');
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  const delim = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = [];

  let cursor = body.indexOf(delim);
  while (cursor !== -1) {
    const start = cursor + delim.length;
    if (body.subarray(start, start + 2).toString() === '--') break;

    const next = body.indexOf(delim, start);
    if (next === -1) break;

    let part = body.subarray(start, next);
    if (part.subarray(0, 2).toString() === '\r\n') part = part.subarray(2);
    if (part.subarray(-2).toString() === '\r\n') part = part.subarray(0, -2);

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString('utf8');
      const data = part.subarray(headerEnd + 4);
      const name = /name="([^"]*)"/i.exec(headers)?.[1];
      const filename = /filename="([^"]*)"/i.exec(headers)?.[1];
      const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim();

      if (name && filename !== undefined) {
        files.push({ name, filename, contentType: type || 'application/octet-stream', data });
      } else if (name) {
        fields[name] = data.toString('utf8');
      }
    }
    cursor = next;
  }

  return { fields, files };
}
