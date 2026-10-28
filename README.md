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

- Two views in one app: **ADVOCATE** and **PARENT**, chosen at entry.
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

| Role | Passcode |
| --- | --- |
| Program staff | `1111` |
| Family | `2222` |

Families are chosen from a short list on the parent entry screen. This is a
demo affordance for the slice, not authentication.

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

## Verification

```bash
node tools/verify-stage1.mjs                 # real Chromium at 390x844
```

Screenshots land in `artifacts/` (not committed).

## Status

Built in gated stages. Stage 1: scaffold, both views, synthetic data, no AI.
