# Phase 8A — private admin scheduling

Review-only development; no production operation is authorized. Base is shared
`0403c98` including #43. Use only `demo-fawcett-dev` Auth/Firestore emulators and
fictional records. There is no Apple integration, public booking endpoint, Square
Appointments connection, provider call, scheduled delivery or payment activation.
The production migration operator remains hard-disabled.

## Workflows

`/admin/schedule` now requires an active admin through `/api/admin/schedule`.
The former client-list clone is replaced by day/week/month views, artist filters,
date navigation, mobile agenda layout, create/edit/reschedule/status controls,
private audit history, legacy review, financial evidence and a policy editor.
The agenda view shows seven days; month view uses a Monday-first 42-cell grid.
All displayed times use the reviewed studio timezone, not browser timezone.
Refresh and reselect records after another admin changes them; stale revisions
cannot overwrite newer work. No customer can create or mutate appointments.

Create a studio client in `/admin/clients` first. Booking requires only its stable
studio ID, never an Auth account. Studio events/availability blocks may omit a
client. An optional UID/project requires the independent server-only evidence
already defined in the [payment bridge](studio-client-payments.md); this PR reuses
that checker and creates no links/accounts. Existing managed appointment ownership
and project associations cannot be silently changed by rescheduling.

Choose artist, type, local start/end, status, title, private notes and optionally
proposed client notes and financial evidence. Review before saving. Cancellation,
completion and no-show are status changes through the same revision-checked path.
A terminal status-only change with unchanged time/identity/payment reference remains
possible after client archival or project changes; it preserves the prior evidence
snapshot and cannot authorize a new booking or publication.
Completion requires a past end; no-show requires a past start. Tentative, booked
and confirmed appointments reserve resources; terminal history is retained.

Each save withholds/deletes any previous portal projection, including note-only
saves. Use `/admin/publication` to review exact current source fields separately.
No automatic publication copies internal notes, payment evidence or legacy unknown
fields. Verified owners may receive a reviewed projection; clients without accounts
remain entirely private. Existing original records are admin-only. A withdrawn
appointment temporarily disappears from the portal until re-reviewed; staff must
communicate changes manually because no emails/reminders are sent.

## Booking policy — no actual hours are invented

The default proposal has `enabled: false`, empty studio/artist hours,
`timezone: America/Edmonton`, `timezoneApproved: false` and
`transitionReviewed: false`. Empty days are closed. The zero buffer proposal is not
an assertion of actual studio policy. An admin must review all settings before
booking. Missing or malformed policy fails closed. No seed automatically enables it.

The policy editor provides labeled hour intervals, artist availability, buffer,
resource, timezone and blackout controls. Its stored policy contains:

- schemaVersion 1, server revision, enabled, timezone and explicit timezoneApproved;
- studioHours: weekday keys 0 (Sunday) through 6, each an array of interval objects
  with `start` and `end` in HH:mm format; empty arrays close that day;
- artistHours: the same weekly structure independently for `ben` and `autumn`;
- beforeMinutes/afterMinutes: integer 0–180, applied to resource occupancy AND hours;
- types: consultation, tattoo_session, touch_up, tapout, buyout, studio_event and
  availability_block, each with boolean `chair` and `bothArtists` requirements;
- blackouts: date/resource entries, where resource is studio, chair, ben or autumn;
- transitionReviewed: the admin's business-calendar reconciliation acknowledgement.

Types initially propose chair use for all types and both artists for BUYOUT/events;
these are conservative proposals requiring owner review, not settled business terms.
Blackouts cover whole dates; use availability blocks for shorter periods. All types
need an explicitly assigned artist. Tattoo sessions, touch-ups, TAPOUT and BUYOUT always require the one shared chair;
other types have configurable chair requirements. Owner policy determines which need both artists
and whether chair-free consultations may coexist with another artist's session.

Active appointments must fit one local calendar day INCLUDING buffers. Split
multi-day events into individually reviewed entries; recurring/multi-day series
and overnight hours are not implemented. DST gaps/repeated wall times are rejected
rather than guessed. Modern quarter-hour UTC offsets are supported; historical
non-quarter-hour zones are not an import mechanism. Edmonton is proposed pending
owner approval. Timezone changes with active reservations are rejected, requiring a
separate reservation reconciliation design. Every request includes expected policy
revision, preventing stale browsers from interpreting times under a changed policy.

Hours/blackout/buffer edits do not silently cancel or rewrite existing bookings.
Existing reservations retain their approved occupancy snapshot. Calendar cards flag
older policy revisions for manual review; changing buffers does not retroactively
expand old reservations. Re-save reviewed bookings to apply a new policy.

## Transaction and privacy boundaries

The authenticated server checks active admin, maintenance fence, source revision,
current policy revision, client/link/project evidence and optional financial evidence.
It atomically commits original appointment, resource reservations, private audit,
idempotency receipt, projection withdrawal and coordination lock.

Deterministic `scheduleReservations/{resource}_{localDate}` documents contain
occupied half-open intervals `[start,end)`, including buffers. Artist and chair
conflicts both matter. Required resources are determined by reviewed policy, never
request-supplied flags. Rescheduling removes old and acquires new intervals in one
transaction; a failure preserves the old appointment/reservations. A global
`schedulingControls/lock` serializes supported policy/appointment mutations and
legacy adoption. This intentionally favors correctness over throughput for one chair.

Receipts bind an opaque request ID to actor and exact operation. Concurrent/reloaded
retries cannot create a second appointment. Browser session storage retains only
request ID, not client/notes/form content. After ambiguous failure retain the marker
and retry original details; if policy/source/body changed, reconcile with an operator
before starting a replacement. No destructive clear/retry shortcut exists. Receipt
success does not imply a new mutation occurred under a later policy.

Checked-in rules deny ALL direct browser appointment creates/updates/deletes,
including active admins and cached SDK/REST clients. Reads remain admin-only;
client portal reads use owner-scoped reviewed projections. New config, lock,
reservation, receipt, policy audit, legacy baseline and appointment scheduleAudit
collections/subcollections remain default-denied to browser users, including admins.
All their access is through authenticated server APIs. Rules are emulator-tested
only. Privileged Admin SDK writers bypass rules: inventory, pause or adapt them
before any eventual rollout. Do not claim the scheduler controls external writers.
GET reads remain available during maintenance; all business writes are transactionally
fenced. Existing Auth accounts/sessions are unaffected.

## Financial evidence is read-only

Select an optional manual record or confirmed Square charge belonging to the same
studio client and compatible reviewed project. No amount, paid flag or provider
claim is accepted from the appointment form. Selected evidence stores only kind,
source ID and fingerprint; it does not allocate or spend funds.

Manual records are explicitly NOT Square-confirmed. Read-only charge/refund/dispute
history is shown separately; a charge does not establish an available deposit
balance. Reports are bounded at 100 entries/source and flag truncation. No net or
unrefunded balance is fabricated from an incomplete report. Changed financial
records remain authoritative; neither cancellations nor rescheduling alters them.
No charges, refunds, credits, subscriptions or notifications are created.

## Legacy preservation and manual Apple Calendar transition

An original without schedulingProtocol 1 is uncertain, even if it looks historical
or canceled. It appears in the legacy review panel and blocks new active bookings.
There is NO automatic cleanup, duration inference, owner inference or bulk adoption.

Explicit per-record adoption requires the exact original fingerprint, full reviewed
appointment details and original Auth/project relationships preserved. It retains
ID, existing createdAt and unrelated fields; an immutable
`scheduleLegacySnapshots/{id}` stores the exact original document, including original
start/end/updated timestamps. Reviewed adoption/rescheduling updates current times
and updatedAt intentionally; it never claims those current values stayed unchanged.
The audit records actor, revision and previous/next scheduling times/status. Failed
or stale adoption writes nothing. Unverifiable owners/projects remain held. A
separately reviewed linking workflow is required where evidence is missing.

Owner checklist before declaring CRM the master BUSINESS calendar:

1. Keep the Apple family calendar private. Do not grant Codex calendar access, export
   ICS/CSV, upload screenshots or copy family event names, attendees, locations or notes.
2. Owners inspect their calendar themselves and identify business appointments and
   business-only availability constraints. Personal commitments become generic
   “Unavailable” blocks with no family details, if necessary.
3. Agree proposed timezone, actual studio/artist hours, buffers, chair/exclusive-day
   rules, blackout dates, blocking statuses and staff responsibilities.
4. Reconcile legacy Firestore originals individually using protected inventory and
   baseline review procedures. Retain exact IDs/relationships; stop on uncertainty.
5. In development rehearse only fictional entries. Actual production transcription
   and legacy adoption require separate approval; this PR authorizes neither.
6. During an approved transition, manually enter only reviewed business entries.
   Keep transitionReviewed false until the owners compare business counts, dates,
   artists, chair use, client identity and conflicts. Staging entries require the
   per-entry business-only acknowledgement. No integration/import runs.
7. Stop parallel BUSINESS editing for the agreed window, or maintain a manually
   reviewed delta log. The family calendar can continue serving its private purpose.
8. Owner signs off final business inventory and missing/duplicate/late entries,
   resolves every legacy hold, then reviews transitionReviewed in the policy. This
   is a human completeness assertion, not an automatic proof that Apple was imported.
9. Declare the CRM authoritative for new business bookings only after cutover tests.
   Archive the business transition evidence securely outside Codex; do not erase
   original family calendar history or copy it into appointment notes.

## Rollout, rollback and limits

Keep production migration execution hard-disabled. Before a separately approved
coordinated release, verify browser/Admin project/database binding, live rules,
backup/restore evidence, writer shutdown, approved config, indexes, legacy inventory,
publication behavior and exact compatible app/rules artifacts. This PR adds no
production credentials or Vercel settings. Preview/Codex stay demo-only; payment,
email and customer booking activation remain off. Do not deploy server API without
its deny-browser-write rules and assume conflicts are enforced.

During rollback close the approved write fence and disable new scheduling under
owner-operated controls; preserve reservations, receipts, source records, snapshots
and audits. Never restore permissive appointment writes or delete locks to resolve
a conflict. Use a compatible read-only application/rules pair. Reopen with a fresh
fence epoch only after policy, client/link/project evidence, legacy holds, resource
counts, changed appointments and late privileged writes have been reconciled.

This foundation deliberately scans a maximum 1,000 original appointments and caps
150 reservations/resource/day; excess inventory fails closed. Calendar ranges are
at most 42 calendar dates. Larger history needs separately reviewed indexed inventory
and partitioning, not a silent limit increase or discarded records. No drag/drop,
recurrence, external synchronization or automated deposit policy is supplied. The
production operator currently rejects these unknown roots/subcollections; its
inventory scope must be separately reviewed before future execution.

Owner decisions still needed: timezone approval, actual hours, artist exceptions,
buffers, chair-free types, TAPOUT/BUYOUT/event exclusivity, blackout responsibilities,
legacy identity evidence, business-calendar completeness, booking/deposit policies,
manual communication, production rollout timing and future scaling requirements.
