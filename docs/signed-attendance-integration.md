# Stage 2D-6: protected signed attendance, emulator only

## Scope and dependency

Based on PR #68 `6c2770a053afb1f284687c7b1796880484a1c0ba`; targets
`feature/stage2d-durable-ownership`. PRs #59–68 stay unchanged and unmerged.
One existing `redeem` operation applies original purchased appointment value to
verified tattoo service. It is not a new product or general Tattoo Credit spend.
This is the smallest safe path because PR #65 already verifies attendance,
independent service price and exact accepted booking allocations, and PR #66
coordinates its original funding family. Transfers and descendant spending remain
blocked. No payments, refunds, new credit, routes, UI or deployed writers.

`createSignedAttendanceCommands` is internal and deliberately absent from the
application public entry. Runtime construction requires PR #67's owned Auth and
Firestore demo/loopback dependencies. Architectural tests reject direct route,
component or generic utility imports of the writer, registry or staging adapter.
This is an application boundary, not a sandbox against arbitrary Admin SDK code.

## Reuse and deterministic prepare/apply

The Stage 2A posting engine and Stage 2B adapter are reused unchanged. The existing
protected command service receives one internal `postingClock`: audit/journal
time is frozen while Firebase authentication, expiry, revocation and completion
validation continue using the actual live clock. Existing callers use the same
clock for both, preserving their behavior.

The new point-read staging facade runs the actual protected command in a read-only
Firestore transaction. It records every document existence/content hash and every
exact create/set write. It does not load histories or scan descendant lots. It
rejects queries, unsupported SDK methods, deletes, duplicate write paths, reads
after writes, more than 128 distinct reads or 32 writes. The protocol also caps
canonical packet size at 64 KiB; large cases fail closed instead of expanding
transaction bounds. Stage 2D-6 is intentionally limited to the existing attendance
path supported by that facade.

The complete versioned plan binds authenticated actor, exact client/operation,
prepared/expiry times, registry identity/revision/hash, all reads and all writes.
That includes journal, account, lot, allocation, operation, execution audit,
booking applications, service balance, remaining value, family projection and
family event/posting reference. Reads include account/family, both policies,
consent and its audit, appointment/project, service completion/head/author/audit,
original funding journal/provenance, operation guards and ownership receipts.
Owner transfer approval is explicitly inapplicable (`approvalId: null`); this
path never consumes or bypasses a restricted-transfer approval.

All signature creation occurs outside retry callbacks. For this staged path,
PR #67's ownership writer defers signatures for NEW schema-1 receipts using a
private staging capability. After preparation returns, local signatures are
created and frozen into the plan; commit verifies and attaches those exact seals
without signing again. Ordinary existing paths keep their existing behavior.
The PR #68 durable Ed25519 envelope signs normalized balanced journal entries,
exact issuer/resource/subject AND the hash of the complete plan. The signer's
registry is independently pinned, never accepted from the request. Mock signing
uses bounded timeout/retries and AbortSignal; late responses cannot commit.

Commit freshly verifies Firebase ID token/revocation outside the transaction,
then repeats the existing protected attendance command inside it. Every retry
rechecks current signed role and exact client/project grants. The stage is
recomputed with the original posting timestamp and compared byte-for-byte with
the signed plan. Existing price, consent, original-lot, provenance, family-hold
and allocation rules execute again. A changed dependency, recorded effect or
registry requires fresh preparation and signing outside the transaction.

Only after comparison does the adapter stage the exact writes plus an immutable
`signedAttendanceV1/{operationId}` anchor in ONE real Firestore transaction. There
is no separate financial commit followed by a signature write. The anchor binds
full plan/envelope, intent, actual entry hash, artifact hash, accepted time and
registry revision. Failed transactions roll back all effects, projections and
anchors together. Same-intent replay validates current authorization and the
original signed anchor. Conflicting IDs fail. Uncertain responses recover from
the committed original anchor rather than spending again.

## Emulator registry publication and transaction guard

`financialSigningRegistries/{pinnedId}` is the current projection;
`financialSigningRegistries/{pinnedId}/versions/{revision}` contains immutable
publisher-signed versions. Root public key, exact publisher UID, minimum revision,
registry ID and allowed demo project/database/environment are trusted SERVER
composition, not document/request fields. There is no registry route or UI.

Publication authenticates with Firebase revocation checking and requires the
separately pinned UID to have the current server-owned owner/manage_roles grant
for the configured scope. Generic admins/owners or claimed role flags cannot
substitute. The publisher prepares against current owner and registry versions,
signs outside callbacks, and atomically rechecks those versions before creating
the immutable revision and replacing the projection. Revisions advance by one;
PR #68 validates key-transition/history preservation. Concurrent publications or
role changes fail closed. Private authority is disposable in-memory fixture code.

Financial prepare AND commit read the current projection and matching immutable
version. They validate the independently pinned publisher signature, minimum and
observed high-water revision, complete definition hash and resource scope. New
posting requires the exact registry revision/hash used at prepare. These reads
participate in the posting transaction, so a concurrent registry publication
forces retry; retry cannot bypass it using a previously signed plan.

Retirement rejects new effects. Existing anchored history can be verified using
its protected accepted timestamp and artifact hash before retirement. Revocation
or issuer compromise freezes replay for manual review while preserving the
original journal, signature and anchor. Registry/key rotation never automatically
re-signs or deletes financial history.

The emulator projection and process high-water check are not an infrastructure
anti-rollback service. A future durable registry loader needs externally protected
monotonic state/retention, durable pinned public roots and restricted publisher
IAM. Privileged Admin SDK writes can still replace/delete documents in this demo.
Future real publication needs bounded transport timeouts and operational recovery.

## Accounting example and invariants

For $300 original advance funding and $200 independently verified tattoo service:

| Measure (CAD cents) | Before | After |
| --- | ---: | ---: |
| Collected payments | 30000 | 30000 |
| Purchased prepaid liability | 30000 | 10000 |
| Available purchased value | 30000 | 10000 |
| Earned tattoo revenue | 0 | 20000 |
| Earned supply-fee revenue | 0 | 0 |
| Family original funding | 30000 | 30000 |
| Family used value | 0 | 20000 |
| Family unspent value | 30000 | 10000 |

Journal debits purchased liability 20000 and credits tattoo revenue 20000.
No cash/clearing receipt is created. Remaining purchased classification, project
and appointment restrictions and original provider identity remain intact. Supply
fees, taxes and other completion amounts do not inflate tattoo service value.
Full mixed booking-fee/advance application preserves separate allocation trace;
ambiguous partial mixed allocation remains review-required and is not signed or
posted by this narrow writer. Unpaid service is not assumed collected.

## Compatibility and remaining gates

The durable signed-attendance anchor and PR #67 ephemeral record receipts are
explicitly different protocols. New staged records receive both for compatibility
with the unchanged protected reader. Prior records are never adopted, migrated,
replaced or silently re-signed. An old unanchored redemption cannot be replayed as
a durable signed posting. Funding fixtures deliberately use existing receipt
contracts; no historical provider evidence is upgraded to new trusted evidence.

This is not complete restart durability: old runtime-owned predecessor receipts
still depend on retained ephemeral fixture keys. A production deployment needs
explicit dual protocol readers, protected durable public roots/acceptance anchors
and approved evidence writers. No lost key can be reconstructed or history
backfilled automatically. Only new disposable emulator artifacts are supported.

Existing unsigned emulator command paths are not globally disabled; this is one
opt-in protected path, not a claim that all ledger writes require this protocol.
Raw adapter calls still cannot mint the existing attendance permit. No deployed
runtime profile, transferred-value redemption or cross-lot refunds is enabled.
The stack still inherits the legacy Square route/classifier boundary; PR #59's
CARD/EXTERNAL/readback fixes remain separately gated. Preserve and exclude the
historical EXTERNAL anomaly. No Square calls are performed here.

Before Sandbox infrastructure: review this one-operation plan/apply seam and
transactional registry guard; fix unrelated Jane/Janet test intent and JSX lint in
a small maintenance PR; preserve #61's merge ancestry through #64. Keep the stack
unmerged until separately approved. Recommended next checkpoint is an independent
review of the exact write-set and producer/registry custody, not another financial
operation. Deployed activation still requires approved resource/identity/IAM/WIF
inspection and provisioning, durable keys/registry/audit retention, real verifier
ingestion, owner bootstrap/recovery/step-up, fail-closed revocation procedures,
legal/accounting policy review and separately authorized synthetic Preview QA.

## Verification commands

```
npm run test:ownership
npm run test:contracts
npm run test:ledger
npm run test:legacy-import
npm run test:ledger:emulator
npm run test:commands:emulator
npm test
npx eslint lib/financial-security/*.mjs lib/financial-security/protocol/*.mjs lib/financial-commands/*.mjs lib/ledger/server/*.mjs tests/financial-commands/*.mjs tests/agreements/signedPostingBoundary.test.mjs
npm run lint
npm run build
```

The emulator scripts force loopback demo Auth/Firestore only and the synthetic
fixture network guard blocks remote connections. Java 21 is provided by the
existing CI. Local Java 17 cannot run the current emulators; no cloud/customer
resources are used as a substitute. Build uses synthetic public Firebase config.
