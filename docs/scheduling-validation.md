# Phase 8A validation

Base `0403c98` on `codex/fawcett-current-work`, including merged #43.
Feature branch `codex/admin-scheduling-foundation`.

`npm test` exited 0: **428 passed; zero failures, skips or cancellations**.

| Suite | Passed |
| --- | ---: |
| Environment, client model, payment config, calendar date utilities | 20 |
| Existing payments / Founder | 102 |
| Firestore privacy / authorization | 79 |
| Existing admin/client integration | 10 |
| Migration rehearsal | 28 |
| Notifications | 34 |
| Email verification | 20 |
| Write fence / publication | 34 |
| Operator isolation / journals | 46 |
| Studio payment bridge | 22 |
| Scheduling | 33 |

Scheduling coverage includes simultaneous chair bookings, same-artist conflicts,
chair-free consultations, business hours, artist availability, buffers, blackouts,
BUYOUT exclusivity, client-free blocks, atomic reschedules and competing reschedules,
failed/partial requests, cancellation release, completion/no-show history, stale
appointment/policy revisions, duplicate retries, DST ambiguity, timezone changes,
optional verified UID/project evidence, cross-client financial evidence rejection,
manual-versus-Square read-only accounting, legacy holds/immutable baselines/exact
fingerprints, original timestamps/relationships, transition staging, missing policy,
maintenance, unauthorized APIs, cached admin SDK/REST denials and reviewed portal
publication followed by safe withdrawal. Safe terminal cancellation after client
archival preserves original evidence and releases reservations.

The rules privacy fixture now explicitly asserts browser appointment creation fails
and seeds its trusted scheduling source using rules-disabled fixture setup. Its
existing independent source/view relationship and private-note assertions remain;
the real transactional source creation is exercised by the scheduling emulator suite.

`npm run lint` exited 0 with no errors and only the three existing `app/page.js`
image warnings. `npm run build` exited 0. `git diff --check` passed. The build uses
demo-mode isolation; it did not require or contact production Firebase. Expected
mixed-module, emulator and metadata/CLI readiness warnings were nonfatal.

A separate HTTP smoke check started the optimized Next server locally and fixed
Auth/Firestore emulators with fictional accounts. It verified admin-shell HTTP 200,
anonymous API 403, authenticated studio-client creation, reviewed policy update,
appointment creation, identical retry returning one ID and private calendar read.
That check passed and both the temporary server and emulator processes were stopped.
The smoke fixture/runner was temporary, outside tracked source. No provider call or
private calendar connection occurred. No browser visual/interaction automation was
available; desktop/mobile visual acceptance remains a review step.

See [operating policy and Apple transition checklist](admin-scheduling-foundation.md).
Owner decisions remain actual studio/artist hours, timezone approval, buffers,
chair-free consultation policy, TAPOUT/BUYOUT/event exclusivity, blackouts, legacy
identity/project evidence, deposit review and when to declare the CRM authoritative.

Checked-in rules changes are approved for emulator testing only. No rules, website,
functions or configuration were deployed. No production data was accessed/migrated;
no Square, email, reminders, public booking or synchronization was enabled. The
production migration factory and environment guards remain unchanged/hard-disabled.
The pre-existing untracked `CLAUDE.md` is excluded from this work.
