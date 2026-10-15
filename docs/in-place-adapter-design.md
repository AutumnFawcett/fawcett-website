# In-place operator adapter — design for separate implementation review

> Phase 6B: [isolated operator implementation and procedure](migration-operator-procedure.md)
> now provides emulator-only execution, immutable scope, separate grants and journals.
> The production factory remains disabled; the production-specific design and
> independent activation/security-review requirements below still apply.

> Phase 6A development update: [enforced fence and publication controls](write-fence-publication-controls.md)
> supersedes earlier repository gap descriptions and cached-source-only behavior.
> The live rules/writers are unverified and no production operation is authorized.


**Design only. Not an executable production adapter.** Production stays in
`fawcett-website-sandbox`; `fawcett-website` is untouched. Keep
`lib/migration/runtime.mjs` and `.env.example` demo-only. Do not add a production flag
or pass real project values to `migration:rehearsal`.

## Execution boundary

A future separately reviewed operator package/runtime outside Codex must hard-bind
an independently verified production project number/ID and database ID. Reject
emulator endpoints in that production runtime, arbitrary project/database/credential
arguments, implicit ADC selection, shared development credentials, source mutations,
Auth mutations, bucket copies and cross-project references. A managed/short-lived
identity is preferable where supported; IAM must be reviewed for the actual runtime.
Do not ship this operator as a public website route or client/admin-browser utility.
The server-only studio management API is not a migration authorization mechanism.

Use distinct read-only inventory/plan, approved apply and approved withdrawal modes.
Inventory/plan should have no write permissions. Apply cannot deploy rules, alter IAM,
create Auth accounts, modify originals/relationships/timestamps, migrate projects,
change roles, send messages or recompute payments. Withdrawal cannot delete originals,
Auth, studio files, financial histories or arbitrary existing views. Use an explicit
operation allowlist and journal/hash checks even when IAM permissions are broader.
Rules release, backup restore and Vercel deployment remain separate operator jobs.

## Review contract

Extend the Phase 3 manifest through a **new, explicitly versioned production schema**;
do not weaken its existing `syntheticOnly`/demo validation. Bind:

- Verified project number/ID/database; reviewed app/rules/adapter commit hashes.
- Immutable run ID and whole manifest digest, protected backup/watermark and evidence
  of the approved write fence and run scope. Operator/owner/reviewer identities,
  timestamps and an explicit apply/withdraw authorization with bounded lifetime.
- Complete paginated inventory counts/collection/subcollection scope and every
  approved path, explicit Auth UID, full typed source digest, exact candidate digest,
  independent ownership/content attestations and reviewed relationship destinations.
- Policy for every existing view: conflict by default; only exact journal-owned
  committed values can be resumed. Unknown paths/IDs/types/claims are withheld.
- Writer/content review: future public source fields (including legacy review-derived
  client summary and free-text links) must be reviewed or durably held. Do not use a
  one-time projection omission as permanent redaction; do not rewrite original messages.

No email/document-ID ownership inference, approve-all, scanner override, unsigned
editable approval changes in place or source/view overwrite switch. Require an
independent review step before apply. Detect expired/revoked approval/fence evidence;
a manifest string alone cannot prove an actual maintenance fence. New version/source
changes require a new review, not a force/resume flag.

## Algorithm and failure behavior

1. Read-only inventory across the approved scope with paging and hard completeness
   limits; reconcile unknown collections/subcollections with the owner's inventory.
   Phase 3's 13 mapped roots plus studio counts is not exhaustive discovery. Keep
   sensitive source contents out of logs. Preserve typed timestamps, references,
   bytes and unsupported-type dispositions; do not hash via lossy JSON.
2. Verify intended Auth UID exists/enabled, explicit profile-ID policy, linked source
   ownership and active reviewer/operator authority. An existing account must not be
   recreated or relinked. A disabled/missing/ambiguous owner is withheld, not repaired.
3. Build exact allowlisted candidates under the approved content/writer policy.
   Exclude internal/health/admin/staff/bookkeeping metadata and reviewed sensitive
   legacy text. Human review remains necessary; no keyword filter proves confidentiality.
4. Preflight the entire immutable manifest. Errors/missing approvals/unknown existing
   views stop apply; deliberately withheld records are separately counted. Preserve
   the private report and verify output storage before writes.
5. Under the verified fence, run one Firestore transaction per approved record. Re-read
   the unchanged source, all relevant linked owners/role state, journal/run identity
   and destination. Require exact approved source/candidate digests. Atomically create
   only the view plus immutable run/journal evidence. No original/source update.
6. Recheck accounts/operator approval near each transaction and after the run. Auth
   and external approval/fence evidence are not in a Firestore atomic snapshot; use
   operational fencing/rechecks and stop on changes. A failed/expired fence stops
   processing; do not presume Firestore transactions solve cross-service authority.
7. Resume only the same manifest/run: unchanged source + exact committed journal/view
   means already-committed, with no duplicate write. Missing/changed view or source,
   different manifest, conflicting role/owner or terminal withdrawn state is an error.
   Journal successful earlier records on partial failure; never erase evidence to retry.
8. Reconcile original path/value hashes, Auth identity invariants, exact timestamps,
   amounts/aliases/currencies/negative credit entries, links, publication counts and
   withheld reasons. Report eligible/withheld/error/created/already-committed/withdrawn
   states per path/collection and all missing/late inventory differences. Do not
   silently count approved missing records as ordinary withholding.
9. Withdraw only run-created views with matching committed hashes, retaining source,
   Auth and all audit/journal evidence. Detect later admin/client edits and stop rather
   than deleting them. Mark withdrawals; repeat is idempotent. Republish only with
   new review after a terminal withdrawal. Keep privacy rules and compatible frontend.

Original timestamp fields and document server metadata should not change because
originals are never written. New views/journals have normal new create/update metadata.
The source is not moved or exported into development. Any source repair/redaction,
late-write backfill, studio association correction or account linking needs separate
scope/approval and audit; none is automatic migration behavior.

## Required implementation evidence before Gate 2 can pass

- Independent review of project/database/IAM binding and all adapter operation paths;
  scoped plan/apply/withdraw authority, approval expiry/revocation and protected logs.
- Production-capable typed inventory/digest and complete bounded scan, existing-view
  conflict handling, durable reports/journals, interruption/resume and concurrent-edit
  tests; keep emulator guards unchanged.
- Verified maintenance/version enforcement including cached direct SDK clients,
  source-only intake and Admin SDK jobs. A supported fence and late-write review
  must be demonstrated; no such production fence is delivered in Phase 4A.
- Ongoing writer policy for reviewed legacy summaries/free text/links; tests must
  prevent later ordinary edits from republishing unreviewed content.
- Restorable backup with independently reviewed recovery point/objectives and a
  post-backup delta strategy, outside Codex; actual indexes and rules/frontend
  compatibility; side-effect suppression for all writers/triggers.
- Controlled approval fixture tests for existing sessions, new registrations, wrong
  users/roles, missing views, privacy withdrawal, no source/Auth changes and exact
  financial/timestamp preservation. Real session cookies/providers/cache behavior
  still require approved owner verification outside Codex.

Phase 4A adds same-project synthetic cutover/session regressions to the existing
Phase 3 suite. That demonstrates the intended read boundary and existing helper
behavior; it does not implement or certify this future production operator.
