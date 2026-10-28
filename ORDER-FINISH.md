# ORDER — finish Stage 4 UI, then Stage 5 (Casey, 2026-10-28 night)

Casey is driving directly over SSH tonight (Kevin's authorization). Work in
this order. Stop at the end and report evidence for each part; Casey gates
from the live database and the real UI, not from test output alone.

## Part 1 — close Stage 4: wire the parent completion UI
The backend is proven (route + store + Wonder note all live-verified).
The remaining gap is public/app.js: the complete action is a placeholder —
`toast('Being connected in the next build')`. Replace it:
- Tapping "We did it" opens the completion sheet (state scaffold already at
  app.js:64): who joined (participants), optional minutes, confirm.
- Confirm POSTs /api/parent/complete with a generated client_id; on success
  the feed re-renders the completed state from the server; on failure an
  honest error shows and the action can be retried.
- Verify in the real parent UI (your chromium rig): screenshot the sheet,
  the completed feed state, and the resulting note in the advocate family
  file.

## Part 2 — hardening (small, from Casey's gate)
- Documentation notes must be written atomically with their body. An
  empty-bodied 'live' note was observed once tonight. If Wonder returns an
  empty body, treat it as a documentation failure (honest pending state),
  never a stored empty note.
- NO more `node server/seed.js --force` runs. Reseeds rotate family tokens
  and wipe live rows. From here the live DB only grows; if you need a clean
  test database, use SPROUT_DB pointing at a temp file.

## Part 3 — Stage 5: offline behavior (from the build order)
- Parent view serves the cached message/activity with no connection.
- Outbound parent actions (voice note upload, completion) queue locally
  while offline and flush on reconnect, with the queued state visible in
  the UI (the complete state object already has a `queued` field).
- Idempotency must hold across the flush (client_id dedupe already exists
  server-side for completions; voice notes have their own client ids).
- Verify by actually cutting the network in the rig: load feed online,
  go offline, act, reconnect, prove the server state matches — then
  screenshots + DB rows as evidence.

## Report
Per part: what you built, how you verified, artifact paths. Then STOP.
Casey runs the full end-to-end rehearsal gate next.
