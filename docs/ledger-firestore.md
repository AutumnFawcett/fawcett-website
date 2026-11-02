# Stage 2B — isolated Firestore ledger persistence

Stacked on PR #60 at `6c45d6124bc455291e78d8248e4228e4b2a1f16c`.
PR #61 remains a sibling: policy/offer integration is intentionally deferred.
PR #59's Square verifier, historical EXTERNAL review exclusion, live routes,
Firebase rules/configuration and existing records are unchanged.

## Implemented, inactive server library

`lib/ledger/server/firestore.mjs` imports `server-only`, takes an injected server
Firestore database and authenticated authorizer, and performs no initialization,
credential discovery, provider requests or application-route wiring. Nothing in
`app` or `components` imports it. The server SDK dependency alone enables nothing.

The bounded adapter uses Stage 2A `post`, validation and journal semantics unchanged.
It deliberately does not use `postAtomically`'s reference-store full-history replay.
A lot-local engine state generates the same journal entry and deltas, then the
adapter updates the aggregate account projection under its shared revision.
Multi-lot historical replay remains an independent reconciliation operation.
New schemas below describe storage, not replacements for Stage 2A journal v1.

| Path | Data and ownership |
| --- | --- |
| `financialLedgerAccounts/{sha256([environment,clientId])}` | v1 account revision, CAD double-entry balances and purchased/reserved/revenue summary projection |
| `.../journal/{operationId}` | create-only Stage 2A v1 entry: sequence, actor/time, command, exact policy snapshot, balanced lines, allocation, before/after lot changes and reversal/source references |
| `.../lots/{lotId}` | mutable purchased-lot projection: project restriction, funding, usage/refunds, refund holds, disputes |
| `.../allocations/{operationId}` | create-only service/supply allocation; reversals remain separate journal facts |
| `.../operations/{operationId}` | create-only semantic intent digest, actor, authorization evidence reference, timestamp and journal reference |
| `.../reversals/{originalOperationId}` | create-only guard allowing at most one reversal of an original entry |
| `financialLedgerSources/{sha256(sourceKey)}` | global create-only provider uniqueness guard across all clients; scoped by environment/provider/merchant/payment, or refund ID |
| `financialLedgerPolicies/{sha256([environment,policyId,version])}` | trusted published/approved Stage 2A policy input; must be provisioned immutably by a future policy service |
| `financialLedgerPolicyGuards/{sha256([environment,policyId,version])}` | first-use policy digest; prevents rewriting an already-used version across clients |
| `financialLedgerEvidence/{accountKey}/payments/{evidenceId}` | trusted normalized provider-readback evidence, never a browser verification flag or raw provider response |
| `.../requests/{requestId}` and `.../refunds/{evidenceId}` | trusted request and verified-refund records; strict Stage 2A schemas prohibit extra credential/token fields |

No existing collection is reused, imported, queried or modified. IDs are validated
before constructing paths; provider keys use SHA-256 of canonical structured keys,
not unescaped concatenation. Authoritative identifiers remain sensitive even when
hashed: hashes are not access control or anonymization. Do not log records.

## Atomic strategy and recovery

1. Validate input shape and identifiers. No caller-supplied actor, timestamp,
   payment/readback fields or policy body is accepted.
2. Authorize the principal once outside retries for the exact client, environment,
   action and project. The application must implement this dependency securely.
   Capture server audit time once, outside the retry callback.
3. In one transaction read the operation guard, account and exact policy version.
   Replay the same semantic intent once; reject altered payload/actor collisions.
   Expected revision is a precondition, excluded from replay identity; null means
   evaluate against the latest locked state. A duplicate may return its original
   result even when its old revision no longer matches.
4. Read the affected lot, necessary trusted evidence, original entry/reversal guard
   and global provider guard, plus policy digest. No collection queries or history
   replay occur in write callbacks. Ordinary redemption uses five document reads;
   receipt and reversal reads are also constant. Lot holds/disputes are capped at
   128 each and journal size at 256 KiB: oversized operations fail before writes.
5. Run pure Stage 2A posting and safe-integer delta checks. Validate aggregate
   balance and purchased-liability/projection consistency.
6. Atomically create journal, operation, allocation, provider and reversal guards;
   replace affected lot and account projection; create first-use policy guard.
   All reads precede all writes. SDK conflict retries have a five-attempt bound.

No external side effects, authorization calls, emails or Square reads occur inside
callbacks. Failed/exhausted transactions commit nothing. After uncertain commit,
retry the exact operation ID; the original result is recovered without reposting.
Global source guards survive reversals, preventing re-crediting a reversed payment.
Reversal requires dependent lot changes to be undone first and never edits an
original journal/allocation. It is an accounting correction, not a provider refund.
Offline reconciliation orders journal entries by account sequence, uses `rebuild`,
and compares balances, summary, lots and revision; never repair drift automatically.

Refund holds and disputes overlap without adding the same reserved money twice.
A completed verified refund consumes its hold and has a globally unique provider
refund guard. Dispute settlement/chargeback money movements remain separate future
commands: freezing a dispute is not a second financial deduction.

Membership cancellation posts no value destruction. Promotional issuance, offer
expiry and credit transfers are not accepted adapter commands. Project restrictions
are enforced on redemption; no authorization, including owner identity, unlocks an
unimplemented transfer. PR #61's owner-approved transfer plans require a separate
reviewed atomic command before use. Offers have no path to mutate purchased funds;
the test verifies this separation, not an integrated PR #61 offer lifecycle.

## Emulator verification

Prerequisites: Node 22+, Java 21+, `npm ci`. No Firebase login, project creation,
service-account file, secrets, or real Firebase configuration is needed.

```sh
npm ci
npm run test:ledger
npm run test:ledger:emulator
npx eslint lib/ledger/server tests/ledger-firestore scripts/test-ledger-emulator.mjs
npm test
npm run lint
npm run build
```

`test:ledger:emulator` invokes Firebase `emulators:exec` with its dedicated config,
project `demo-fawcett-ledger` and loopback port 8087. The fixture refuses to create
an SDK client unless both project variables exactly match that demo project and
`FIRESTORE_EMULATOR_HOST` exactly matches `127.0.0.1:8087`. SDK emulator transport
uses no real credentials. Tests do not import application Firebase initialization,
load dotenv, call provider APIs or clear any live database. The CLI starts/stops
an ephemeral emulator; no import/export is enabled. Ports 4407/4507 are local hub/
logging ports; UI is disabled. Emulator-only deny-all rules are a new test fixture,
not a change to deployed `firestore.rules`. Diagnostic logs are ignored.

The read-only GitHub Actions job uses Node 22 and Java 21, no secrets or deployment
steps. Run locally with free ports; never point these fixtures at a real project.
The emulator is not proof of production latency, quotas, indexes or every contention
behavior. Before real activation, separately approve a staging verification plan.

Verified locally: 19/19 Stage 2A tests and 19/19 emulator tests pass. Coverage includes
simultaneous redemption, global provider collisions, refund/redemption conflicts,
refund/dispute overlap and deduplication, queued-write rollback, ABORTED retries,
retry exhaustion, uncertain commit recovery, invalid IDs/forged identity, cross-client
isolation, insufficient credit/stale revision, failed/EXTERNAL funding, cancellation
preservation, unsupported promotional mutations, multi-lot reconstruction/reversal,
bounded reads and missing-evidence/demo-project guards.
Full existing suite: 64/65, with the existing Jane/Janet client-search expectation
failure. Scoped lint passes; repository lint retains the existing unescaped
apostrophe in `AdminSquareInvoiceAssistant.js:164` and three image warnings.
Next production build passes (36 pages). These baseline issues are not changed here.

## Security limits and activation gates

The authorizer must derive identity from a verified session/service principal and
validate active role plus exact client/project/action access on every invocation.
Its returned evidence ID must refer to a durable audit event. This library's type
checks cannot authenticate a principal. Do not pass browser roles/IDs through as
trusted context. Account reads also need a separately authorized query layer.
Long-running jobs need bounded authorization validity and revocation handling.

The SDK bypasses Firebase Security Rules: only trusted, narrowly privileged server
principals may own these new namespaces. Evidence/policy writers must verify actual
provider readback, enforce immutable versions, exact request/payment association,
refund identity and historical EXTERNAL exclusions. A normalized boolean or evidence
ID is not proof by itself. No writer/ingestion service is implemented here.

Before activation: audit deployed rules for explicit browser deny-all access to all
new financial/evidence/policy namespaces, review least-privilege server IAM and
separate verifier/poster duties, decide protected audit retention/backups, approve
financial commands, policy acknowledgments and privacy-safe operational monitoring.
Firestore IAM does not provide per-document immutability against a privileged
administrator; create-only writes are application guarantees, not WORM storage.
No rules, IAM, secrets, settings or production data were changed or deployed.
Legal/accounting review is still required for tax, compensation, refunds, restricted
transfers and promotional terms; no cancellation forfeiture is implemented.

Stage 2C should first design a read-only legacy reconciliation/import manifest with
provider/environment/payment identity, import provenance and rollback/reversal
procedures. Join PR #61's consent/approval checks in an isolated server service;
prove those cross-contract checks in the emulator before any migration or UI cutover.
No owner console action is required for this local increment. Actual IAM/rules,
provider ingestion, policy approval and staged production testing need separate
owner authorization; do not enable them as part of Stage 2B.

References:
- https://firebase.google.com/docs/firestore/manage-data/transactions
- https://firebase.google.com/docs/firestore/transaction-data-contention
- https://firebase.google.com/docs/emulator-suite/connect_firestore
- https://firebase.google.com/docs/emulator-suite/install_and_configure
