# STAGE 4 FIX ORDER — wire the completion loop (Casey gate finding, 2026-10-28)

Gate result: Stage 4 NOT PASSED. The Wonder generator (documentEngagement, server/meta.js:136) has zero callers, there is no completion endpoint, and the parent "We did it" button calls nothing. Everything else already exists: schema (completion_events + UNIQUE INDEX on client_id, documentation_notes, messages.status/completed_at/participants), the locked DOCUMENTATION_PROMPT, and the family-file/feed rendering. This is a wiring job only.

## Build exactly this

1. Store function completeEngagement({ familyId, messageId, participants, activityMinutes, clientId }) in server/store.js:
   - Verify the message belongs to the family and is in 'sent' status.
   - Insert the completion_events row (client_id gives idempotency: a repeat call with the same client_id returns the existing event + note, never duplicates).
   - Update the message: status='completed', completed_at=now, participants stored.
   - Assemble the Wonder event ONLY from stored data (family name, child name/age, home language, activity title/domain/scope_ref, message created time) + the parent-supplied participants/minutes. Nothing else. Nothing invented.
   - Call documentEngagement(event); insert documentation_notes with standard='HSPPS 1302.50', model='muse-wonder-1.0', source='live', event_id + message_id + family_id set.
   - Failure honesty: if Wonder fails, the completion still stands (it is the source of truth) and the family file shows an honest "documentation pending/failed" state. Never store a fabricated note.
2. Route POST /api/parent/complete in server/index.js: parent session required (same pattern as voice-notes); body { message_id, participants, activity_minutes?, client_id }; returns the event + note status.
3. Parent UI in public/app.js: the "We did it" button opens a small sheet (same pattern as the voice-note sheet): who joined (participants text/chips from the family's members), optional minutes, confirm → POST → feed shows the completed state from the server response.

## Acceptance (Casey re-gates live)
- A real run through the parent flow against the live database — Casey will complete the live Rahman message himself and read the resulting documentation_notes row. Contract tests alone do not close this stage.
- Idempotency proven: double-submit with one client_id = one event, one note.
- After this lands and is verified, STOP and report. Casey gates before Stage 5.
