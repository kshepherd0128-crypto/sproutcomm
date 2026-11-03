// Teacher / advocate documentation toolkit checks. All work happens on a
// throwaway temp database; the live database is never touched. These
// features need no AI, so no Meta key is required.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sproutcomm-teacher-docs-'));
process.env.SPROUT_DB = path.join(TMP, 'teacher-docs.db');
process.env.SPROUT_AUDIO_DIR = path.join(TMP, 'audio');
process.env.META_API_KEY = process.env.META_API_KEY || 'teacher-docs-test-key';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

let db;
try {
  const { seedIfEmpty } = await import('../server/seed.js');
  const dbModule = await import('../server/db.js');
  db = dbModule.db;
  const store = await import('../server/store.js');
  const { getFamilyDetail, createDocEntry, createReferral, updateReferralStatus } = store;

  seedIfEmpty();

  const familyId = 'fam-brooks';
  const before = getFamilyDetail(familyId);
  check('family file payload loads on a temp DB', Boolean(before), before?.family?.family_name || 'missing');
  const baseline = before?.stats?.documentation ?? -1;
  check('documentation count starts at 0', baseline === 0, `count=${baseline}`);
  check('payload carries empty doc log and referral list', Array.isArray(before?.doc_entries) && Array.isArray(before?.referrals));

  /* (a) add a doc entry */
  const occurred = new Date('2026-11-02T14:30:00.000Z').toISOString();
  const added = createDocEntry({
    familyId,
    entryType: 'Home visit',
    noteText: 'Visited the home and reviewed the reading routine.',
    outcome: 'Family will try the picture walk on Thursday.',
    occurredAt: occurred,
    clientId: 'verify-doc-1'
  });
  check('doc entry is created', Boolean(added?.entry?.id), added?.entry?.id || 'no id');

  const afterOne = getFamilyDetail(familyId);
  check(
    'doc entry appears in the family-file payload',
    afterOne.doc_entries.some(
      (e) => e.id === added.entry.id && e.entry_type === 'Home visit' && e.note_text.includes('reading routine')
    )
  );
  check(
    'doc entry carries its outcome',
    afterOne.doc_entries.find((e) => e.id === added.entry.id)?.outcome === 'Family will try the picture walk on Thursday.'
  );
  check(
    'doc entry carries a Detroit-formatted display time',
    /PM|AM/.test(afterOne.doc_entries.find((e) => e.id === added.entry.id)?.occurred_display || ''),
    afterOne.doc_entries.find((e) => e.id === added.entry.id)?.occurred_display || 'missing'
  );
  check(
    'documentation count increments by exactly 1',
    afterOne.stats.documentation === baseline + 1,
    `${baseline} -> ${afterOne.stats.documentation}`
  );
  const storedCount = db.prepare('SELECT COUNT(*) AS n FROM doc_entries WHERE family_id = ?').get(familyId).n;
  check('exactly one doc record exists in storage', storedCount === 1, `rows=${storedCount}`);

  const duplicate = createDocEntry({
    familyId,
    entryType: 'Home visit',
    noteText: 'Visited the home and reviewed the reading routine.',
    outcome: 'Family will try the picture walk on Thursday.',
    occurredAt: occurred,
    clientId: 'verify-doc-1'
  });
  const storedAfterDup = db.prepare('SELECT COUNT(*) AS n FROM doc_entries WHERE family_id = ?').get(familyId).n;
  check(
    'duplicate submit with the same client id stores no second record',
    duplicate.duplicate === true && storedAfterDup === 1 && getFamilyDetail(familyId).stats.documentation === baseline + 1,
    `rows=${storedAfterDup}`
  );

  /* newest-first ordering */
  createDocEntry({
    familyId,
    entryType: 'Phone call',
    noteText: 'Called to confirm the Thursday visit.',
    occurredAt: new Date('2026-11-03T15:00:00.000Z').toISOString(),
    clientId: 'verify-doc-2'
  });
  const ordered = getFamilyDetail(familyId);
  check(
    'doc log lists newest first',
    ordered.doc_entries.length === 2 && ordered.doc_entries[0].entry_type === 'Phone call',
    ordered.doc_entries.map((e) => e.entry_type).join(', ')
  );
  check('documentation count is now 2', ordered.stats.documentation === 2, `count=${ordered.stats.documentation}`);

  /* (b) add a referral, then change its status */
  const referral = createReferral({
    familyId,
    category: 'Housing',
    agencyName: 'Wayne Metro Community Action',
    dateReferred: '2026-11-02',
    status: 'Pending',
    followUpDate: '2026-11-16',
    clientId: 'verify-ref-1'
  });
  check('referral is created as Pending', referral?.referral?.status === 'Pending', referral?.referral?.status || 'missing');

  const withReferral = getFamilyDetail(familyId);
  check(
    'referral appears in the family-file payload',
    withReferral.referrals.some((r) => r.id === referral.referral.id && r.agency_name === 'Wayne Metro Community Action')
  );

  updateReferralStatus({ familyId, referralId: referral.referral.id, status: 'Completed' });
  const reread = getFamilyDetail(familyId);
  check(
    'changed referral status persists on re-read',
    reread.referrals.find((r) => r.id === referral.referral.id)?.status === 'Completed',
    reread.referrals.find((r) => r.id === referral.referral.id)?.status || 'missing'
  );
  const storedReferral = db.prepare('SELECT status FROM referrals WHERE id = ?').get(referral.referral.id);
  check('changed referral status persists in storage', storedReferral?.status === 'Completed', storedReferral?.status || 'missing');

  /* (c) print-report payload includes the doc log and referral list */
  const printPayload = getFamilyDetail(familyId);
  check(
    'print-report payload includes the full documentation log',
    printPayload.doc_entries.length === 2 &&
      printPayload.doc_entries.some((e) => e.note_text.includes('reading routine')) &&
      printPayload.doc_entries.some((e) => e.note_text.includes('Thursday visit')),
    `entries=${printPayload.doc_entries.length}`
  );
  check(
    'print-report payload includes the referral list',
    printPayload.referrals.length === 1 &&
      printPayload.referrals[0].category === 'Housing' &&
      printPayload.referrals[0].status === 'Completed',
    `referrals=${printPayload.referrals.length}`
  );
  const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  check(
    'print view renders the documentation log and referrals',
    appSource.includes('Documentation log') && appSource.includes('doc_entries') && appSource.includes('Referrals') && appSource.includes('referrals')
  );
} catch (err) {
  check('test completed without an exception', false, err.message);
} finally {
  try {
    db?.close();
  } catch {
    /* already closed */
  }
  fs.rmSync(TMP, { recursive: true, force: true });
}

const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} teacher-docs checks passed`);
if (failures.length) process.exitCode = 1;
