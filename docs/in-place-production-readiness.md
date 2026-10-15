# Phase 4A — in-place production privacy readiness

> Phase 6A development update: [enforced fence and publication controls](write-fence-publication-controls.md)
> supersedes earlier repository gap descriptions and cached-source-only behavior.
> The live rules/writers are unverified and no production operation is authorized.


**Current decision:** retain `fawcett-website-sandbox` as the data-bearing production
backend. Its name does not make its real accounts or records disposable.
`fawcett-website` is **not a destination** and must remain untouched. Development,
fixtures and all active automated tests use only `demo-fawcett-dev` emulators.

This is a preparation/design PR. Neither real project was accessed. No Auth/data
copy, migration, rules/function/Vercel deployment, environment change, payment or
notification activation is authorized or performed. The prior
[cross-project plan](cross-project-production-plan.md) is deferred historical material;
its password transfer, project-switch and cross-bucket steps do not apply.

Start with the owner's [read-only preparation checklist](production-inventory-checklist.md).
The [in-place adapter design](in-place-adapter-design.md) specifies future implementation
and approval requirements. Existing [Phase 3 rehearsal](migration-rehearsal.md) and
[cutover runbook](production-cutover-runbook.md) supply the local transaction/journal
and recovery model, subject to the current decision and blockers below.

## Preserved identity and physical boundaries

The in-place operation creates reviewed derived views and journals in the SAME
approved production database:

```
clients/{existingUid}                              private original, unchanged
consultRequests/{existingId}                       private original, unchanged
messages/{existingId}                              private original, unchanged
portalRecords/{originalCollection}/records/{sameId} reviewed owner-scoped view
migrationRuns/{approvedRun}/records/{pathHash}      private evidence
```

The same applies to all 13 supported CRM collections. Auth accounts/providers,
passwords, UIDs, original document IDs/paths/field values/timestamps, stored financial
amounts/references and relationships stay in place. No UID import, account creation,
password reset, email-based linking, bucket move or URL project rebinding is part
of this operation. Firestore document server metadata on originals must remain
unchanged because the adapter must not write them; new views/journals have new server
metadata. Studio files/audit and server-only financial collections remain private
and are not projection sources. Do not invent missing profiles or history.

In-place migration alone does not close existing exposure: deployed rules must
restrict original reads, and the public frontend must read only reviewed views.
Old rules + new frontend denies the new namespace. New rules + old frontend denies
old reads. Do not bridge either mismatch with permissive original reads.

## Existing login and component compatibility

Keeping the project/app identity, Auth account and supported browser persistence
unchanged does not inherently invalidate passwords, refresh tokens or valid login
sessions. No project-token transfer or forced bulk logout is required by this plan.
A rule change affects Firestore authorization; it does not rewrite token issuer,
audience or UID. Normal token expiry, prior revocation, disabled/deleted users,
changed browser config, cleared persistence and expired sessions still require the
usual login. Live cookie/provider/browser behavior must be verified later; emulator
success cannot promise every session survives.

Clients must load the new projection-aware components and restart relevant listeners.
Retain the same verified Firebase web-app identity; do not switch browser or server
to `fawcett-website`, register replacement Auth accounts or change auth domains to
make the cutover work. A reload can update components while the existing valid Auth
session remains signed in. Old tabs/service workers/offline writes must be accounted
for by maintenance/version policy; do not assume every client reloads automatically.

Current portal reference/query shapes are preserved: own UID profile lookup;
owner-scoped project/payment/appointment/application queries; UID + conversation-ID
message selection; UID + clientVisible timeline queries; paired source/view writes
for new profiles, consults, conversations and messages. Existing SDK overload,
negative authorization, membership and financial regressions remain in the suite.

An existing client without a reviewed view safely gets an absent own-profile result
and withheld history. Raw fallback reads and signup overwrites of the original are
forbidden. This temporary absence must be reviewed as an availability decision,
not mistaken for deleted data. After approved publication, the same session/UID can
read its view. Different users, anonymous sessions and inactive admins cannot read
private originals or unrelated views. Studio APIs still require active admin roles
and do not create/link Auth accounts for manually entered clients.

## Free-text holds and ongoing writers — rollout blockers

The manifest must independently review exact candidate values and ownership, not
just field names. Withhold anything uncertain, including:

- Generated consult chat summaries with a `Health / Notes` section; clinical
  messages and their conversation previews. Do not edit immutable original bodies
  to make them publishable, nor silently regenerate a sanitized history.
- `readiness`, health/skin details, internal notes and generic appointment notes,
  private review/statistics, staff identities, bookkeeping/provider references,
  draft offers, private or health timeline entries, sensitive free-text descriptions,
  reference links and uploaded/external content with uncertain access rights.
- Unknown UIDs, missing/disabled accounts, wrong profile IDs, missing/cross-owner
  references, malformed types, unknown source relationships or unclear money aliases.

Phase 3's candidate strips private review-derived text and rejects obvious sensitive
strings, but a keyword list cannot certify confidentiality. Independent human
review and exact source/projection hashes remain mandatory. No bulk approve-all,
email inference or scanner override is acceptable.

Two implementation/operational requirements were verified in repository evidence:

1. `lib/adminFirestore.js` preserves missing legacy projections during ordinary
   edits, but once a projection exists it re-derives it from the source. The normal
   `portalProjection` deliberately reads `adminReview.clientProjectSummary` and
   shares intentional free text. A legacy summary/content/link cannot remain
   unreviewed merely because the initial migration omitted it. Before publication,
   approve all potential future shared content or implement a separately reviewed,
   persistent publication hold/resolver. A clean one-time candidate is insufficient.
2. Proposed rules currently allow valid **source-only** client intake creation.
   Such a submission is private and retained but has no portal view. The new helper
   writes paired records; an old cached form can still submit only an original.
   The operator needs an enforced maintenance/version/writer policy plus an approved
   late-write inventory/reconciliation process, or a separately reviewed stricter
   pair-validation/server-writer implementation. Do not auto-backfill old forms'
   free text or reopen raw reads to fix availability. This PR does not change rules.

These are go/no-go requirements, not claims that the live site is ready. No live
writer inventory, index coverage, content approval or deployed rule version has been
verified in Codex.

## Approval gates and cutover sequence

All real operations require new owner approval and an authorized operator outside
Codex. Each gate records scope/project/database, owner/reviewer/operator, commit,
manifest/backup reference, evidence location and timestamp/timezone.

| Gate | Evidence required for go | No-go |
| --- | --- | --- |
| 0 — Identity/inventory | Read-only checklist confirms current production backend/app/database, deployed policy, writers, Auth, counts and indexes | Unknown identity or any instruction to switch to the other project |
| 1 — Recovery | Owner-approved protected backup + successful isolated restore outside Codex, exact original/value/relationship checks and recovery objectives | Unrecoverable backup or production exports in Codex |
| 2 — Adapter/writers | Separately reviewed operator implementation, scoped identity/IAM, allowlisted writes, read-only inventory, explicit approval/run gates and enforceable fence/version/late-write strategy | Emulator guard bypass, unreviewed writers, source mutation or sensitive republishing |
| 3 — Records | Exact approved hashes/UIDs/reviewer, eligible/withheld/error counts, human free-text review and existing-view disposition | Ambiguous owner/content/money, unowned existing projection or unexplained count |
| 4 — Maintenance/release | Approved window, supported write fence, final snapshot/catch-up, compatible rules/frontend/server artifacts and abort plan | Maintenance page alone, missing indexes or permissive legacy-read exception |
| 5 — Reopen | Fresh and existing-session authorization matrix, intact originals/financial history, paired new writes and signed reconciliation | Any private disclosure, stale source, broken core workflow or missing record explanation |

After Gates 0–4, the future operator keeps maintenance and an enforceable fence over
source/projection writes (including cached SDK clients) and all Admin SDK/server/
external writers. Normal Auth login need not be disabled. No account transfer is
happening; Auth registration/claim/disabled-state changes still need inventory and
per-record rechecking because they can affect ownership or new-profile readiness.
Do not mass-disable accounts, revoke all sessions or reset passwords to simulate
a database fence. If a verified fence is unavailable, stop.

Under that fence: capture the agreed final backup/watermark; reconcile late changes;
apply the approved private-read/privacy policy with compatible temporary write
controls; verify fresh negative reads; execute reviewed view/journal writes;
reconcile every scoped record and source digest; release the exact projection-aware
frontend/server build while maintenance remains; test the matrix below. This is
only a future sequence. No fence/rules deployment or production adapter is supplied
or executed by this PR.

Only Gate 5 permits lifting the separate fence/maintenance. Retain private source
rules. Verify new paired intake/messages, late/offline retries and writer monitoring
again. Do not activate checkout, subscriptions, provider replays or notifications.

## Recovery and reconciliation

Use the detailed [runbook](production-cutover-runbook.md) with this SAME-project
scope. An approved protected backup must cover originals, all subcollections,
existing views, studio audit/associations, admin evidence and server-only financial
histories; preserve Auth/Storage/configuration recovery capability separately.
Firestore backup alone does not include Auth or Storage. Restore verification is
outside Codex to approved isolated recovery infrastructure, never over production
as a test. Do not request a credential or export in this workspace.

Per-run reports must distinguish inventoried, approved, eligible, withheld, error,
created, already-committed and withdrawn counts, per-collection/path dispositions,
logical/source hashes, exact money/timestamp/link comparisons and post-freeze
changes. Separate absent approved sources from expected withheld history. Existing
views require reviewed disposition; identical content is not automatic run ownership.
Reports/manifests contain sensitive metadata and stay in protected operator storage.

Abort for wrong project, uncertain backup/fence/owner/content, unexpected side effects,
unexplained source/destination changes/counts, financial drift, policy failures or
broken consult/messaging. Keep maintenance/private rules. Withdraw only run-owned
views whose current hash still matches their committed value; retain originals,
Auth, payments, journals and later edited views. A conflict stops automatic cleanup.
Rolled-back runs are terminal; republishing needs new review. Never restore unsafe
source-read rules or an old incompatible portal to recover convenience.

The same-project source of truth remains available to authorized admins. Do not
restore a full backup over later legitimate writes as routine rollback. Data disaster
recovery requires separate approval and post-backup delta handling. Previously
exposed text/browser caches/exports cannot be withdrawn retroactively.

## Later configuration, IAM and operator requirements — no credential request

- **Vercel read-only check:** Production browser `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  and Admin `FIREBASE_ADMIN_PROJECT_ID` must be verified as `fawcett-website-sandbox`;
  verify the existing other five browser values, web app, auth domain, actual bucket
  and server service identity privately. Do not replace them with another project's
  values. Preserve valid existing config; a mismatch is a stop condition requiring
  separate investigation/approval, not a blind variable edit.
- The app currently expects server-only `FIREBASE_ADMIN_CLIENT_EMAIL` and
  `FIREBASE_ADMIN_PRIVATE_KEY` certificate bindings for a live Admin runtime. Only
  presence/ownership/authorized project and least privilege need be inventoried now.
  Do not generate, rotate, enter or disclose credentials during Phase 4A. A future
  operator adapter should use an independently approved short-lived/managed identity
  where supported. It must not reuse this development runtime or accept arbitrary
  projects. No new production credential is requested here.
- Candidate migration permissions: Firestore read/list on inventory, linked originals,
  role evidence and journals; create views/journal/run documents; journal state updates;
  and, for separately authorized withdrawal, deletion of matching derived views only.
  Per-UID Auth lookup requires user-read permission (for example
  `firebaseauth.users.get`); no Auth create/update/delete/password export is needed.
  Backup/recovery, index administration, rules release and Vercel deploy are separate
  identities/approvals. Relevant Firestore entity permissions include
  `datastore.entities.get/list/create/update/delete` as required by the chosen mode;
  verify exact supported IAM/resource scope outside Codex. Admin SDK bypasses rules,
  and ordinary IAM roles do not inherently enforce our collection/field allowlist.
- Verify index readiness against actual portal queries: source namespace changes to
  `portalRecords/{collection}/records`; UID equality, UID + conversationId for messages,
  UID + clientVisible for timeline, and actual additional ordering/filter combinations.
  Studio API uses duplicateKeys array membership, document-ID pages, audit timestamp
  order and association studioClientId. Single-field exclusions/composite requirements
  need live verification. No production index manifest or live readiness is proved.
- Production must have no emulator overrides. Dev remains demo-only with no live
  credentials. The Firebase mode/deployment marker comes from the supported genuine
  Vercel Production build; do not forge it or use live Preview config. Any later
  approved rebuild keeps the same verified Firebase identity and requires maintenance
  coordination because browser settings are embedded at build time.

## Post-cutover verification matrix and current evidence

| Scenario | Required outcome |
| --- | --- |
| Existing valid session, updated components | Same account/UID/token project; own reviewed profile/history; no raw fallback |
| Existing session, stale components | Legacy reads denied; prompt reload/maintenance, never weaken rules |
| Existing user, no approved view | Safe absent own profile/withheld history; originals retained; no signup takeover |
| Selected existing conversation | Own approved messages; new reply and preview/read state pair work |
| New self-registration | Own profile/consult/conversation/message pairs; private health excluded; no old-history access |
| Other client, anonymous, inactive admin | Private originals, studio data, journals and unrelated views denied |
| Active admin | Private review workflow and server-only studio create/edit/audit work; studio file creates no Auth/link |
| Withdrawal | Views withheld; Auth/session/original histories/payments retained; private rules remain |
| Cached legacy write | Private original retained; explicit late-write review, no blind view regeneration |

New emulator regressions exercise representative legacy-rule/current-rule mismatches,
same-token same-project continuity, absent-to-reviewed profile, conversation selection/
reply/read state, private source-only intake, new signup, negative access and withdrawal.
Existing suites cover per-record manifests/journals, stale/disabled owners, content
withholding, duplicates, studio privacy and payment invariants. All active fixture
projects are now `demo-fawcett-dev` and rule/migration files run sequentially to avoid
shared-emulator cleanup/policy interference. Archived cross-project tests are excluded
from `npm test` and their npm command is removed under the current decision.

These are synthetic SDK/emulator tests, not proof of deployed rules, real login-cookie
persistence, production cache behavior, IAM, managed backups, live indexes or a write
fence. Production remains **NO-GO** until the gates and implementation requirements
above are reviewed and completed outside Codex. No production operation should follow
from this PR's test result alone.

Local validation: **233 active tests passed, zero failed/skipped** (15 environment/
model, 102 payments, 79 Firestore privacy, 10 Auth/Firestore integration, 27 migration
including 7 new cutover cases). The 7 same-project cases also passed a focused final
rerun including exact original create/update server-metadata checks. The deferred
10-case cross-project suite was **not run** under the current decision. Lint passed
with zero errors and three existing home-page image warnings; the build passed.
No production readiness claim or live operation follows from these local results.
