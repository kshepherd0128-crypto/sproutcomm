# SproutComm

Home-language family engagement infrastructure for Head Start programs.

SproutComm is a voice-first channel between program staff and families: an
advocate sends a message and a home activity, the family receives it in their
own language with an audio option, replies by voice, and every engagement is
documented against HSPPS 1302.50 in the family's file.

The reading activity is the vehicle for engagement. The product is the
communication and the documentation that comes with it.

## What's in this repo

```
server/       Node HTTP server, SQLite store, Meta API proxy
public/       Thin mobile-first client (no framework, no build step)
tools/        Real-browser verification driver (CDP) + stage scripts
data/         Runtime SQLite database and audio (gitignored)
```

- Two views in one app: **ADVOCATE** and **PARENT**. Staff sign in; the
  parent front door is a per-family link (`/f/<token>`) that starts a
  family-pinned session and nothing else.
- Parents get a cached latest engagement, a listen button, and a queue for
  outbound actions that syncs when connectivity returns.
- All AI calls are proxied server-side. The browser never sees `META_API_KEY`
  or a model id.
- Family content only touches `muse-spark-1.3` (translation),
  `muse-wonder-1.0` (documentation), and `muse-voice-transcribe-1.0`
  (transcription). No model containing `contributor` is used anywhere.

## Running it

Requires Node 22.5+ (uses `node:sqlite`) and ffmpeg on the host.

```bash
npm start          # http://localhost:8787
```

The first start seeds three synthetic families (Arabic, Bangla, English homes)
and four activities. No real family data is used, ever.

For the AI features, put the key outside the repo:

```bash
mkdir -p ~/.config/sproutcomm
printf 'META_API_KEY=%s\n' "$YOUR_KEY" > ~/.config/sproutcomm/env
chmod 600 ~/.config/sproutcomm/env
```

The server also accepts `META_API_KEY` from the process environment, which
takes precedence. The key is never written to the repo and never logged.

## Demo entry

Staff: passcode `1111` at `/`.

Families: there is no family picker and no shared parent passcode. Each family
has its own token link, shown on the family file in the advocate view:

```
http://localhost:8787/f/8W8mTbguhUiATx9mB8o9sQ
```

The token is the parent's credential. A parent session is pinned to the family
behind that token: the parent API takes no family id, every advocate route
rejects a parent session, and the token is stripped from the address bar once
the session exists. Tokens are redacted from server logs.

This is demo-grade access, not production authentication.

## Voice replies

A parent taps the voice note button and records in their own language. The
server runs every upload through ffmpeg before it touches the transcription
API:

```
ffmpeg -i upload -vn -ac 1 -ar 16000 -sample_fmt s16 note.wav
```

Then:

1. `muse-voice-transcribe-1.0` transcribes the WAV (`/v1/asr/transcribe`,
   multipart with the `request` and `audio` parts).
2. `muse-spark-1.3` translates the transcript to English for the advocate.
3. The advocate inbox shows the English translation, the original transcript,
   and a play button. The family file keeps the same reply under its
   engagement.

Notes are capped at two minutes, deduplicated by a device-generated id, and
served through signed URLs so `<audio>` works without a bearer header. If ASR
finds no speech, the reply is marked `no_speech` and the parent is asked to try
again; nothing is invented.

### Recording on a phone

Browsers only expose the microphone in a secure context. Locally that means
`http://localhost`; on a phone it means real HTTPS. Options for the demo:

- **Laptop at `http://localhost:8787`** — microphone works as-is.
- **Phone over LAN, with a trusted certificate** — run `npm run start:https`
  (serves `https://<lan-ip>:8443` with a generated self-signed cert) and install
  `data/certs/cert.pem` on the phone as a CA certificate. The certificate
  includes the LAN IP in its SAN list, so once trusted it is a proper secure
  context and recording works offline.
- **Tunnel** — point any trusted HTTPS tunnel at port 8787 if internet is
  available at demo time.
- **Any setup** — the recorder sheet also offers "choose a recording", which
  uploads a file without needing a secure context. That is the same
  convert/transcribe/translate pipeline.

## Languages

- v1: Arabic (RTL), Bangla, English. Locked Meta translation prompts.
- Sylheti (Deshi) is modelled as audio-first: voice in and out, no text cards,
  because written Sylheti is not a reliable channel for our families. Its
  speech recognition accuracy is unverified, so nothing in the product claims
  that it works.

## Activities

Aligned in style to Michigan pre-K / Wayne Metro scope and sequence: dialogic
reading, letter knowledge, counting in daily routines, and family conversation
prompts. All demo content is synthetic.

## Health

`GET /health` and `GET /api/health` return the same payload, including whether
the AI proxy has a key (`ai_configured`).

## Verification

```bash
node tools/verify-stage1.mjs    # real Chromium at 390x844, token entry, RTL
node tools/verify-security.mjs  # family isolation across sessions
node tools/verify-contract.mjs  # outgoing API shapes and locked prompts
node tools/verify-stage2.mjs    # live translation, or stub-mode honesty
node tools/verify-stage3.mjs    # voice note -> ASR -> English -> advocate inbox
node tools/verify-stage4.mjs    # completion -> Wonder note, via UI and SQLite
```

Screenshots land in `artifacts/` (not committed). `verify-stage2.mjs` switches
between live and stub checks based on `/health`, so the same command is the
live acceptance run once `META_API_KEY` is present.

## Status

- Stage 1: scaffold, both views, synthetic data, token links.
- Stage 2: advocate send with live Spark translation into Arabic and Bangla,
  parent view in the home language. Verified live with the server key.
- Stage 3: parent voice notes, ffmpeg normalization, live transcription,
  English translation, and the advocate inbox with playback.
- Stage 4: parent confirmation, completion event, Wonder documentation note,
  idempotent by device id, with an honest pending/failed state and retry if
  Wonder cannot write the note.
