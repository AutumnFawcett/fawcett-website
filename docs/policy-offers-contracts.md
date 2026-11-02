# Policy and Offers contracts v1

This draft is stacked on PR #60 (`feature/stage2-ledger-foundation`,
`6c45d6124bc455291e78d8248e4228e4b2a1f16c`). It reuses integer-money,
canonicalization and provider-transaction validation without changing any Stage
2A schema, journal entry or posting operation. PR #59 is independent and unchanged.
No route, component, Firestore adapter, Square call or live workflow imports this
module. These are domain decisions, not executed payments or financial postings.

## Contracts and invariants

All new root contracts use schemaVersion 1. Policy references retain ID, version
and SHA-256 of canonical JSON content; offer assignments additionally snapshot and
hash the full definition. Historical snapshots must be persisted create-only.
Changing text or eligibility requires a new version and new acceptance.

| Contract | Meaning |
| --- | --- |
| Agreement and acceptance | Client, environment, request/revision, CAD amount breakdown, appointment/revision, policy hash/version and separate required offer terms; affirmative acceptance and server timestamp |
| Booking lineage | Separate Appointment Booking Fee and Tattoo Advance Payment allocations from one matching verified CARD receipt; stable lineage survives appointment-ID changes |
| Purchased credit | General Studio Credit, Tattoo Credit, appointment advance or booking fee; funding and acceptance evidence, policy, revision, reservations and optional artist/project/appointment restrictions |
| Transfer plan | Equal removed/added purchased cents, source fingerprint and accepted policy; restricted value requires owner approval; booking fees require separate review |
| Offer definition/assignment | Conditional discount, non-cash loyalty benefit or locked-in service entitlement; effective dates, service/artist eligibility, qualifying request/payment evidence and immutable accepted terms |
| Redemption | Unique decision, assignment, appointment revision and lineage; non-cash discount or entitlement; stacking denied unless mutually permitted, and always denied within a shared exclusion group |
| Cancellation review | Pending review with policy/appointment snapshot; separate references for compensation charge, replacement discount, exception and refund; no automatic financial adjustment |

Both booking allocations carry through the single complimentary reschedule when
notice is at least 168 elapsed hours, including the exact boundary. Changed IDs do
not reset history. Attendance applies both allocations once; excess value and
cancellations require review. Membership cancellation has no value-destruction
operation here. Expired offers never change purchased funds or convert into money.
No promotional bonus-credit contract exists. Stage 2A's earlier generic promotion
posting primitive is not used or approved for offer issuance by this increment.

## Trust and persistence boundaries

The pure functions assume trusted server-loaded state. `serverContext` validates
shape, not authentication. A future server adapter must derive identity/role and
timestamp from authenticated sessions and server time, load immutable acceptance,
policy and provider-readback evidence, and validate owner approval against its
exact source, amount, client, policy and revision. Browser-provided verification,
role, acceptance or approval flags are never evidence. Evidence IDs alone do not
perform these checks. Marketing consent is separate, optional and defaults false.

Before any checkout route can be connected, it must call `requireAcceptance`
against trusted current request state inside its consistency boundary. Missing or
stale consent must reject before creating a provider link. Persist acceptance and
provide the client an exact policy/offer copy; delivery/UI are not implemented.

`redeemAtomically` defines an adapter port: read the shared client offer revision,
evaluate and conditionally commit the next revision plus create-only decision ID
in one transaction. All assignment, qualification, expiry and redemption writes
must use the same lock/revision. Resolve authoritative booking lineage and current
appointment revision server-side; a caller cannot choose a new lineage to bypass
stacking. Transfers and attendance must atomically lock source credit/booking
revision, evidence/approval consumption, unique operation IDs and eventual journal
posting. Replays return the original decision; differing payloads collide. Retry
transaction conflicts without provider calls or other side effects in callbacks.

The test adapter serializes in memory: this demonstrates the contract, not
Firestore isolation. Stage 2B must verify actual concurrent transactions, rollback,
retry exhaustion, replay/collision, immutable evidence and source reservations
using isolated emulator fixtures. No live collections or rules are touched.

## Compatibility and deferred policy

No legacy balances are imported. New contracts are additive and do not reinterpret
Stage 2A records. Future adoption needs explicit receipt-to-allocation mapping,
unique provider/environment/payment identity and legacy import provenance to
prevent double counting. The historical EXTERNAL false positive remains untouched
and ineligible: qualification and booking require verified CARD evidence.

Legal/accounting review remains pending for cancellation compensation, refund
rights, tax timing and fee treatment, restricted transfers, offer expiry/disclosure,
replacement discounts and locked-price obligations. Published is a domain state,
not a legal approval. Automatic forfeiture is always false. No production terms or
financial workflow may be activated by these fixtures. Partial attendance,
owner exceptions, refund/dispute effects on qualifying benefits and actual charge/
refund posting need separate reviewed commands; none occurs automatically here.

Stage 2B is ready to begin as an isolated persistence/emulator increment. Acceptance:
atomic consent/request checks; immutable policy/evidence; revision and idempotency
locks for shared balances and offer state; concurrent redemption/transfer/attendance
tests; crash/retry and refund-reservation overlap tests; no network payment calls,
live data, rules deployment or workflow activation. Legal approvals remain gates
for future business workflow activation, not for isolated emulator development.
