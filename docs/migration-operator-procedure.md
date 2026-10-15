# Phase 6B — migration operator preparation and operating procedure

**Development implementation only. Production execution is disabled.** This is
not permission to access Firebase production, request credentials, migrate data,
deploy rules/frontend/functions, alter Vercel, enable delivery/payments or merge.
The data-bearing production project remains `fawcett-website-sandbox`.
`fawcett-website` stays untouched. All executable steps below use fictional data
in `demo-fawcett-dev` emulators, database `(default)`.

## What has been built

`operator/` is isolated from the Next.js app and browser code. Its algorithm uses
the Phase 3 typed fingerprint/projection primitives, the Phase 4A review contract,
and Phase 6A durable publication metadata and fence semantics. It does not change
the old rehearsal's demo guards, application writers or checked-in rules.

The runtime accepts an explicit, exact demo project/database identity and fixed
intended-production metadata. Unexpected projects/databases, arbitrary runtime
objects, remote emulator endpoints, cloud credentials and extra options fail.
`createProductionOperator()` always throws before initializing a Firebase client.
No flag or environment variable can enable it. A future production implementation
and activation need a separate feature/security review and owner authorization.

The capability boundary can read known source collections, mapped destinations,
roles, the fence and authorization/run records. It cannot write originals,
relationships, Auth users/passwords/claims, admin roles, authorization grants,
financial histories, notification configuration, Storage or arbitrary documents.
Writes are confined to manifest-approved portal views, their publication metadata,
and the immutable run/per-record journal. Only journal-owned derived views can be
deleted. There is no force/overwrite/approve-all or cross-project operation.

### Separate operations

| Operation | Result | Writes |
| --- | --- | --- |
| `inventory` | Bounded paginated hashes, document versions, known collection names and dispositions | None; usable when open/missing control, marked non-frozen |
| `prepare-manifest` | Draft scope with **every record withheld** | New private local artifact only |
| `prepare-approval` | One explicitly selected candidate, source/candidate/account hashes; confirmation flags remain false | New private local review artifact only |
| `prepare-authorization` | Exact-manifest, operation-specific grant draft with **enabled false** | New private local artifact only; cannot issue its own grant |
| `apply` | Transactional approved views, publication policy and durable run/journals | Explicit separately issued grant, authenticated operator and verified closed fence required |
| `reconcile` | Eligible/withheld/committed/withdrawn/errors and frozen-source/destination differences | None; no repair or bulk publication |
| `withdraw` | Remove only unchanged run-owned views; retain withheld metadata and journals | Its own fresh withdrawal grant and closed fence required |

The enforced budgets are 5,000 source records, 10,000 mapped destination/policy
records, 500 approved records and 4 MiB per CLI input artifact. Exceeding any budget
stops execution; it does not silently truncate or approve a partial inventory.

Known source inventory includes the 13 projection roots, private studio files and
admin records, authoritative payment/order/webhook/founder collections, studio
association/duplicate state, verification limits, notification metadata/queues and
legacy migration-run roots. Private-only roots are fingerprinted and withheld;
they never become portal candidates. Reports include exact document create/update
seconds and nanoseconds, not lossy timestamp conversions or copied source text.

Unknown root collections and any discovered, unexpanded source subcollections
block executable approvals. They require separately reviewed scope expansion;
there is no ignore switch. Unsupported Firestore values are disclosed/withheld,
not coerced to strings or copied. Orphan/unknown mapped destinations and existing
views without this run's exact journal ownership are conflicts. Existing withheld
policy records may be replaced only after explicit new review and exact baseline
hash/version checks. Existing unrelated views are never taken over.

## Manifest and authorization contract

Schema version 2 binds the exact demo project/database, intended production ID,
adapter version, immutable run ID, whole frozen inventory and its digest. Every
inventory record has one explicit approved or withheld decision; omitted/duplicate
paths are invalid. Approval requires a nonempty scope, exact typed source and
candidate hashes, explicit selected fields, original client UID, Auth identity
hash (UID, enabled state, account creation identity), owner/content confirmations,
and the independent reviewer UID. The candidate is reconstructed from the
unchanged source; it is never supplied as editable replacement content.

An old UID deleted and recreated as a different Auth account is a conflict.
Ownership is never inferred from an email address/name or repaired by account
creation/linking. Missing/disabled/ambiguous owners and cross-client/missing links
stop publication. Legacy messages additionally require an identifiable sender and
consistent conversation links; an admin sender must remain active/enabled.
Studio-managed records remain private and never create Auth accounts.

Field allowlists exclude readiness/health/admin/staff/bookkeeping fields and
private review-derived summaries. Type and sensitive-word tripwires are additional
rejections, **not a confidentiality classifier**. Humans must inspect every
selected free-text field, nested map, preview, reference link and message. Whole
fields/maps may be omitted; required identity/relationship fields cannot. Related
records are not automatically approved just because their owner matches. Consider
how withheld related views will affect a client's otherwise approved history.

Evidence binds separate owner, reviewer and operator identities, bounded review
lifetime (maximum 24 hours), reviewed app commit/rules hash and protected backup,
privileged-writer shutdown and callback-replay evidence IDs. **Identifiers and
flags are attestations, not machine-verified backups, IAM, deployed rules or proof
that three UIDs represent independent humans.** Real evidence must be verified and
retained by the owner/reviewer outside Codex before a production adapter is enabled.

The separately issued Firestore `migrationOperatorAuthorizations/{grantId}` record
binds the manifest hash, run/project/database, actual operator UID, operation,
owner/reviewer UIDs, exact closed-fence epoch/hash/document version, enabled state
and bounded activation/expiry window. The CLI authenticates the operator using a
private **synthetic Auth emulator ID-token file**, not a self-declared actor name.
Browser admins cannot create grants or operator journals under the current rules.
The adapter cannot issue, edit or activate its own grant.

Each writing transaction re-verifies the operator, active/enabled authority,
grant, current closed fence, source versions/hashes, owner identity and linked
owners. Fence/grant/role document reads participate in the committing transaction;
a concurrent revocation/change serializes before or after that commit. Expiry is
checked again before writes. Auth and wall-clock expiry cannot be atomically
locked with Firestore commit; leave deadline margin, freeze privileged Auth
writers, drain processes and retain an abort authority. No cross-service atomicity
claim is made.

A source/view/policy/journal commit is atomic per record, not a database-wide
transaction. Earlier successful records remain journaled if later work stops.
Preflight and postflight compare the entire declared frozen source inventory;
per-record transactions additionally check approved source/link state. Privileged
unrelated edits during a run may be detected after earlier views commit. They
invalidate the final report, not the source data; stop and reconcile, never
silently continue or auto-rollback someone else's later work.

The journal stores exact source/candidate digests, original apply grant hash/version,
verified operator and fence evidence. Withdrawal adds its separate authorization
without erasing apply evidence. Destination ownership uses exact Firestore document
commit versions alongside content/policy hashes. Later client/admin changes or
reapproval conflict even if the visible content is identical. Immutable run roots
cannot be edited to extend review, swap records or resume a different manifest.

## Synthetic operating walkthrough

Do this only in a fresh disposable demo emulator session. Test suites clear the
fictional database and stop their emulator processes; do not mix them with
interactive work or run suites concurrently. No production credential is needed.

1. Start `npm run emulators`. In another terminal in the repository, prepare known
   fictional Phase 3 records and three fictional operator identities:

   ```sh
   node scripts/local-command.mjs node scripts/seed-operator-fixture.mjs SYNTHETIC_OPERATOR_SETUP_ONLY /tmp/fawcett-operator-demo
   ```

   The directory must not exist. It is mode 0700; artifacts/token are mode 0600.
   Setup opens/closes only the demo fence, creates only known fictional fixtures,
   and produces `inventory.json`, `evidence.json`, `manifest-draft.json`,
   `client-review.json` and `operator-token.txt`. All decisions remain withheld,
   candidate review flags are false, and **no grant is issued**. Evidence IDs are
   clearly synthetic placeholders, not real backup/shutdown evidence.

2. Review `client-review.json` privately. For a demo, copy the draft to a new
   mode-0600 `manifest-reviewed.json`; retain its inventory/evidence unchanged.
   Replace only that client's withheld decision using its exact `path`,
   `sourceHash`, `candidateHash`, `fields`, `clientUid` and `accountHash` from the
   review artifact. After personally reviewing ownership/content, set
   `state: "approved"`, `ownerConfirmed: true`, `contentReviewed: true` and
   `reviewerUid: "operator-reviewer"`. Keep every other record withheld. Do not
   put candidates/tokens/manifests into Git or chat. A reviewer/owner must inspect
   the complete manifest; treating generated drafts as approvals defeats the gate.

3. Prepare a disabled grant draft with a new report filename:

   ```sh
   npm run operator:synthetic -- prepare-authorization --project demo-fawcett-dev --database '(default)' --manifest /tmp/fawcett-operator-demo/manifest-reviewed.json --for-operation apply --report /tmp/fawcett-operator-demo/apply-authorization.json
   ```

4. A **separate fixture-owner action**, outside the adapter, reviews the draft and
   installs it as an enabled demo-only grant. The following is only a privileged
   emulator simulation, not a production authorizer:

   ```sh
   node scripts/local-command.mjs node --input-type=module <<'JS'
   import fs from 'node:fs/promises';
   import { createRehearsalRuntime } from './lib/migration/runtime.mjs';
   const draft = JSON.parse(await fs.readFile('/tmp/fawcett-operator-demo/apply-authorization.json', 'utf8'));
   if (draft.syntheticOnly !== true || draft.identity.projectId !== 'demo-fawcett-dev' || draft.identity.databaseId !== '(default)' || draft.enabled !== false || draft.operation !== 'apply') throw new Error('unexpected_fixture_grant');
   const runtime = createRehearsalRuntime();
   try { await runtime.firestore.doc('migrationOperatorAuthorizations/demo-apply').create({ ...draft, enabled: true }); }
   finally { await runtime.close(); }
   JS
   ```

   This raw demo SDK simulates the separately authorized IAM owner; production
   needs independently reviewed workload identity/IAM and grant issuance. Never
   add a general grant uploader or production flag to the rehearsal/website.
   Preserve the reviewed grant artifact; use a new grant ID for renewals and
   retain revocation evidence rather than overwriting historical approvals.

5. Apply with the independently created grant and new protected report:

   ```sh
   npm run operator:synthetic -- apply --project demo-fawcett-dev --database '(default)' --manifest /tmp/fawcett-operator-demo/manifest-reviewed.json --grant-id demo-apply --operator-token-file /tmp/fawcett-operator-demo/operator-token.txt --limit 1 --report /tmp/fawcett-operator-demo/apply-1.json
   ```

   `--limit` bounds new mutations, not already-committed checks. Partial/error
   runs exit nonzero with pending/error counts. Retry the exact same immutable
   manifest and active grant with a **new** report filename; committed records are
   verified and skipped. An ambiguous/crashed CLI response is not permission to
   delete the journal or generate new IDs. Reconcile first. Reports expose codes,
   paths, hashes and counts; stdout contains only operation/count summaries.

6. Reconcile independently, with no operator token or write grant:

   ```sh
   npm run operator:synthetic -- reconcile --project demo-fawcett-dev --database '(default)' --manifest /tmp/fawcett-operator-demo/manifest-reviewed.json --report /tmp/fawcett-operator-demo/reconcile-1.json
   ```

   Compare `scopeRecords`, `globalErrors`, eligible/withheld/created/committed/
   withdrawn/pending/error counts and durable journals. Reconciliation does not
   publish missing views. Inventory, preparation and reconciliation cannot issue
   grants or modify source data. Non-frozen inventory cannot authorize apply.

7. For withdrawal, prepare a **new disabled authorization** with `--for-operation
   withdraw` and a new report path. The owner separately installs an enabled
   `demo-withdraw` grant using the same demo-only owner pattern, checking operation
   `withdraw`. Then use `withdraw` with the same manifest, the withdrawal grant,
   token file and another new report filename. Repetition is idempotent. Only the
   run's unchanged views are removed; withheld metadata and journals remain.
   Sources/Auth/financial histories remain untouched. A new closed epoch may
   authorize withdrawal through a fresh grant; it cannot authorize old apply work.

Input JSON/token files must be private regular files (no final symlinks), at most
4 MiB. Outputs are exclusively created and synced before any database write;
existing reports are never overwritten. A full disk/permission failure, changed
input or unavailable report stops execution. A crash after a DB commit can still
leave an incomplete local report: durable journals and a new reconciliation report
are authoritative. Filesystem ACLs/retention/encryption require a separate review
for a future production operator host.

## Abort, recovery and rollback

Stop on identity/database mismatch; invalid/open/missing/changed fence; missing,
expired, revoked or mismatched authority; incomplete review; changed source,
account identity, links, inventory or unknown scope; existing/unowned destinations;
changed policy/journal/run; invalid content/types; report failure; or inconsistent
counts. There is no force flag and no original-data repair fallback.

Keep the fence closed and all side effects disabled. Preserve the exact manifest,
protected grant/report artifacts and durable journals. Reconcile before retrying.
If the manifest/grant is still valid and the inventory unchanged, retry the same
run; per-record atomic commits avoid partial source/view/journal pairs. Otherwise
stop for owner/reviewer investigation. Expired manifest reviews cannot be extended
in place. A fresh independent withdrawal grant can withdraw an expired apply run;
new publication needs a fresh review, inventory and **new run ID** after resolving
old destinations. Withdrawal is terminal for the old run.

Withdrawal preflights the original inventory and requires matching source and
run-owned destination versions. New client writes or later admin approvals are
conflicts, not deletable migration leftovers. After reopening, close again with a
new epoch, drain writers, account for new legitimate records and obtain new
withdrawal authorization. If sources/views changed, the generic withdrawal stops;
a separately reviewed recovery/targeted privacy-withdrawal plan is required. Do
not erase new work, recreate Auth accounts, reset passwords or restore a global
backup over newer business data as routine rollback. Keep strict privacy rules
and the compatible maintenance/empty-history experience.

## Production activation gates — all remain NO-GO here

1. Review this feature PR without automatically merging. Security-review the operator
   package, fingerprints, capability paths, account binding, journals, CLI/artifacts,
   grant issuance and conflict behavior. The app/rules remain the merged Phase 6A
   implementation; its owner runbook still applies.
2. Outside Codex, independently verify the live `fawcett-website-sandbox` project ID
   **and project number**, exact database ID/region, deployed rules/indexes, Vercel
   identity, Auth providers/domains/action links, Storage and all existing views.
   `fawcett-website` is not a destination. No live verification was performed here.
3. Verify a completed protected backup and isolated restore, recovery point/objectives,
   PITR/backup retention and post-backup delta handling. Owner-reported Blaze/PITR/
   daily backup settings alone are insufficient. Firestore backups do not contain
   Auth/Storage. Protect Auth/configuration/Storage recovery evidence outside Codex;
   this in-place operation does not export/import or recreate Auth accounts.
4. Inventory and pause **every privileged writer**: old/immutable Vercel deployments,
   Admin SDK hosts, Functions/triggers, scheduled jobs, imports, extensions, external
   integrations, IAM console operators, privileged Auth/Storage writers, email
   verification, Resend workers and Square/subscription creation. Firestore rules
   cannot stop privileged SDK writes. Disable/drain these writers before declaring
   the fence effective; do not disable client accounts or reset passwords.
5. Arrange protected provider callback capture/replay and finite retry-window limits.
   The Phase 6A 503 behavior requests retry; it is not indefinite durable retention.
   Preserve payment event/idempotency journals, provider IDs, monetary amounts and
   uncertain email outcomes. Do not acknowledge an unrecorded financial event as
   processed or replay sends/payments blindly. If replay cannot be assured, abort.
6. Separately review/implement a production-only runtime on an isolated operator host:
   explicit verified project number/ID/database, authenticated managed/short-lived
   operator identity, approved IAM, production rejection of emulator endpoints,
   credential selection with no ambient-project fallback, protected artifact storage,
   independent grant issuer and bounded authority. Do not enable the current demo
   factory or add a production switch to Phase 3. No production credentials belong
   in Codex. A new code review plus explicit owner activation is mandatory.
7. Complete source/subcollection/orphan discovery outside Codex. This bounded adapter
   scans existing parent documents in known roots; it does not certify discovery of
   documents beneath missing parents or unknown nested portal namespaces. Unknown
   roots/discovered unexpanded subcollections block execution and require reviewed
   scope expansion. Unsupported types/legacy IDs require reviewed handling, never
   coercion. Production completeness remains a blocker, not an inferred guarantee.
8. Under separately approved maintenance/rules/frontend controls, obtain the final
   closed-fence commit version, consistent inventory and recoverable snapshot.
   Review every approved UID/source/candidate/message/reference and existing view;
   bind authentic backup/writer/callback artifacts to the immutable manifest/grant.
   Verify operator/owner/reviewer independence, clock/deadline margins and indexes.
9. Execute only after explicit owner approval, independently reconcile exact source
   bytes/versions, Auth identity invariants, links, timestamps, amounts/aliases and
   projection/hold/error counts. Verify wrong-owner/private-original denials and
   existing/new-account behavior. Resolve all errors and unexpected destinations.
10. Reopening is another signed decision with a new fence epoch. Test cached old-epoch
    and source-only denials, preserve partial signup UIDs, monitor and re-enable each
    privileged writer only after individual review/replay verification. Notifications,
    email verification delivery, payments/subscriptions and schedules stay disabled
    until their own approval; this adapter never activates them.

The production factory, actual IAM/grant governance, exhaustive discovery/unsupported
scope handling, real backup/restore/callback evidence, live index/rule/cache/session
verification, deployment and execution are intentionally **not approved or enabled**
by these synthetic results. No real record or production service was accessed.


A future privileged service identity may have broader Firestore IAM permissions
than this collection allowlist. The capability guard is application enforcement,
not a security boundary against a compromised operator process or someone running
a different Admin SDK program. Review the actual IAM granularity, immutable pinned
operator artifact/host, independent grant issuer and tamper-resistant audit storage;
do not claim that Firestore Security Rules restrict that privileged identity.
