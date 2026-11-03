# Stage 2D-2 — inactive funding-family protection foundation

Stack: PR #65 (`3b64a08`) → this draft, targeting `feature/stage2d-attendance-integrity`. No upstream branch changes, routes, live records, provider requests, settings, rules, IAM, secrets, migrations, new money, forfeitures or promotional issuance. Transferred-credit spending remains disabled in both protected service and family-coordinated adapter.

## Model and invariants

`financialFundingFamilies/family_{SHA256([1, environment, provider, merchantId, paymentId])}` is a global versioned source identity, independent of amount/email/client labels. The family preserves the full original normalized trusted provider evidence, original purchased amount/root lot and client/environment/CAD. The original global provider-source guard remains authoritative for duplicate receipts. Two clients cannot adopt one payment family.

The bounded family document contains revision, member lot snapshots (parent, creation journal and authorization reference), current refund/dispute case maps, and derived totals: original, used, refunded, reversed, unspent, refund-reserved, disputed, effectively reserved and available cents. Transfer changes member distribution, not original/collected value. Original financial journals, policy/consent/classification records and owner-approved transfer audits remain intact.

Conservation:

`original = used + refunded + unspent + reversed`

`effective reserved = max(sum(active refund reservations), unspent when any dispute is active)`

`available = unspent - effective reserved`

A dispute freezes all unspent descendants, including when the original lot is empty. Releasing a reservation never releases a dispute, and releasing one case never releases another. Distinct refund reservations sum; stable case IDs reject duplicate reservations. Holds are unavailable value, not another expense, receipt or refund.

Existing lot-bound reservations/refunds are mirrored into the family. The family adds only the reservation amount not already reflected in lot holds (`extraReservedCents`) to account reserved value and subtracts the same amount from available value. This avoids double-counting overlapping protections. Purchased liability changes only through actual financial postings.

## Transaction boundary

Every purchased-lot financial posting reads exactly one family document derived from original lot funding (or trusted receipt evidence). It verifies affected lot snapshots against that document, prepares the existing double-entry journal using the unchanged Stage 2A engine, then validates the family transition. It atomically writes journal/operation/lot/account/source guards, family projection, immutable family event and account family-posting reference. All reads finish before writes; no Square/Auth/provider requests occur in retry callbacks.

Membership cancellation remains a monetary no-op. Original provider/funding identity cannot be silently reassigned. Existing financial commands, authenticated consent, transfer approvals and PR #65 service-price evidence checks remain in place. Direct adapter redemption of transferred lots now also fails closed.

A separate inert `createFundingFamilyCoordinator()` accepts only reserve/release-reservation/freeze/release-dispute commands. Its injected **trusted server authorizer** runs on each retry and must check current role/client/project scope using transaction reads. Authentication/revocation checks requiring external services must occur before the transaction, with a bounded trusted identity lease; do not perform external I/O inside that callback. There is no live authorizer, authenticated route, UI, provider ingestion or release-approval product workflow in this increment. Synthetic authorizers are not evidence of deployed authorization security.

Coordinator commands require an explicit family revision. Their own exact-intent operation IDs handle uncertain commits and conflicting replay. Family risk events increment family revision; account `protectionRevision` increments separately because no monetary journal sequence/cash entry is created. Both coordinator and financial posting write the shared family/account documents, so Firestore retries observe the other operation. Stale external commands must be reloaded and deliberately retried, never silently treated as successful dispute processing.

## Refund/dispute boundaries and review

- Owner-approved transfers are blocked while any family hold exists. Transferred-value spending remains disabled even after release.
- A family-wide reservation protects aggregate unspent value across descendants without inventing an allocation priority between Booking Fees, Tattoo Advances or restricted credit.
- Existing single-lot refund completion remains supported only with trusted server-owned completed-refund evidence, a matching lot-bound reservation, exact original funding and original global refund-ID deduplication.
- **Cross-lot refund execution is not implemented.** Attempting to execute an aggregate family reservation through a single-lot refund returns a durable review outcome. A later separately approved command must select eligible allocations and update credit metadata atomically; no allocation/forfeiture/refund policy is invented here.
- Insufficient refund reservations return durable `review_required`, with no fabricated value or negative balance. A dispute involving already-used value freezes the actual unspent remainder and records review for the consumed portion.
- Existing reserve/freeze/release journal reversals adjust only their matching family case. Monetary reversals retain existing dependent-entry guards; active holds block financial reversals. Completed-provider-refund reversals require review rather than pretending an external refund was undone.
- A rejected transfer/spend can produce a review tombstone without a financial journal or consuming its owner approval. Same-ID retry returns that result; a new decision requires a new authorized command.
- Some malformed/unverified inputs and lot-level insufficient redemptions continue to throw without writes. They are not successful financial effects.

## Reconstruction, boundedness and limits

Immutable events: `financialFundingFamilies/{id}/events/post_{journalId}` and `risk_{commandId}`, each with previous/next state hashes and revision. Financial events preserve the original entry and, for reversals, its original immutable entry. Risk events preserve command and actor/authorization evidence. Account `familyPostings`, `familyOperations` and `familyReviews` provide audit/retry references.

Rebuild monetary entries with the existing strict `rebuild()`, rebuild ordered family events with `rebuildFundingFamily()`, then compare `protectedBalances()` with account projections. Every purchased lot must be covered exactly once. Plain `balances(rebuild(...))` alone cannot reconstruct additional family-wide risk reservations; callers must use the combined reconciliation function. No existing portal balance display is switched to this foundation.

No descendant collection scan occurs in a write transaction. The in-memory family aggregate is bounded to 32 total members, including reversed/tombstoned members, and 64 active cases per hold kind. Family documents are limited to 128 KiB, financial journal entries to the existing 256 KiB, and family financial-event documents to 512 KiB. Limit exhaustion fails closed and needs a separately designed sharding/archival procedure; no automatic truncation or history deletion. The raw persistence bounded-read regression now asserts exactly seven redemption reads, independent of historical entry count.

Family/account documents intentionally serialize related operations. Transactions use five SDK attempts; sustained contention must be surfaced/retried with the same operation ID. Per-client serialization is retained; throughput optimization is deferred until measured. Case events/history live in subcollections, not unbounded arrays in the coordinator.

## Compatibility and remaining gates

Every **new isolated adapter receipt** creates a family atomically. Existing stored lots without a family fail closed; this task does not read/import/backfill real historical records. Any future import needs PR #63 provenance review and family-aware reconciliation. New adapter callers must use combined reconciliation when family-wide holds exist. Existing value metadata and consent/classification histories are preserved, but future refund UI/commands must reconcile restricted credit metadata with lot/family projections before activation; this increment does not expose those workflows.

Family evidence inherits the adapter's trusted server-evidence assumption. It does not establish a new provider-readback producer or prove existing verification flags are trustworthy. Privileged Admin SDK writers bypass client rules; hashes are consistency checks, not protection against malicious privileged rewrites. Role provisioning/revocation, protected evidence/audit writers, environment binding and deployed IAM/rules remain separate activation gates.

## Verification

```sh
npm run test:ledger
npm run test:contracts
npm run test:legacy-import
npm run test:ledger:emulator
npm run test:commands:emulator
npm test
npx eslint lib/ledger/funding-family.mjs lib/ledger/server/*.mjs tests/ledger/funding-family.test.mjs tests/financial-commands/funding-family.test.mjs tests/ledger-firestore/persistence.test.mjs
npm run lint
npm run build
```

Use Java 21+ and the existing dedicated `demo-fawcett-ledger` loopback configurations only. Auth/Firestore tests use synthetic accounts and deny-all emulator rules; no real Firebase credentials or customer data are needed. Local Java 17 cannot run this Firebase release; CI's Java 21 job supplies authoritative emulator verification. Existing Jane/Janet test mismatch and JSX apostrophe lint error remain separate maintenance work.

Next: server-owned authorization/evidence boundary hardening (role/revocation provisioning, environment binding and protected audit/evidence ownership), followed by a separately scoped cross-lot refund allocation/credit-projection command. Do not enable transferred spending until those protections and acceptance policies are approved and tested.
