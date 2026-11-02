# Stage 2A: inert financial domain foundation

Base: main ac6420e8e58dcd7e907f120936e63ef5167d8d1e. No dependency on PR #59.
PR #59 must stay open/unmerged at dfc1aa1fb248a152cef725489ad242b1afde578a.

## Scope and activation boundary

This is the first independent increment of Stage 2: pure version-one contracts,
posting/replay engine, an atomic persistence port, and a test-only memory store.
There are NO routes, UI imports, SDKs, database adapters, Square calls, migrations,
rule changes or activated workflows. Fixture postings in memory are not real
Studio Credit. Production collections and client-facing balances remain untouched.

Stage 2B must implement a server-only Firestore adapter and emulator tests; Stage
2C must perform owner-reviewed shadow migration/read-model adoption. These are
separate PRs. This engine is not a production-ready storage implementation and
must not be connected to a UI/API until the later authorization/policy gates pass.

## Versioned contracts

lib/ledger/schemas.mjs exports strict, dependency-free validators for paymentRequest,
paymentAttempt, providerTransaction, providerRefund, creditAccount, allocation and
policy. lib/ledger/engine.mjs defines/validates the financialJournal contract.
Only version 1 and integer CAD cents are accepted. Unknown record/command fields
are rejected (including extra token/PII fields). IDs are bounded and path-safe;
prototype keys are forbidden. Sums reject unsafe integer overflow.

- Requests bind stable client/project/appointment IDs, purpose, amount and immutable
  policy version. Project deposits require an approved project snapshot.
- Attempts describe durable provider idempotency keys/channel/state; no provider
  transport or attempt state machine is activated in this increment.
- Provider evidence contains only reference IDs, approved money/source/status and
  verification version. Booleans are NOT authentication: a future trusted adapter
  must fetch/verify evidence and bind the request, client and approved project.
  No caller-supplied object may be trusted because it passes schema validation.
- Journals contain immutable ID, per-account sequence, actor ID, stable UTC recordedAt,
  policy snapshot, command, balanced lines, optional allocation, lot changes,
  canonical payload fingerprint and reversal/source references. Fingerprints detect
  accidental payload collisions, not cryptographic authenticity or tamper-proofing.
- Policies have immutable ID/version meaning in an account history. Future global
  policy documents must be immutable too. Draft fixtures are allowed only because
  this is an inert calculation library; runtime activation requires approved policy.

## Financial model and invariants

Debit-positive account balances: Square clearing, purchased liability, promotional
liability, promotion expense, earned tattoo revenue and earned supply revenue.
Each posting has equal total debits/credits; reservations/cancellation are audit
journals with zero money lines because liability ownership/value is unchanged.
Purchased and promotional balances never mix silently. Operational totals are
not a completed statutory accounting/tax model or payout/settlement report.

A purchased receipt debits clearing and credits prepaid liability; revenue is
zero. Partial redemption debits the appropriate liability and credits tattoo or
supply revenue separately. Redeeming never increments collected payments. Promotions
debit promotion expense and credit promotional liability, not cash. A completed
refund debits purchased liability and credits clearing, with no new service revenue.

balances() distinguishes gross collected payments (excluding reversed receipts),
net collected after refunds, purchased prepaid liability, purchased/promo available
and reserved credit, and earned tattoo/supply revenue. Project-specific lots can
only be redeemed against their project; allocation records identify the appointment.
Membership cancellation is an audit event and never expires/removes purchased value.

Refund reservations sum within the same funding lot. An active dispute freezes
ALL remaining credit in that affected lot; this conservative first-increment policy
avoids guessing which partial cents overlap. Reservation is the union: a dispute
and refund hold never sum beyond the remaining lot value. Completing a verified
partial refund reduces liability once and reduces its refund reservation; any
remaining dispute hold still freezes the remainder. Releasing a dispute preserves
other refund holds. Promos cannot be refunded as purchased cash.

Completed refund evidence must match the lot's merchant/payment, environment,
amount and CAD currency. Global refund/payment source markers prevent duplicates.
A refund exceeding unspent purchased value is deliberately unsupported: it must go
to manual review, not make available credit negative or fabricate negative revenue.
Dispute loss/recovery, spent-credit chargebacks, taxes, tips, fees, promotions expiry,
forfeitures, transfers and mixed-tender allocations require later approved rules.

Corrections append a full inverse journal. A journal cannot be reversed twice or
if its affected lot differs from its recorded after-state: reverse dependent uses
first. Reversal-of-reversal and automatic partial reversals are unsupported; reverse
then post an explicitly corrected entry where permitted. Provider dedup tombstones
remain even after reversal; never reimport the same receipt as new money.

rebuild() replays ordered commands/policy snapshots, verifies every line/allocation/
lot change/fingerprint and rejects gaps, reordering, duplicates and mismatches.
The store's trusted final revision must anchor replay to detect truncated history.
reconcile() compares full expected state to a supplied projection. Rebuilding is
not proof of authenticity; access controls, backups and immutable persistence are
still required. Returned values are detached copies; mutating a caller's copy does
not modify prior engine state.

## Atomic persistence boundary — Stage 2B specification

postAtomically() uses a transaction port: readEntries(), readSource(), append().
The test-only store serializes operations globally and buffers all writes until
successful callback completion. It tests business concurrency/rollback semantics,
NOT Firestore locks, retries, IAM, security rules or emulator behavior.

The replay-all-history port is intentionally a reference implementation, not a
scalable Firestore document layout. Never store an account's entire history/lots
in one Firestore document. Stage 2B should replace reference replay with bounded
reads while retaining identical engine results and reconstruction tests:

1. Read the common client/environment revision/control document, immutable policy,
   relevant lots/holds, original reversal journals and GLOBAL provider source keys.
   Resolve all reads before writes. Provider keys include environment, merchant,
   resource kind and provider ID; they must be global across client accounts.
2. Validate server authorization, trusted request/project ownership, verified
   provider evidence and available lot balances. Prepare deterministic postings.
3. Atomically create journal, allocations and provider dedup keys; update affected
   lots/holds and client projections plus revision. Use create-only immutable
   documents, not merge/overwrite of historical entries.
4. Shared client revision ensures simultaneous spends/reservations conflict and
   retry against fresh available credit. Global provider keys prevent a receipt
   being credited to two clients concurrently. A revision is a lock point, not an
   idempotency key. Retry callbacks must have no provider requests/notifications.
5. Keep stable command ID, actor and recordedAt across retries. Perform external
   calls BEFORE the Firestore transaction, via a durable command/outbox workflow.
   Failure must commit neither journal nor credit projection nor dedup key.

Official Firestore contract: reads before writes; concurrent edits can retry the
entire transaction; writes apply atomically. No Firestore adapter is included here.
https://firebase.google.com/docs/firestore/manage-data/transactions

Future namespace proposal (not created): ledgerV1Accounts, ledgerV1Lots,
ledgerV1Journals, ledgerV1Allocations, ledgerV1ProviderKeys, ledgerV1Policies.
Use clientUid-based read projections and separate private provider evidence. Browser
writes must be denied in a separately reviewed rules release. Server SDK IAM bypass
of rules requires explicit backend authorization and restricted service identity.

## Legacy adoption without double import — Stage 2C

Current payments/admin/portal code remains unchanged. The existing screens derive
credit from editable payments records; creditLedger is not their authoritative
source. No automatic new-plus-old sum is permitted.

- Inventory existing payments/clients/projects read-only; resolve email/UID identity
  conflicts; snapshot an owner-reviewed opening-balance report and cutoff.
- Choose EITHER reviewed opening balances OR replayed legacy entries for a client,
  never both. Legacy attestations must have a separate reviewed import operation;
  do not disguise them as Square CARD readback evidence to pass receive().
- Assign deterministic legacy source IDs/import manifests. Retain legacy records
  and evidence. Shadow-reconcile each client before switching its read model.
- Prevent double counting a manually recorded Square receipt later observed via
  webhook: map/review its provider identity before activation. Ambiguity means hold.
- The historical EXTERNAL Sandbox false positive is explicitly ineligible: this
  engine accepts no EXTERNAL/unversioned receipt; do not import Sandbox records
  into Production opening balances or treat providerConfirmed alone as verification.
- Switch a client/account to exactly one authoritative source at cutover. Rehearse
  rollback of read selection without deleting/replaying immutable money postings.
- Server-only commands replace direct browser financial writes in another release;
  existing balances stay unchanged until owner-approved cutover and isolation tests.

## Owner-required business policy decisions (not activated)

Booking fee versus service deposit, booking-fee earning/forfeiture rules, notice
windows and rescheduling, supplied-service fees' credit eligibility, tax timing,
refund eligibility, consumed-credit disputes, promotional terms, and recognition
of completed service value require versioned Alberta legal/accounting review.
This increment neither labels fees legally nonrefundable nor implements forfeiture.
Purchased cancellation credit is retained; expiry/removal commands are absent.
Policy v1 snapshots capture conservative fixed mechanics, not arbitrary executable
rules. Unsupported policy values fail closed rather than silently changing money.

## Acceptance and remaining increments

2A: pure tests cover duplicate provider receipts (including across clients),
concurrent redemptions and refund/spend races, partial use/supply split, cancellation,
refund/dispute union, insufficient funds, failed monthly receipts, immutable policy
versions, reversal dependencies, atomic rollback and deterministic reconstruction.
Run node --test tests/ledger/*.test.mjs, npm test, npm run lint, npm run build.

2B: real Firestore adapter + emulator tests for transaction retry, global key
contention, create-only writes, revision anchoring, bounded reads, document limits,
authorization/isolation and no partial commits. Still no Production activation.
2C: migration proposal + shadow views + explicit owner approval before read cutover.
Square hosted/POS/subscription adapters reuse PR #59's verification design only in
later reviewed integration; this PR neither changes nor depends on #59.
