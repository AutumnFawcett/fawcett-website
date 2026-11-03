# Stage 2D-1 — verified attendance value (inactive)

Stack: PR #64 (`0919ce8`) → this draft. Target `feature/stage2c-authenticated-commands`. No upstream branch changes, routes, SDK initialization, configuration changes, real records, credit issuance or provider calls. PRs #59–64 remain unmerged. Rebase/retarget only after separately approved upstream integration.

## Root cause and correction

The previous service passed the requested redemption as `serviceTotalCents` to `applyOnAttendance`, making the independent price ceiling tautological. The protected command now references a completion ID, revision and full definition hash. It never takes an authoritative price or completed flag from the command. PR #61's original pure allocation contracts remain unchanged; the new attendance planner handles this isolated persistence workflow.

## Evidence contract and ownership

`serviceCompletion()` in `lib/financial-commands/attendance.mjs` defines schema version 1. At `financialLedgerAccounts/{accountKey}/serviceCompletions/{completionId}` it stores:

- client/environment/CAD, appointment/revision, project/artist;
- completion revision, `status: completed`, `decision: authorized`;
- integer `tattooServiceCents`, `settledTattooCents`, separate `supplyFeeCents`, `taxCents`, `otherCents`;
- completed/authorized timestamps, authenticated author UID, role revision and immutable audit ID.

`settledTattooCents` is independently audited value already settled against tattoo service, not a newly collected receipt. Future settlement integrations must prevent overlap with this service's application projection. No such integration is activated here.

A server-owned `serviceCompletionHeads/{appointmentId}` binds the currently authorized immutable completion ID/revision/hash. A corrected price requires a new completion record and current head, never editing prior completion/audit history. If applications already exist, a changed definition fails closed (`service_balance_requires_review`); correction/reversal coordination is deliberately not implemented.

The completion author must still have an active matching privileged principal revision and `authorize_service_completion` client/project scope. The linked `financialCommandAudits/{auditId}` must contain the exact completion payload/hash, actor, role revision, action and scope. Untrusted token claims or completion booleans do not substitute for these records.

**No completion-authoring API/UI or live evidence producer is implemented.** Only synthetic fixtures provision this evidence. A future authenticated authoring flow must obtain actual service/price decisions independently, create completion + audit + head atomically, enforce immutable versions and reconcile other service settlements. Possession of Admin SDK credentials still permits tampering: this is an application boundary, not protection from a compromised privileged writer. Deployed IAM/rules and audit retention require separate review; emulator deny-all rules are not Production evidence.

## Atomic boundary and bounded reads

Within the posting transaction the service reads current principal/project authorization, current consent/agreement/policy/appointment, funding lot and original immutable receipt, booking allocations, completion/current head/audit/author, and service-price projection. All are fixed document paths; no account-history scan or external API calls occur.

The transaction validates exact completion reference and appointment/project/artist identity, current revisions and audit evidence. It caps application by eligible purchased value and:

`tattooServiceCents - settledTattooCents - prior ledger service applications`.

The account revision serializes postings; the appointment's shared `serviceBalances` document additionally prevents different funding requests from consuming the same unpaid service price. Changed completion/head/authorization documents participate in Firestore conflict detection and are re-read on retries.

One atomic commit creates the financial journal/operation/allocation, execution audit and immutable `serviceApplications/{operationId}` snapshot; updates account/lot, booking application and remaining restricted-value projection; and updates service applied value. Supply/tax/other amounts never increase tattoo eligibility. Posting is purchased-liability debit / tattoo-revenue credit only: no cash/clearing debit and no second receipt.

The raw adapter reads booking value metadata and rejects attendance redemption unless the exact transaction/command has a private permit minted by the authenticated service after all checks. A caller-supplied/no-op guard cannot mint it. The exported predicate is read-only. The service/adapter import cycle performs no module-time calls and is exercised by both direct adapter and service tests. Generic Stage 2B lots without command booking metadata retain their existing lower-level contract; they are not a new attendance entry point. This does not claim to prevent arbitrary privileged SDK code from writing Firestore directly.

## Allocation decisions, review and retry semantics

- Single allocation, prepaid 30,000 / service 20,000: apply 20,000; retain 10,000 with its original category, appointment/project/artist restrictions and funding provenance.
- Prepaid 30,000 / service 50,000: apply 30,000; report 20,000 tattoo service unpaid. Fees/taxes remain separate, and no collection is assumed.
- Combined booking fee/advance: full application retains separate allocation IDs/kinds/amounts. Partial application returns and durably records `review_required: ambiguous_booking_allocation`; no financial posting, balance change or allocation policy is invented.
- Each booking is attendance-applied once. Partial remainder remains purchased liability but subsequent use/reallocation is disabled pending an explicit policy/workflow; no automatic general-credit conversion, refund or forfeiture.
- Immutable operation intent includes the complete attendance reference. Same-ID retries return the original journal/review even after an uncertain commit; conflicting intent fails. Replays still require current actor/project access. Concurrent different IDs compete on the account/booking/service documents.
- Review outcomes create an operation tombstone, review snapshot and audit, not a financial journal or account revision. A reviewed alternative requires a new operation ID. Reviews are not owner approval or financial authorization.
- Transferred-value redemption remains explicitly disabled. Funding-family safeguards are a separate next increment.

## Verification commands and boundaries

```sh
npm ci
npm run test:contracts
npm run test:ledger
npm run test:legacy-import
npm run test:ledger:emulator
npm run test:commands:emulator
npm test
npx eslint lib/financial-commands/*.mjs lib/ledger/server/firestore.mjs tests/financial-commands/*.mjs tests/agreements/serviceCompletion.test.mjs
npm run lint
npm run build
```

Emulators require Java 21+, loopback Auth 9097 / Firestore 8087 and `demo-fawcett-ledger`. Existing fixture guards prohibit real project IDs and nonlocal sockets. CI uses Java 21, no real Firebase credentials and synthetic public Firebase build configuration. Local Java 17 cannot start this Firebase emulator release; CI is the integration-test authority for this execution.

Baseline unrelated issues are the Jane/Janet substring search expectation and the JSX apostrophe in `AdminSquareInvoiceAssistant.js:164` (plus three existing img warnings). They remain unchanged; a separate maintenance PR should resolve them.

Activation still requires: authenticated service-completion authoring and settlement reconciliation, approved partial mixed-allocation and remainder policies, role/revocation provisioning controls, protected evidence/IAM/audit retention, runtime environment binding, transport authorization and separately approved real-environment QA. No financial route should import this foundation yet.
