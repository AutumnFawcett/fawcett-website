# Phase 3 — approved projection rehearsal

## Audit and scope

This branch starts from `codex/fawcett-current-work` including merged #32–#34.
The Phase 1 privacy plan and Phase 2 studio-management guide were reviewed against
current helpers, server writers, rules, Firebase config and tests. This phase adds
only emulator tooling/tests/docs and npm scripts. It changes no production
configuration, app workflows, projection allowlists or rules. It performs no live
inventory, backup, migration, deploy, payment or notification operation.

The tool is deliberately **not production executable**. It binds only
`demo-fawcett-dev`, `(default)` database, Firestore `127.0.0.1:8080` and Auth
`127.0.0.1:9099`. Missing/remote endpoints, cloud credential bindings, live project
values, production mode and project overrides are rejected before data access.
There is no production-enable, project, credential, import or force flag. Only a
runtime constructed by the guarded factory is accepted. Do not weaken this guard.

[Owner's read-only inventory checklist](production-inventory-checklist.md) and
[deployment/rollback runbook](production-cutover-runbook.md) define future manual
gates outside Codex. An approved production adapter and enforceable maintenance
write fence are still blockers, not features silently enabled by this PR.

## Rehearsal fixture and results to expect

The seed creates only checked-in `.test` accounts and 22 fixed synthetic originals:
all 13 portal source categories, a sensitive legacy message and preview, a missing
UID, a cross-client link, another client's consultation, a health timeline entry,
a draft offer, an ambiguous payment and a private studio file. Private notes,
readiness, staff identities and financial references are intentionally present.
It does not create portal views. Repeated seeding accepts identical fixtures and
stops on conflicts rather than overwriting existing data.

The sample manifest approves only the 13 exact known synthetic safe originals.
Its generator compares every full source hash with the checked-in fixture before
issuing a sample approval. It will not approve a changed fixture, arbitrary
inventory or real data. Its fixed reviewer/date are synthetic example evidence,
not a real person's production approval. The synthetic seed accounts/password are
for local emulators only; manual studio-file creation creates no Auth account.

Expected fresh-fixture plan: **22 inventoried, 13 eligible, 9 withheld, 0 errors**.
First explicit apply: **13 migrated, 9 withheld**. An unchanged repeat: **13
already_migrated, 0 new writes**. Withdrawal: **13 rolled_back**; repeat withdrawal:
**13 already_rolled_back**. The rolled-back run cannot republish. Original source
hashes, exact IDs, UIDs, links, payment/credit values and stored timestamps remain
unchanged. A project summary embedded inside private `adminReview` is deliberately
not automatically derived/published by this migration.

## Local workflow — deliberate actions, no automatic apply

Use the existing safe `.env.local` based on `.env.example`; leave all six live
Firebase app values unset. No credentials/secrets are needed. Install with `npm ci`
if needed. Start Auth/Firestore in one terminal with the established `npm run
emulators` (which also starts local Storage). Do not start a second emulator on the
same ports. Run the following commands from the repository in a second terminal.
Use a NEW private temporary directory and new report filenames; reports are created
exclusively with mode 0600 and never overwrite a manifest or prior result.

```sh
mkdir -m 700 /tmp/fawcett-phase3-review
npm run migration:rehearsal -- seed-synthetic --confirm SYNTHETIC_ONLY
npm run migration:rehearsal -- sample-manifest --run-id synthetic-review-1 --confirm SYNTHETIC_ONLY --report /tmp/fawcett-phase3-review/approvals.json
npm run migration:rehearsal -- plan --manifest /tmp/fawcett-phase3-review/approvals.json --report /tmp/fawcett-phase3-review/plan.json
```

Stop and inspect the private plan and sample approvals. The default plan is read
only; neither npm installation, startup, build nor planning applies a migration.
A manifest with no approvals withholds every inventoried record. For other
synthetic cases, explicitly review the exact candidate and source, verified UID
and relationship ownership before constructing a matching per-record approval.
No approve-all/export/import operation is provided.

Only after that synthetic review, explicitly request application:

```sh
npm run migration:rehearsal -- apply --manifest /tmp/fawcett-phase3-review/approvals.json --confirm APPLY_APPROVED_SYNTHETIC_PROJECTIONS --report /tmp/fawcett-phase3-review/apply.json
npm run migration:rehearsal -- apply --manifest /tmp/fawcett-phase3-review/approvals.json --confirm APPLY_APPROVED_SYNTHETIC_PROJECTIONS --report /tmp/fawcett-phase3-review/resume.json
```

For a deliberate local withdrawal rehearsal:

```sh
npm run migration:rehearsal -- rollback --manifest /tmp/fawcett-phase3-review/approvals.json --confirm WITHDRAW_REHEARSAL_PROJECTIONS --report /tmp/fawcett-phase3-review/rollback.json
```

These commands cannot target production. Do not put real credentials or exports
into the directory. No CLI export of source documents exists. The tool prints only
summary counts; private reports contain source paths, state/reason codes and run/
manifest identity, not names, email addresses, private text, message bodies or raw
SDK errors. Paths, hashes and review metadata can still be sensitive outside a
synthetic exercise. Keep any future production evidence outside Codex.

## Approval contract and validation

A version-1 manifest binds `projectId`, `syntheticOnly: true`, a stable `runId` and
an explicit `approvals` list. Each approval contains:

- Supported two-segment original `path` and explicit `clientUid`.
- `reviewerUid`, `reviewedAt`, `ownerConfirmed: true`, `contentReviewed: true`.
- SHA-256 `sourceHash` of the entire canonical source and `projectionHash` of the
  exact candidate. Canonical hashing sorts object keys and preserves numeric/string
  differences and timestamp seconds/nanoseconds without JSON timestamp coercion.

Unknown options, private namespaces, duplicate approval paths, bad IDs and missing
attestations are rejected. At most 500 approved records/run and 5,000 inventoried
records are supported; exceeding limits stops rather than truncates. Inventory
uses pages of 100 across the 13 mapped root collections plus private studio files.
This is not a complete production collection/subcollection discovery tool.

The engine verifies actual enabled Auth accounts for both owner and reviewer, the
reviewer's active admin role, exact source/projection hashes, original profile-ID/
UID equality and each recognized source relationship's existence and ownership.
It recognizes both form and intake-dashboard source aliases. Message links must
agree with the conversation, and client senders must match their owner UID. Missing,
cross-client, unknown or disputed relationships stop publication. It never infers
identity from email/source ID or changes any relationship to make validation pass.

Candidates reuse the current allowlist, strip private review-derived content,
validate shapes/scalars/timestamps, require unambiguous cents/currency for payments
and ledger movements, and withhold drafts/private/health timeline entries. A
conservative text tripwire blocks obvious clinical/internal content in projected
strings. It cannot identify all sensitive language and may flag innocent wording.
Exact independent human content review is mandatory; approval is not permission
to override the tripwire. Unexpected or uncertain values remain withheld; no
redaction, timestamp rounding, money conversion or source rewrite occurs.

An approved record failing validation is an **error**, never a silently skipped
approval. Unapproved or deliberately nonpublic records are **withheld** with a
reason. The sample includes safe-but-unapproved records as well as unsafe ones.
This distinction makes partial history explicit to the operator.

## Transactions, reconciliation and recovery

Apply preflights the whole approved manifest and refuses a plan containing errors.
Each subsequent record transaction rechecks its source, linked owners and admin
role, then creates the new projection and run journal atomically. It never edits
originals or Auth and never adopts/overwrites a pre-existing view. The run root
binds the immutable manifest hash. A journal records path, source/projection hashes,
reviewer, commit state and server timestamp at
`migrationRuns/{runId}/records/{pathHash}`. These paths are default-denied to browsers.

Reports classify every scoped original as eligible/withheld/error for planning,
and migrated/already_migrated/withheld/error after apply. An approved missing
source produces an error row. Totals include these missing-approval error rows, so
retain both the complete record list and the approved inventory; do not compare
only one headline count. Row counts sum to report total. No financial amounts are
recomputed; regression tests compare exact stored values and full source hashes.

A crash may leave an intentionally partial run. Rerun the SAME manifest with a
new report: intact committed views are counted as already_migrated. If source,
reviewer, destination or manifest changed, stop and re-review. A per-record failure
is reported; successful earlier records remain journaled. Output files are reserved
before writes, but a disk/process failure can still interrupt report persistence;
recover by reconciling the journal and rerunning to a new report. Never erase
journals to force a retry.

Rollback requires a separate confirmation. It deletes only journal-owned views
whose current hash still matches the committed hash; it marks journal rows rolled
back and retains all evidence. It preserves originals, source payment data, Auth,
studio files and later edits. A conflicting later view is an error requiring manual
review. A missing journal is withheld, and a missing already-committed view can be
marked withdrawn. Rolled-back runs are terminal; use a newly reviewed run to
republish. Never restore unsafe original-read rules during a rollback.

Auth lookups are external to the Firestore transaction. Maintenance/writer fencing
and post-run verification remain required in any future production adapter; the
emulator exercise does not establish a cross-service atomic snapshot.

## Validation and remaining limits

`npm test` includes the separate `test:migration` step after existing integration
tests, preventing concurrent Auth-fixture interference. It starts only synthetic
Auth/Firestore emulators and tests default withholding, reviewed publication,
source preservation, exact financial aliases and timestamp precision, privacy,
UID/link conflicts, sensitive history, stale approvals, partial resume, conflict
rollback, disabled accounts, new signup, existing accounts, private studio files,
no automatic Auth creation and actual CLI gates/report permissions.

Run `npm run lint`, `npm run build` and `npm test`. Individual `npm run
test:migration` is available when no other emulator owns the ports. No dependency
or lockfile changes are needed. Existing deployment/index/Storage/real-data risks
and the manual production gates are detailed in the linked runbook. Passing this
rehearsal does not secure the current live database or authorize production work.

Reviewed local validation: **226 tests passed, zero failed/skipped** (15 environment,
102 payments, 79 Firestore privacy, 10 existing Auth/Firestore integration and 20
migration tests). `npm run lint` passed with zero errors and the three pre-existing
home-page image warnings. `npm run build` passed. The CLI test verified real private
report files, reviewed fixture counts, denied unconfirmed/existing-output/unknown-
project invocations, unchanged rerun counts and rollback counts. Emulator negative
authorization logs are expected assertions. No live policy/index/data condition was
validated by these checks.

Owner-confirmed cross-project direction: `fawcett-website-sandbox` → `fawcett-website`; development remains isolated. See the [cross-project approval plan](cross-project-production-plan.md) for Auth/password/session limits, destination collision policy, Storage mapping and additional gates. No live operation is authorized.
