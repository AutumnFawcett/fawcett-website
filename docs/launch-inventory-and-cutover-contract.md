# Phase 9A — launch inventory and cutover contract

Status: synthetic development preparation only, based on shared commit `a6ea36a`
(merged #41–#45). Production remains `fawcett-website-sandbox`; the separate
`fawcett-website` is untouched. No production access, credential selection, deployment,
settings change, real-data migration or payment/email activation is authorized.

## Versioned discovery contract

`operator/namespaces.mjs` is the authoritative **launch-namespaces-v1** path contract.
The operator version is **phase9a-v1**, inventory schema **2**. Older snapshots and
manifests must be regenerated/reviewed; never relabel them or force-resume an old
run with this adapter. Existing manifests remain immutable and journals preserved.
The only executable runtime remains the fixed `demo-fawcett-dev` emulators.

All original portal-capable source roots in `PORTAL_FIELDS`, plus `studioClients`,
remain included. The complete additional source/private roots are:

- adminUsers; paymentOrders, paymentTransactions, paymentWebhookEvents;
- founderProfiles, founderContributions, founderCounters, paymentCheckoutRequests,
  paymentCheckoutRateLimits;
- studioConsultAssociations, studioClientDuplicateLocks, studioPayments,
  studioPaymentRequests, studioPaymentReferenceLocks, studioPaymentRateLimits,
  studioVerifiedAccountLinks, studioProjectAssociations;
- schedulingConfig, schedulingControls, schedulingRequests, scheduleReservations,
  scheduleLegacySnapshots, schedulingPolicyAudit, schedulingHolidayPolicies;
- authVerificationRateLimits, adminConversationReceipts, notificationConfiguration,
  notificationScanCursors, notificationMessageReceipts, notificationQueue,
  notificationWebhookEvents, notificationSuppressions, migrationRuns.

Technical roots are portalRecords, publicationRecords, portalSubmissions,
operatorRuns, migrationOperatorAuthorizations and systemControls. These are also
walked, not silently omitted from discovery. Known nested collections:

| Parent pattern | Child | Classification |
| --- | --- | --- |
| studioClients/{id}, studioPayments/{id}, paymentOrders/{id}, schedulingHolidayPolicies/{id} | audit/{entry} | private-only |
| appointments/{id} | scheduleAudit/{entry} | private-only |
| publicationRecords/{source}/records/{id} | history/{entry} | private-only |
| portalRecords/{source}, publicationRecords/{source} | records/{id} | reviewed destination / private publication state |
| portalSubmissions/{uid} | requests/{id} | private receipt |
| operatorRuns/{run}, migrationRuns/{run} | records/{entry} | private journal |

Discovery uses Admin listCollections/listDocuments recursively, including missing
parents; ordinary queries alone cannot discover those paths. Missing expected
namespace containers (portalRecords/{source}, publicationRecords/{source}, and
portalSubmissions/{uid}) are explicitly distinguished from missing source/audit
parents. Unknown source names under known portal roots remain unrecognized.
Every encountered collection and document path is represented in the protected
snapshot, with existence, typed hash (or opaque/withheld), exact commit versions
and classification. No source document contents are included.

Classification meanings:

- review_candidate: known publication-capable original, eligible only for independent
  field/content/ownership review; this is NOT publication approval or proof of ownership;
- destination_review: existing client-visible view requiring independent content/ownership
  reconciliation; never mislabeled as private-only or silently approved;
- private_only: studio files, financial/control/receipt/journal/audit/history records;
  no candidate approval or migration-write capability is granted for these records;
- withheld: opaque/unsupported source value; never guessed, coerced or automatically approved;
- conflicting/missing_parent/unrecognized: blocked scope requiring investigation;
  orphan destinations, unknown children and unexpanded paths cannot be waived;
- container: expected absent namespace document, not a missing client/source.

These classifications describe migration/publication eligibility, not proof of
deployed read permissions. In particular, the minimal systemControls/writeFence
status is intentionally public-get-readable and must contain no private information.

Manifests still default every top-level source decision to withheld. Known private
children may coexist with an independently reviewed source; their contents are
never copied into its projection. Unknown children prevent executable approval.
All existing destination records require reconciliation, never silent adoption or
overwrite. Orphan destinations are explicit conflicts. Publication history is
inventoried, but is not a source for derived client-visible text.

## Completeness, interruptions and reconciliation

A result becomes complete only after two matching discovery observations and an
unchanged fence snapshot. Read errors, aborts, changed records/versions, new/deleted
paths and overflow return no executable partial inventory. Restart inventory from
the beginning; no persisted checkpoint can silently omit a page. SDK listDocuments
handles service pagination; the current emulator adapter bounds each collection
and the full discovered document/collection totals at 5,000 and depth at five
collection levels. Overflow stops, never truncates. This is not a production-scale
streaming/export adapter; production pagination/resource limits require review.

Reconciliation compares private nested hashes and commit versions as well as
originals. Source bodies, IDs, Auth accounts, timestamps, amounts and financial
history are unchanged by inventory. Operator grants and the current run’s journal have separate
transactional authorization/version bindings; their expected changes do not make
source discovery stale. Other runs’ journals and real namespace-container documents
remain compared; grant namespace changes are operational, while the exact active
grant is checked transactionally on each write. The fence has its own exact authorization check. Approved
top-level destination writes are reconciled individually; private publication
history remains part of the unchanged private inventory.

Two observations are not a substitute for pausing privileged writers: a Firestore
rules fence cannot stop Admin SDK/IAM activity or provide an atomic global snapshot.
The owner must establish and attest writer shutdown before a frozen inventory is
used. Late privileged changes remain abort conditions, not a reason to force apply.

## Private reports and aggregate formats

Detailed inventory/manifests/reconciliation contain sensitive paths, account IDs,
hashes and approval metadata. Keep them outside Codex/GitHub in the approved
operator environment. CLI files require new, bounded, mode-0600 artifacts; stdout
contains only operation/count summaries. Input/output artifacts are limited to
4 MiB; an oversized report stops instead of producing an unusable approval artifact. Existing detailed operations remain
available for authorized reviewers, not for public sharing.

`inventory-summary` and `reconcile-summary` are read-only CLI operations using the
same fixed demo identity checks. Example synthetic commands (new private output
paths required; the manifest is an existing synthetic mode-0600 artifact):

```sh
npm run operator:synthetic -- inventory-summary --project demo-fawcett-dev --database '(default)' --report /tmp/fawcett-inventory-summary.json
npm run operator:synthetic -- reconcile-summary --project demo-fawcett-dev --database '(default)' --manifest /tmp/fawcett-reviewed-synthetic-manifest.json --report /tmp/fawcett-reconciliation-summary.json
```

They write mode-0600 aggregate artifacts:

```json
{"schemaVersion":1,"kind":"inventory_aggregate","namespaceVersion":"launch-namespaces-v1","syntheticOnly":true,"complete":true,"frozen":true,"documents":0,"destinationsPendingReview":0,"reviewCandidates":0,"privateOnly":0,"withheld":0,"conflictingRecords":0,"missingParents":0,"unrecognized":0,"conflicts":0,"destinations":0,"stopped":false}
```

```json
{"schemaVersion":1,"kind":"reconciliation_aggregate","syntheticOnly":true,"counts":{"eligible":0,"withheld":0,"error":0,"created":0,"already_committed":0,"withdrawn":0,"already_withdrawn":0,"pending":0},"stopped":false}
```

These examples are shapes, not actual production counts. Counts overlap where
noted: destinations are also documents; issues count findings, not unique records.
Containers are not documents. Reconciliation counts top-level manifest decisions,
while discovery includes nested private records. Do not compare those totals as if
identical. Summary code uses output allowlists, never arbitrary paths/reasons/content.
Do not publish small sensitive counts without owner review. Summaries cannot replace
private record-level reconciliation, completeness evidence or human approval.

## Query/index contract

`operator/query-index-contract.mjs` exports **launch-queries-v1**, the reviewed
collection paths, filter/order signatures, implementation references and index
requirements. It covers admin inbox/source scans, owner projections, conversation messages, visible timeline,
duplicate arrays, associations/account links, tattoo purpose/client payment reports,
Square trusted-order lookup, Founder reports, audit ordering, notification queue,
ID paging, scheduler scans and missing-parent metadata enumeration.

Equality-only compound queries may use service-supported index merging; an equivalent
explicit composite is an alternative, not a claim every query needs a new composite.
Verify enabled single-field ASC/DESC/array indexes and exemptions, actual collection
scope (including nested `records`), service query execution and READY state privately.
Index readiness is a launch gate for enabled workflows; disabled notification-worker
queries are documented for later activation, not extra privacy-launch prerequisites.
No collection-group index is implied by a collection ID being reused. Emulator success
cannot prove production index availability. This contract is not wired into
firebase.json and deploys nothing. No unverified deployable index manifest is invented.

## Exact next gate and release checklist

**Next gate: owner + independent reviewer approve complete read-only production
identity, namespace, writer and recovery evidence outside Codex.** This PR does not
unlock the operator or authorize collecting real artifacts in this environment.

1. Owner records current live deployment/domain/commit (reported `main`/`ba67999`),
   actual browser app ID/project number/Auth domain/bucket/API destinations, effective
   Admin principal/project/default database, and actual rules/indexes. Saved variable
   names alone are insufficient. Preview/Codex remain demo-only without cloud credentials.
2. Owner/operator privately inventories all namespaces/subcollections and existing
   projections, including the table above, Auth providers/UIDs/admin roles, Storage,
   old deployments, Functions/jobs/imports/extensions and external/provider writers.
   Explain every unknown/orphan/withheld record. Never infer ownership from email.
3. Recovery operator retains the successful October 15, 2026 Firestore restore into
   fawcett-recovery-test as completed-operation evidence. Separately verify counts,
   IDs, relationships, timestamp precision, monetary values and protected integrity
   comparisons. Complete independent Auth, Storage/object and configuration/IAM/
   secret-version recovery evidence. Firestore backups do not back up those services.
4. Separately approve production adapter IMPLEMENTATION and security review: exact
   project ID AND number/database; approved execution host; least-privilege IAM;
   protected artifacts; three distinct active owner/reviewer/operator identities;
   bounded grants; source/candidate hashes; transactional fence; durable journals;
   restart/withdrawal/conflict behavior; provider callback recovery. Current
   createProductionOperator must continue throwing until an independently reviewed
   production implementation and explicit execution approval exist. No live flag,
   emulator-guard bypass, broad original write access or web migration endpoint.
5. Approve exact app/server/rules hashes, verified index contract, frozen manifests,
   maintenance window, writer shutdown/drain evidence, recovery watermark, abort
   thresholds and rollback owners. Refresh synthetic validation for that candidate.
6. Under separate operational approval, close the authoritative fence, install the
   restrictive compatible rules and pause/drain privileged writers. Old deployed
   rules may ignore a new control document: prove cached SDK/REST denial before
   declaring writes paused. Auth/Storage and callbacks require separate controls.
   Do not disable existing accounts/reset passwords. Reconcile orphaned signup attempts.
7. Keep maintenance through reviewed publication migration, source/financial/nested
   reconciliation, and deployment of the matching Production-built app/server/index
   artifacts. Never promote a demo Preview artifact or temporarily reopen source reads.
8. Verify existing/absent-projection/new clients, all signup/reply workflows, admin
   studio creation/duplicates/associations, source/view pairs, negative access and
   no-account private manual payments. Configure artist availability/buffers and
   reviewed legacy reservations before enabling scheduling; >1,000 appointments is
   a scheduler-specific overflow stop. Studio hours are already confirmed.
9. Reopen only after owner + reviewer signoff using a fresh fence epoch. Recheck late
   offline writes, source/view pairing, reservations and callback reconciliation.
   Rollback keeps restrictive rules/compatible maintenance UI; withdraw only unchanged
   run-owned projections. Changed views require review. Preserve originals/Auth/
   financial histories/journals. Whole-backup restore needs separate disaster approval.

Throughout cutover keep SQUARE_PAYMENTS_ENABLED=false,
SQUARE_STUDIO_PAYMENTS_ENABLED=false, NOTIFICATIONS_MODE=off,
NOTIFICATIONS_ENABLED=false and EMAIL_VERIFICATION_ENABLED=false. No subscriptions,
credit redemption, promotional delivery or automatic booking. Existing provider
callbacks must not be silently discarded: fence failures are retryable, not durable
capture; approve provider retention, protected replay and reconciliation separately.

After privacy signoff, tattoo-only activation requires a separate small purpose-gate
PR: current tattoo checkout needs the global switch also used by Founder checkout.
Keep both off now. Current studio checkout still needs separately approved Sandbox
end-to-end provider evidence and owner live configuration/controlled acceptance.
Dashboard invoices remain separately reconciled bookkeeping. No new membership or
calendar features belong in this release.

## Validation — October 15, 2026 (Edmonton)

- `npm test`: 458 passed across 11 active suites, zero failures.
- Final reconciliation hardening added two tests for real namespace-container data
  and unrelated historical journals. `npm run test:operator` was rerun on the final
  implementation: all 58 passed, zero failures, skips or cancellations. The final
  operator suite supersedes the 56 operator cases in the full-suite run.
- `npm run test:environment`: final contract checks, 26 passed.
- `npm run lint`: passed, zero errors; three existing homepage image warnings.
- `npm run build`: optimized isolated-demo build passed.
- `git diff --check`: passed. No dependencies, environment settings, application
  workflows, checked-in rules or deployment configuration were changed.

New coverage includes all added roots and known audits, more than 100 audit entries,
missing parents, expected containers versus orphan destinations, unknown nested and
projection namespaces, opaque values, excessive depth, aborted/restarted inventory,
private financial hashes/commit versions, late audit edits, active and historical
journal boundaries, private aggregate CLI artifacts and unchanged write denials.
Existing authorization, ownership, apply/resume, withdrawal conflicts, Auth and
financial preservation, privacy, payments, notifications and scheduling regressions
remain passing. These results establish emulator behavior, not production access,
index readiness, recovery integrity, live delivery or operational cutover approval.
