# Phase 6A — write fence and reviewed publication

This is a development implementation and synthetic rehearsal, **not production
approval**. Production remains `fawcett-website-sandbox`; `fawcett-website` stays
untouched. Codex uses only `demo-fawcett-dev` on loopback emulators. No real
records, credentials, exports, email delivery, payments or deployment are involved.
This document supersedes earlier planning statements that the repository lacks a
write fence or allows cached source-only client submissions. It does not establish
that these controls are installed in the live project.

## Design and control ownership

The authoritative Firestore document is `systemControls/writeFence`:

```json
{"schemaVersion":1,"state":"maintenance","epoch":"owner-chosen-new-epoch","writerProtocol":1}
```

Only the exact `state: "open"` schema with protocol 1 and a nonempty ASCII
letter/digit/underscore/hyphen epoch (maximum 80 characters) permits business
writes. Missing state, malformed values, unsupported versions, read failures and
maintenance all fail closed. This document is publicly get-readable for signup
preflight/status; put **no private information or writer inventory in it**.
Browser admins cannot change it. A separately authorized IAM operator controls it
outside the website. There is no public or admin HTTP bypass/toggle endpoint and
no environment-variable override. Use a fresh epoch for every reopening; do not
reuse an earlier value.

Checked-in Firestore rules gate every allowed browser create/update/delete,
including active admins. Rules apply to direct SDK and authenticated REST writes,
regardless of which frontend a cached browser runs. Closed writes preserve the
existing owner-scoped projection read policy, private-original restrictions and
Auth accounts/sessions. A page banner is explanatory; it is not the fence.

All HTTP Admin SDK access comes through `fencedFirestore` in the existing Admin
factory. Its supported transaction, document mutation and batch operations read
the control **inside the committing transaction**. Firestore serializes this read
against an operator's control change. A transaction already holding the old open
control may commit before closure completes; closure is not complete until that
control write has committed and in-flight work is drained. Do not use request
start time as the freeze boundary. BulkWriter and recursiveDelete are rejected.
The wrapper covers the operations the repository currently uses, not every Admin
SDK API. Review new mutation paths and SDK methods before introducing them.

HTTP mutation endpoints also preflight the control. Verification and notification
side effects recheck immediately before transport, including their expected
reopening epoch. **A Firestore transaction cannot atomically cancel an external
email/payment/Auth request.** The operator must disable side effects and drain
in-flight processes before declaring the migration frozen.

## Publication contract

Original CRM documents keep their IDs, relationships and private data. A separate
`publicationRecords/{collection}/records/{id}` stores durable publication state,
the exact approved view, provenance and reviewed source/projection fingerprints
where applicable. Its history subcollection stores reviewer/hash/revision metadata,
not extra copies of private notes.

- Missing metadata and newly admin-created sources default to withheld. Ordinary
  admin saves never create or regenerate a portal projection, including timeline
  visibility flags and offer-sent status changes. Saving these flags alone is no
  longer a publication authorization.
- An existing approved view remains the last reviewed snapshot on ordinary private
  edits; state becomes `review_required`. Public text, nested maps, previews,
  financial values and references do not refresh from the original automatically.
  Private review objects never supply `clientProjectSummary`.
- Admins use **Review changes before publishing** at `/admin/publication`, enter a
  source path, review the exact candidate and deselect unsuitable fields/maps.
  Publication requires explicit confirmation, an active admin, an enabled existing
  Auth owner, same-owner relationships and an unchanged source fingerprint inside
  the transaction. Required identity/relationship keys cannot be omitted. A stale
  review must be loaded and reviewed again.
- Approval and replacement view commit atomically. Browser admins cannot publish
  approved views or approve legacy text through direct writes; the reviewed server
  path is required. Normal admin messaging remains an explicit send action on a
  reviewed conversation, with validated ownership/sender, a new source/view/receipt,
  and a preview derived only from that approved reply. It never regenerates the
  old subject, message history or preview from raw CRM content.
- **Withdraw portal record** atomically removes the derived view and persists a
  withheld state/history event. Private originals stay intact. Ordinary edits,
  notification discovery and reply attempts cannot resurrect that view. Timeline
  changes to private/health entries and draft-offer withdrawal also remove their
  existing derived view. Owner changes withdraw the old view instead of reassigning
  it automatically. A new explicit approval is needed to publish again.
- The first-reply paths use `/api/admin/conversations` to create a **new**,
  ownership-validated source plus a fixed safe envelope (generic title, empty
  preview, owner and validated links). Selected-record names, private subjects,
  summaries and old previews are not copied to that view. A private creation
  receipt binds idempotent retries to the active admin and exact request; existing
  legacy conversations cannot use this path. Sending the reply remains a separate
  explicitly authorized message operation. An interruption may leave an empty safe
  envelope; reconcile the IDs instead of duplicating or publishing source text.
- Client read-state updates preserve pending-review state and previous approval
  revision; they cannot clear an admin review hold. Notification eligibility now
  requires matching approved snapshot metadata, not merely a document's existence.

A field allowlist and the sensitive-word/type tripwires are **not a classifier for
all health information**. Human review of every selected free-text field, nested
map, reference link and preview remains mandatory. The review tool can omit whole
fields/maps; it does not rewrite original text. Structurally invalid legacy values
require separate reviewed curation, not a blind projection repair. Newly authored
client submissions may create their own strictly validated source/view/approval
pairs; health/readiness and admin fields remain excluded. That client-origin
permission cannot approve a pre-existing legacy source.

Existing portal views are not retroactively made safe by this code. Owner-scoped
reads intentionally retain approved views without per-document receipt lookups
(which would break larger portal queries at the rules access-call limit). Before
production cutover, inventory **every existing view**, confirm/review its exact
content and ownership or withdraw it. Unknown/unreviewed views are a NO-GO;
source-only legacy records remain private and absent until explicitly approved.

## Covered mutation inventory

| Path | Enforcement / behavior during maintenance |
| --- | --- |
| Browser originals: clients, consultRequests, membershipApplications, conversations, messages, projects, appointments, payments, creditLedger, membershipOffers, membershipOfferResponses, membershipChangeRequests, projectTimeline | Rules fence, including active admins; no deletes of originals |
| Browser portal projections, publication metadata, submission receipts | Rules fence, paired ownership/schema and fresh receipt epoch; cached source-only submissions rejected even when open |
| `/api/admin/studio-payments` POST: private manual recording and hosted tattoo orders | Preflight plus transactional fence; provider transport rechecks; private requests/audit/reference locks fenced; GET remains admin-only |
| `/api/admin/clients` POST: studio create/edit and reviewed consultation association | Preflight plus transactional fence; private audit/contact locks also fenced; GET reads remain available |
| `/api/admin/conversations` POST: new conversations for first replies | Preflight plus transaction; enabled existing owner and same-owner links, fixed safe envelope, idempotent private creation receipt; no legacy backfill |
| `/api/admin/messages` POST: all five reply workflows | Preflight plus transaction; reviewed conversation ownership, trusted sender, original/view/notification receipt and preview committed together |
| `/api/admin/publication` POST: approve/withdraw | Preflight plus source-bound transaction; GET review is admin-only and can remain available |
| `/api/auth/verification` POST | Preflight, reservation transaction and pre-transport epoch check; no send when closed; GET status remains readable |
| `/api/founder/profile` PATCH | Preflight and transaction; profile/campaign/admin-founder GETs are read-only |
| `/api/payments/checkout/founder` POST | Preflight before reservation/provider setup, transactional order/idempotency/rate-limit writes, pre-provider recheck; payments remain disabled |
| `/api/payments/webhooks/square` POST | Preflight and transactional event/financial/entitlement writes; 503 for retry during fence |
| `/api/internal/notifications` GET | Mutation endpoint despite GET: preflight and fenced generation/cursor/queue/lease/settlement writes; default mode stays off |
| `/api/webhooks/resend` POST | Preflight and fenced event/status/suppression transaction; transient/fence failures return 503, invalid signed input 400 |

**Uncovered by Firestore rules:** Admin SDK/service accounts, Cloud Functions,
scheduled tasks, Firebase Console/IAM operators, imports, extensions, external
integrations, payment systems and any old deployment that uses an unguarded Admin
SDK. This wrapper does not retrofit already running code or remote services.
The emulator-only migration/seed SDK is intentionally privileged operator tooling,
not a web endpoint. Production execution tooling remains separately unimplemented
and unauthorized. Storage writes have separate rules and must be inventoried/
paused operationally; this Firestore fence does not cover Storage or Auth APIs.

## Interrupted submissions and reopening

Consult and membership forms stage the source, conversation, initial message,
three portal views and publication receipts in **one atomic batch**, with an
immutable owner-scoped `portalSubmissions/{uid}/requests/{id}` receipt. Failure of
any part leaves no partial intake. Concurrent/uncertain retries read that receipt
and reuse IDs; only one submission commits. Session storage contains only the
pending synthetic/random ID, never form contents. Keep the page open on failure.
Do not clear browser storage or start a fresh submission while an uncertain receipt
is being resolved; if the local marker is lost, an admin must reconcile the receipt
before advising a client to resubmit. Separate browsers/new intentional submissions
have separate IDs; this is not a contact deduplication/merge operation.

Every browser publication receipt binds to the open epoch. A queued old batch
cannot commit after reopening into a different epoch. SDK offline persistence is
not permission to bypass the rules. Modern clients fetch current state before
preparing a new attempt; old clients without the protocol must reload.
Conversation source updates also require the changed public/read-state values to
agree with the view, rather than allowing cached source-only preview changes.

Auth creation and Firestore commits cannot be atomic. All four signup flows check
the fence before calling Firebase Auth, but a raced/direct Auth registration may
still create an account while Firestore is closed. Keep that UID/password/session;
do not disable/delete/reset it or create another account. The client can sign in
and read approved history. After reopening, complete an absent own profile with
the same UID or submit a new paired intake. An existing private legacy profile
cannot be overwritten or auto-projected to repair a missing portal view.
Standalone new-message/view pairs remain atomic; an interruption between a message
pair and its separate conversation read-state/preview update can leave stale
preview/read flags. Reconcile IDs and approved message receipts, not raw legacy
message text. Existing original histories must not be regenerated or replaced.

Read-only synthetic late-write/publication reconciliation:

```
node scripts/local-command.mjs node scripts/reconcile-publication.mjs --frozen-at 2026-10-15T00:00:00.000Z
```

Use the actual **server commit** cutoff for a rehearsal; the example is illustrative.
The trusted runtime rejects non-demo projects/hosts, arbitrary runtimes and live
credentials. Reports contain paths, state and counts, not contact details or text.
Unknown views, missing sources, policy conflicts, withheld/no-view sources and
pending review remain separate. Millisecond cutoff equality is conservatively
flagged as potentially late; a future production adapter must retain exact
Firestore timestamp precision and obtain the cutoff from the committed control.
There is no auto-repair or publication option. The updated migration rehearsal
creates matching reviewed metadata with each approved view and refuses restart/
rollback if a later publication changed ownership of the migration's approval.

## Owner checklist and approval gates (outside Codex, later approval required)

1. **Review this PR first.** Confirm the intended user-facing change: studio saves
   require a separate publication review; admin replies require a reviewed
   conversation. Do not deploy this rules/frontend change piecemeal into an open
   production backend. Identify the owner, operator, reviewer and abort authority.
2. **Recovery gate — NO-GO until complete.** Blaze, 7-day PITR and daily 7-day
   backups are owner-reported settings. The first completed backup has not been
   verified here. Wait for a completed backup, verify its recovery scope/retention,
   and demonstrate an isolated restore outside Codex. Include Storage and protect
   Auth/configuration evidence; Firestore backups do not back up Auth or Storage.
   No Auth UID/session migration is required for this in-place rollout.
3. **Inventory gate.** Use the read-only production inventory checklist to verify
   Vercel Production's real project, actual rules/indexes, every writer/service
   account, existing portal views and record counts. Do not infer deployed policy
   from Git. Approve a protected source/view manifest and reviewed holds; no real
   artifacts belong in this repository or Codex.
4. **Privileged-writer gate.** Inventory every service account and human IAM writer.
   Disable/drain old server deployments, function triggers, schedulers, extensions,
   imports, external integrations, notification workers, email verification sends,
   checkout/subscription creation and payment/Resend callbacks. Do not disable Auth
   users or reset passwords. Confirm no other operator is editing data. Restrict
   privileged write IAM to the named migration operator where feasible.
5. **Webhook gate.** Returning 503 invites provider retry, not indefinite durable
   retention. Agree a maintenance duration within provider retry limits and a
   protected capture/replay/reconciliation procedure outside Codex. If events cannot
   be reliably retained/replayed, do not start. Never acknowledge an unrecorded
   financial event as processed; preserve idempotency journals and amounts.
6. **Fence gate.** With side effects disabled and writers drained, the owner must
   separately authorize deploying the reviewed fence/privacy rules and compatible
   frontend. Prepare the valid maintenance document through IAM, keep it closed,
   and install the rules while closed. Missing control also denies writes. The
   repository rules do nothing to the currently deployed policy until that separate
   deployment occurs. Once installed, verify direct SDK/REST and browser-admin
   writes fail, safe owned-view reads work, and private originals are unreadable.
   Safe empty/withheld portal history can be expected until reviewed views exist;
   never relax privacy rules for an old reader. Record the committed control
   timestamp/epoch and verify source counts/write timestamps have stopped changing.
7. **Consistent inventory/backup gate.** Capture the final fenced inventory and a
   recoverable pre-migration snapshot; retain exact server timestamps, monetary
   values, original IDs/UIDs and relationships. Verify late writers again. Any
   unexpected source write is an abort and investigation, not an automatic backfill.
8. **Adapter/review gate — still a blocker.** A separately reviewed production
   adapter must enforce the closed fence/epoch, least-privilege IAM, source/owner/
   reviewer hashes, destination conflicts, restart journals, exact reconciliation
   and safe rollback. The emulator runtime must never acquire a live switch.
   Approve only reviewed projections; private health/admin notes, free-text
   summaries, references and legacy message/previews remain withheld by default.
9. **Verification gate.** With the fence closed, compare originals and Auth inventory
   before/after; test existing and newly registered accounts, wrong-owner denials,
   absent profiles, selected conversations, messages, projects, appointments,
   financial amounts and manually managed studio records. Match every approved
   projection/receipt to the manifest. Prove queued old-epoch writes fail. Resolve
   all errors, unexpected views, ownership uncertainty and late writes. Confirm
   correct Production indexes and authorized Firebase action/return domains outside
   Codex. No notification activation is implied.
10. **Reopening gate.** Owner and reviewer explicitly authorize reopening only after
    all checks pass. Keep email verification delivery, Resend, payments/subscriptions
    and scheduled delivery disabled. Set `state: "open"` with a **new unique epoch**
    via IAM. Modern protocol-1 clients may write; cached source-only/old-epoch writes
    must still fail. Monitor receipts, errors and reconciliation counts. Re-enable
    each privileged writer only after independent review proves its fence/publish
    behavior and replay safety. Email/payment activation needs separate approval.

## Rollback / abort

Before reopening, keep the maintenance state closed and side effects disabled.
Abort on late originals, unknown ownership, missing recovery evidence, conflicts,
changed reviewed content, unexplained counts or exposed private information.
Withdraw only run-owned, hash-matching projections; retain durable withheld
metadata and history. The emulator rollback refuses later independently approved
views and leaves originals/Auth/financial records intact. An edited view requires
review, not a force rollback.

After reopening, close with a fresh epoch, drain privileged work again, inventory
new valid submissions/messages and reconcile before withdrawing affected views.
Keep new valid original records and payment journals. Do not restore an old global
backup over newer business data as routine rollback. Do not roll back to broad
original-document reads or an old frontend that depends on them. Serve the safe
maintenance/portal-empty experience and retain the strict privacy rules. A source
restore or rules/frontend rollback requires a separate approved recovery plan.
A later reopening must again pass the gates and use another unique epoch.

## Remaining production prerequisites

No live operation is authorized. Missing evidence includes a completed/restored
backup, deployed-rule/index/writer inventory, externally protected artifacts,
production-only adapter implementation/review, least-privilege operator IAM,
privileged shutdown/drain and durable callback replay procedure. Operator needs
explicit scoped Firestore reads plus control/view/policy/journal writes and view
withdrawals, Firebase Auth read access for identity checks, and separately scoped
backup/restore/Storage permissions; do not grant browser admins service credentials.
Production Vercel settings must continue to use `fawcett-website-sandbox`; changes
require owner approval outside Codex. No new secret is needed in development.


Phase 6B adds the [isolated operator procedure](migration-operator-procedure.md).
Its production factory is disabled; no production adapter activation, access or
migration is authorized. The new emulator-only operations add immutable complete
scope, per-record human approvals, authenticated operation grants, transactional
fence checks and durable apply/withdraw journals without weakening this runbook.
