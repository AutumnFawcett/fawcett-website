# Stage 2D-5 — inert durable ownership protocol, version 1

## Boundary and dependency

Stacked on PR #67 `fad786fe37f613475eac9f6bbdaa343c81ce37b1`, targeting
`feature/stage2d-financial-security`. PRs #59–67 are unchanged and unmerged.
This is a contract checkpoint, not a deployed writer. Nothing imports this
protocol from application routes or the existing ledger adapter. No credentials,
KMS clients, cloud resources, real records, payment integrations or new UI.
PR #67's emulator ownership implementation remains unchanged and deployed
financial dependencies still fail closed. The synthetic Firestore seam writes
only disposable `financialProtocolSyntheticRuns/{run}` emulator records.

## Registry trust and custody

`lib/financial-security/protocol/registry.mjs` constructs an opaque trusted
registry from reviewed SERVER configuration, never from an artifact/request.
Registry schema 1 has exact id/revision and up to 128 keys. Each key has:

- Globally unique key ID and distinct canonical Ed25519 SPKI public-key material.
- Exact issuer ID, writer kind and allowed artifact kinds.
- Approved Firebase project, database and financial environment.
- Introduction registry revision, creation/effective/retirement/revocation times.
- Active, verification-only or revoked state; explicit compromise indication.

A transition supplied with the previous registry cannot remove history, change
key identity/scope/material/algorithm, reactivate a retired/revoked key or erase
compromise. New keys have the current introduction revision. One issuer cannot
silently acquire a different writer kind or scope. No private material is
accepted in the registry. IDs alone never authenticate an artifact.

The constructor is NOT a registry-admin API. A future protected registry loader
must authenticate the registry publisher, pin registry ID/minimum revision,
persist monotonic revision state across restarts, validate the complete previous
registry transition and protect against rollback/substitution. This module does
not supply that infrastructure. An arbitrary server process with Admin access
can still replace data; application signatures are not IAM isolation.

Active keys issue and verify new artifacts. Verification-only keys cannot issue
or authorize acceptance of new artifacts, even if their timestamps are backdated.
They can verify history only with an independently protected acceptance receipt
containing the exact artifact hash and server acceptance time, both preceding
retirement. These receipt inputs must never come from a browser or an artifact.
Historical verification is not authorization to post a new financial effect.

Revoked keys always fail with `revoked_key_review_required`. A compromised key
freezes all keys of its issuer with `issuer_compromised_review_required`. Preserve
journals, original signatures and acceptance receipts; separately audit the
incident and classify the affected interval. Do not silently erase, re-sign or
reverse financial history. A reviewed replacement issuer/registry and explicit
reconciliation are future operational procedures.

## Signed artifact contracts

`contracts.mjs` and `artifacts.mjs` define strict normalized payloads for:

| Kind | Exclusive writer | Bound financial meaning |
| --- | --- | --- |
| provider_payment | provider_verifier | merchant/payment/order/location/request/client, exact CAD cents, CARD/COMPLETED/CAPTURED, no external details, readback time/decision |
| provider_refund | provider_verifier | merchant/refund/payment/order/request/client, exact CAD cents, completed readback, original payment evidence |
| financial_journal | ledger | request/client/transaction/funding family/policy/audit, balanced integer debit/credit entries with separate allocation IDs |
| replay_event | ledger | request/client/transaction, original artifact, intent and result hashes |
| owner_decision | owner_administration | actor/action/client/project/amount/restriction/policy/role/account revisions, exact approval, expiry and audit |
| policy_definition | policy_publisher | immutable policy ID/version/content/hash/publication/authorizer/audit |
| service_completion | service_authorizer | client/request/appointment/project/artist and revisions, authorized completion, separate service/supply/tax/other values, actor/audit/application |

Every envelope additionally signs protocol and artifact schema version, artifact
ID/kind, issuer/writer/key/algorithm, registry ID/issuance revision, exact resource
scope, intended subject, payload hash, proposal hash and issuance time. Ed25519
signs the exact UTF-8 canonical envelope bytes; the payload hash binds the exact
strict payload. A KMS adapter must match raw-message Ed25519 semantics rather
than accidentally signing a different digest/envelope.

Canonical version 1 sorts object keys, preserves array order, uses only safe
integer numbers, booleans, null and valid Unicode strings; no undefined, floats,
negative zero, accessors, exotic prototypes, hidden object properties, sparse
arrays or unpaired surrogates. It is a deliberately restricted protocol, not a
claim of general RFC 8785/JCS compatibility. Artifact size is capped at 64 KiB;
registry key count and dependency count are bounded. Unknown fields, versions,
algorithms and noncanonical signature encodings reject. Expected issuer, subject,
kind and scope are supplied by trusted consumer composition, not copied from an
untrusted payload. A hash or verified flag is never producer authentication.

These normalized contracts do not replace domain verification. Only the later
protected provider verifier may attest a real readback. The existing attendance,
consent, provenance and funding-family engines still make domain decisions.
The envelope is not proof of an actual Square call, IAM permission, legal policy
approval or that a service was performed. No promotional money is introduced.

## Proposal → asynchronous sign → atomic commit

`proposal.mjs` is an inert, dependency-injected integration seam. The store,
signer, clock and current-registry loader are privileged server composition, not
request hooks. Each proposal freezes the operation ID, exact intent hash, actor,
resource scope, exact artifact payload and bounded dependency vector. Version 1
requires role, approval, policy, account, family and evidence dependencies; each
has identity/revision/content hash and optional validity deadline. Additional
instances can represent appointment, completion-head, owner role and other
relevant records under the evidence/role categories. No required category can be
omitted. Absence must be explicitly represented by the future protected adapter,
not assumed from client input.

1. The protected store authorizes and prepares deterministic state outside a
   transaction. Signing is asynchronous, with at most three attempts, per-attempt
   timeout (default 2 seconds) and AbortSignal; proposal lifetime is at most 15s.
   A production transport must honor abort/deadlines. Late signer responses cannot
   commit anything. Retry signs the identical immutable bytes.
2. Signature covers the payload hash AND hash of the complete proposal, including
   all expected revisions. Signer output is verified locally before proceeding.
3. Inside each Firestore retry, the store checks CURRENT authenticated principal,
   exact access, revocation/lease and scope, even for operation replays. It reads
   the immutable replay record and, for a new effect, all bounded dependencies.
4. Current key state, time, approval validity, every dependency revision AND
   content, actor/scope and exact posting must still match. Any change rejects
   with `stale_proposal_reprepare_required`; a new prepare/sign must happen
   outside the callback. No silent recomputation into a different posting.
5. The store stages only the exact signed effect and coordinator-created immutable
   replay/acceptance record in one transaction. Result is deterministically bound
   to operation/artifact/payload hashes, not supplied by a request/store callback.
   Same intent returns the original protected outcome; conflicting intent rejects.
   An uncertain commit retries against this record without another financial effect.

The store's `authorize`, `readPlan`, `readReplay` and `apply` are trusted adapter
obligations, not implemented production authorization. `apply` must exclusively
stage the supplied exact effect/replay with create semantics and all ledger
projection updates atomically. Registry state must be included in the same
transactional snapshot/guard at deployment, not changed in an unrelated service
between verification and commit. The test registry is process-pinned; a future
loader must atomically guard registry revision/revocation. No HTTP/KMS/signing or
Auth network request belongs inside the Firestore retry callback. This module
cannot sandbox arbitrary injected callbacks or privileged Admin SDK code.

## Emulator seam and regression commands

Synthetic seam reads six predictable dependency documents, then atomically
creates one signed effect and replay. It demonstrates CAS, concurrent duplicate
handling, failure rollback, revocation on retry and uncertain-commit recovery.
It does not post actual credit or replace the financial adapter. Existing ledger,
attendance, consent and funding-family emulator suites run unchanged alongside it.
Tests assert zero signer invocations while transaction callbacks execute.

```
npm run test:ownership
npm run test:contracts
npm run test:ledger
npm run test:legacy-import
npm run test:ledger:emulator
npm run test:commands:emulator
npm test
npx eslint lib/financial-security/protocol/*.mjs tests/ownership-protocol/*.mjs tests/financial-commands/ownership-proposal.test.mjs lib/financial-security/architecture.mjs
npm run lint
npm run build
```

Emulators require Java 21 and fixed `demo-fawcett-ledger` loopback configuration;
existing scripts supply it and runtime constructors reject deployed or ambiguous
configuration. Build uses synthetic public Firebase config. Existing Java 17
local tooling is insufficient; CI provides Java 21. No tests access a real project.

## Compatibility and remaining implementation

PR #67 seals schema-1 record ownership using ephemeral per-process/per-kind keys
and record paths. This new envelope is also versioned 1 but is a DIFFERENT
protocol; it cannot be interpreted as an old seal or vice versa. Old ephemeral
signatures cannot be verified after key loss. Do not claim this module retrofits
durability into them. Future adoption needs explicit dual readers keyed by
protocol discriminator, durable approved old public keys where they exist, and
protected acceptance anchors. Never fabricate lost keys or automatically
backfill/re-sign historical records. No migration is performed here.

Real-writer adoption is a separate bounded PR: integrate one effect with current
protected command authorization, domain engine, exact signed journal/projection
plan, approval consumption, family coordination and transactional registry guards.
Until this is reviewed, KEEP synchronous emulator writers and deployed fail-closed
runtime unchanged. Transferred-credit spending and cross-lot refunds remain
blocked; no automatic forfeiture, refund execution, offer redemption or new receipt.

The ledger stack still inherits the OLD legacy Square classifier/routes; PR #59
is separate/diverged. Its CARD/EXTERNAL and GetPayment corrections are not yet
integrated into this stack. Do not broaden credential scopes or enable those
routes. Preserve the historical EXTERNAL anomaly and exclude it from confirmed
card reconciliation; a flag/hash alone is not evidence of a verified card receipt.
Future verifier requires pinned merchant/request/location, CARD+COMPLETED+
CAPTURED, no external details, exact CAD amount, HMAC validation and Sandbox
GetPayment outside transactions. No Square calls occur in this increment.

## Minimum future Sandbox infrastructure verification and owner approvals

Before any infrastructure change, obtain separate owner authorization for exact
Sandbox Firebase project/database, dedicated Preview project, synthetic Auth
realm and identities. First approve read-only metadata/IAM/WIF inspection with
no secret values, customer documents or users. Independently verify actual Auth
and Firestore project/database, workload identity claims, deployed revision and
no Production fallback. Preview OIDC project/environment alone is not proof of
approved branch/commit.

Then separately approve provisioning and least-privilege IAM: invoke-only Preview,
provider-only verifier with Sandbox secrets and provider KMS signer, ledger-only
writer with public provider keys, isolated policy/owner/service authorities,
protected registry publisher and externally retained audits. Prefer separate
projects/databases for infrastructure writer separation; collection names and
application signatures alone are not IAM boundaries. No broad project Editor or
shared private key. Approve key algorithm/custody, rotation/revocation/freeze and
recovery procedures, immutable registry/receipt retention and disaster recovery.

Approve synthetic owner bootstrap, MFA/step-up and Firestore-first revocation
procedures separately. Approve a run-specific fixture/cleanup manifest; retain
financial/audit evidence per reviewed retention, delete only listed disposable
fixtures, never the historical anomaly. Validate negative cross-environment and
cross-writer permissions before enabling even synthetic command testing.

Finally require explicit approval for Sandbox webhook configuration, provider API
calls/payment simulation and connecting a protected test-only route. Hosted
Sandbox simulation is not proof of real hosted card entry. A controlled real-card
Production hosted-checkout test, real financial activation, customer migration,
transferred spending and cross-lot refunds each need separate approval. None is
authorized or implemented here. Legal/accounting terms and baseline CI maintenance
remain release gates. Keep PRs open; preserve #61's merge ancestry through #64;
#59 remains a separately gated integration.
