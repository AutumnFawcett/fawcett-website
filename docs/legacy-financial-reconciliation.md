# Stage 2C-1 — offline legacy reconciliation and provenance

This is code inspection, a normalized manifest contract and synthetic offline
validation only. No real Firestore record, account total or provider evidence was
read/exported. Collection existence, counts and data quality in deployed databases
are therefore **unknown**. No migration, importer, exporter, authenticated route,
SDK initialization, credit posting, read-model cutover or real-data CLI is added.
Every report has `executionAllowed: false`; `shadow_match` is not approval.

Dependency: stacked on PR #62 (`feature/stage2b-firestore-ledger`, `d58d2d4`), whose
account/journal/provider-guard layout is the target for future reconciliation.
The validator reuses Stage 2A safe-cent/canonical contracts inherited through #62.
PR #61 remains a sibling; no policy/offer contracts are copied or activated.
PR #59's verification and historical EXTERNAL exclusion remain untouched.

## Code-derived source inventory

| Source | Current repository evidence | Trust and import treatment |
| --- | --- | --- |
| `payments` | `AdminPayments.js` creates records in the browser and edits status/reference/notes; `manualReconciliation.mjs` requires receipt acknowledgment/reference for received status | Studio attestation, **not** API-confirmed funds. Preserve exact original ID, hash, status and audit metadata. Paid/partial alone is insufficient provider evidence. No unique provider transaction guard in this legacy UI |
| `creditLedger` | Rule permits admin create/update; **no current app reader/writer or document schema found**. `/admin/credit-ledger` renders `AdminCreditLedger.js` using `payments` | Never add unknown collection values to payment-derived credit. Independently review every record; an exact, owner-reviewed mirror is excluded as a second financial event, retaining both source references |
| `clients/{uid}` | Portal loads by authenticated UID; admin combines clients, consults, applications, projects and appointments through UID/email/document-ID fallbacks; AdminClients writes using selected `clientUid` | Auth UID must be independently resolved; an email/document ID fallback is not proof of ownership. Shared/changed emails, missing UID and contradictory IDs are holds; no automatic email merge |
| `projects` | Admin edits assigned inbox/preferred artist and cent-based estimates; payment/appointment project links are nullable; AdminProjects sums all paid/partial related payments | Estimate is not a receipt or earned revenue. Validate project ownership and artist mapping. Project payment summary can include credit tender and does not independently establish net collections |
| `appointments` | AdminSchedule writes client UID, optional project, `assignedArtistId`, inbox, start/end and status | Scheduling is not evidence of payment, service completion, accepted cancellation terms or allocation. No booking lineage/policy revision comparable to PR #61. Artist values differ across screens and need explicit mapping |
| `membershipApplications` | Client application/preferences and boolean acknowledgments; AdminMembershipOffers stores nested `membershipOffer` (initial/monthly/minimum cents and dollar aliases, termsSummary/status) | Proposal/request, not a successful installment, subscription, receipt or purchased credit. Generic application acknowledgment is not exact PR #61 payment-policy acceptance |
| `membershipOffers` | Standalone rule and ClientDashboard read; current admin offer editor writes nested application offer instead | Two possible offer representations; do not assume synchronization or count both. Context only, requiring schema/version review |
| `membershipOfferResponses` | Client response type, application ID, note, timestamps; messages follow | Client response is not verified payment or an exact policy hash/appointment-revision receipt |
| `membershipChangeRequests` | Pause/cancel/resume/amount-change request and admin review/message | No automatic balance change; cancellation cannot erase purchased value |
| `projectTimeline`, `consultRequests`, messages/conversations | Planning, payment notes and contextual associations | Supporting provenance only; never another payment. Exclude private notes from public reports/logs |
| `tattooSandboxOrders`, `tattooSandboxOrderLookup`, `tattooSandboxWebhookEvents`, `tattooSandboxTransactions`, diagnostics | Preview-only isolated Square test journal in payment modules/docs | Always excluded from Production money. Signature, HTTP 200, COMPLETED or old `providerConfirmed` flags alone do not prove Square-processed CARD value. EXTERNAL/contradictory external details are excluded regardless of matching order/amount |
| `financialLedger*` | PR #62's new inactive target namespaces | Future read-only snapshots must resolve existing source guards, immutable journal/import IDs, client/environment and projections before proposing any new entry |
| Other collections or external paper/bank/provider records | No validated schema/ingestion in this branch; collection names from prior screenshots are not a source-code contract | `source_schema_unmapped`/manual review. Do not infer records or balances or fetch them in this increment |

Legacy `payments` has these selectable types: consult fee, combined
`booking_fee_deposit`, session, design, supply, touch-up, membership initial/monthly,
product/aftercare, refund and other. Methods include cash, e-transfer, debit, credit
card, Square, Stripe, Afterpay, gift certificate/Tattoo Credit, in-studio credit and
other. Credit effect is independently chosen: none/add/use/refund-or-remove.
No automatic correspondence between payment title, money collected and credit
eligibility is safe. The combined booking-fee/deposit label is specifically held
for separation into Appointment Booking Fee and Tattoo Advance allocations.

`receivedAt` can be an administrator-selected calendar date at local noon, while
created/updated/acknowledged timestamps use server time. Preserve which timestamp
is used; do not relabel the selected date as actual bank settlement or consent time.
Legacy status edits change current display totals without immutable reversal facts.
`refund` and `refunds_or_removes_credit` conflate a cash refund and a non-cash
adjustment. No structured legacy dispute/refund-provider workflow was found.
Unknown history is a review category, not a fabricated transaction.

## Three current balance definitions

- `ClientCredit.js` and `AdminCreditLedger.js`: count only `paid` or `partial`;
  sum integer-intended `amountCents` for adds, subtract uses/removals. `partial`
  includes the entire recorded amount; a later `refunded` status is excluded rather
  than necessarily posting a matching negative event. Admin identity fallback may
  split/merge rows differently from the client UID query.
- `ClientDashboard.js`: uses `Number(amount || paymentAmount || 0)` in dollars,
  subtracts `credit_use`, `refund` or refunded status; otherwise adds, without the
  credit page's paid/partial/effect filter. New `amountCents`-only rows can show zero.
- `AdminProjects.js`: sums paid/partial `amountCents` by project without separating
  payment method/credit use. This is neither the portal credit balance nor earned
  service revenue.

Do not fix these displays or silently select the largest/smallest number during
migration. The manifest captures three separate observations in **integer cents**;
differences against the proposal are signed and explicit. A future approved
extractor must reproduce exact existing formulas, preserve original dollar fields,
validate decimal conversion and flag missing/conflicting unit aliases. Never guess
units from magnitude or replace missing `amountCents` with a dollar number.

## Version-one manifest contract

Authoritative executable schema: `lib/ledger/import/manifest.mjs`. Unknown fields,
unsupported versions, unsafe/negative/fractional cents and invalid timestamps reject.
This schema validates a normalized **asserted** snapshot; it cannot authenticate
an evidence ID or prove the original record hash without the protected original.

| Field group | Required provenance |
| --- | --- |
| Envelope | schemaVersion 1, mode `shadow_only`, target environment, fixed UTC cutoff; no current-time/random defaults |
| Snapshot coverage | Snapshot ID/capture time, complete flag, independent coverage-review evidence, count and deterministic source-key/original-hash set digest; incomplete/changed sets hold the report |
| Source projects | Explicit project/environment mapping with approval evidence; mismatches/missing projects hold even if a row is mislabeled Production |
| Original row | Firebase project, collection, original document ID, canonical original hash; stable sourceKey/importId independent of mutable client/amount/terms |
| Identity | Original UID, resolved UID, optional email **key**, identity-resolution evidence, explicit reviewed UID registry. No identity is inferred from email alone |
| Amount/status/time | Integer cents, explicit currency, original status and timestamp, timestamp basis, original method/type and credit effect. UTC millisecond timestamp is normalized; protected original hash/snapshot retains original precision/date interpretation |
| Associations | Client-owned project/appointment and verified artist mapping; allocation scope must match |
| Provider evidence | Provider/merchant/payment/environment, CARD vs EXTERNAL, external-details presence, exact status/amount/currency/client, verification state, evidence ID and readback hash; never token/card data/raw response |
| Manual evidence | Receipt-attestation ID, plus distinct adjustment/refund approval ID where needed. Reuse of the same manual receipt for two funding rows is a duplicate hold |
| Allocations | Unique ID, cents, value type, restrictions, exact policy ID/version/content hash and acceptance evidence reference. Purchased buckets are distinct from consumed session/supply allocations |
| Links | Referenced funding source for use/refund; optional exact `creditLedger` mirror with explicit review evidence; no fuzzy deduplication |
| Target overlap | Existing source/import/provider guards and original hash/client, existing target revision/purchased total/journal IDs, explicit exclusions |
| Strategy/observations | Exactly one opening-balance OR replay choice per client; three independent legacy display observations. Duplicate strategies/observations are held |

The email key is a privacy-conscious opaque identity reference, not authentication.
Do not use an unsalted real-email hash in public reports; dictionary attacks are
possible. A future approved extractor should use scoped HMAC/tokenization and keep
all mappings, evidence and originals in access-controlled storage. Original IDs,
UIDs and deterministic hashes can still identify people and must not be logged or
committed with real records. Only synthetic fixtures/reports belong in GitHub.

`sourceKey = SHA256(canonical([sourceProject, collection, originalId]))`.
`importId = legacy_ + sourceKey`. IDs deliberately exclude amount/client changes,
so correcting a manifest cannot create a fresh ID to bypass deduplication. The
manifest hash covers normalized content including approval/evidence references,
strategy, cutoff and existing-target snapshot; set arrays use deterministic
code-unit sorting. Same inputs in any row order produce identical output.
The record-set digest checks accidental omissions against the approved snapshot
assertion; it cannot prove coverage if the assertion itself is untrusted. A future
read-only procedure must establish consistent as-of-cutoff coverage and record
counts/watermarks independently. An arbitrary live paginated scan is not a trusted
point-in-time financial snapshot.

Provider identity uses environment/provider/merchant/payment across clients.
Manifest `providerKey` is a semantic grouping digest, **not** a Firestore path.
PR #62's provider guard path hashes its canonical source-key string again; a future
bridge must use its existing `sourcePath(canonical([...]))` contract, never assume
these digests are interchangeable. Generic reference strings alone are not
provider IDs. Unknown shared manual references/ambiguous near-duplicate dates and
amounts need human review; no algorithm can infer distinct cash receipts reliably.

## Opening balances, discrepancies and shadow comparison

Only fully resolved candidate records contribute to arithmetic. Reviews/exclusions
remain visible with reasons and unallocated cents; no residual is silently dropped
or converted to Studio Credit. Purchased opening proposal per restricted bucket:

`eligible purchased allocations + separately approved historical adjustments
 - linked service credit use - linked refunds/removals`.

A bucket includes value type, project, artist, appointment and exact policy/
acceptance reference. No restricted value is pooled into general Studio Credit.
Linked usage cannot exceed the specific original funding amount, even if other
receipts could cover an aggregate balance. Negative buckets hold the account.
Do not clamp negative values to zero or invent offsetting receipts.

Gross candidate receipts, candidate cash refunds and proposed remaining purchased
liability are separate totals. Credit use receives no new money; corrections
receive no new money; paid session/supply allocations are not available credit.
Historical collections must not become current-period revenue or current Square
settlement. Tax, fee earnings and retained liabilities need accountant-approved
classification, not inference from payment titles.

Opening-balance mode and replay mode are mutually exclusive for a client/cutoff.
An opening proposal over an existing target account is blocked. Already imported
sources with the same hash/client/ID are excluded; changed content or a collision
is held. New provider identity overlapping an imported payment is held. Future
existing-target snapshots need immutable lot-level provenance before any mixed
replay can be approved; the total-only offline projection is not proof of lot
availability. Related use of non-candidate funding is held conservatively.

Even a `shadow_match` cannot execute. Review exact candidate records/buckets, all
three display differences, missing evidence, unresolved liabilities and negative
or partial amounts before signing a plan. No new-plus-old portal sum is allowed.
Future shadow runs must use one approved source cutoff and paired target revision;
if either changes, invalidate approval and regenerate/review the manifest.

## Review categories and decision records

1. Identity unresolved/conflicting/shared email; missing/cross-client project,
   appointment or artist; restricted allocation/funding mismatch.
2. Missing/contradictory currency, amount units, timestamps or policy acceptance;
   combined booking fee/deposit; partial/over allocation; unapproved adjustment.
3. Unverified/manual electronic funds, failed installment, missing readback,
   historical EXTERNAL false positive, Sandbox/unknown environment or unmapped schema.
4. Duplicate source/provider/manual receipt; unreviewed mirror or standalone
   creditLedger; existing import/journal collision; mixed opening/replay.
5. Refund versus removal ambiguity, dispute reservations, pre-funding use,
   overconsumption, negative restricted bucket or legacy-display discrepancy.

Store future review decisions separately with reviewer authenticated UID/role,
server time, before/after manifest hashes, exact source/client/amount/restriction,
reason, evidence references and approval policy version. A historical attestation
must never be rebranded as provider readback or a newly signed client acceptance.
Legacy policy gaps need explicit owner/legal treatment in a distinct import command.
Keep the historical EXTERNAL record unchanged and excluded, retaining a protected
review reference; no private provider IDs belong in public PRs.

## Future atomic import and rollback design — NOT implemented

An authorized importer must atomically check reviewed manifest hash/cutoff and
current target revision; consume create-only legacy-source guards for **every**
original represented (including reviewed mirrors); claim provider guards where
applicable; and create immutable journal/provenance plus projection changes. A
read-only offline plan cannot guarantee absence of a concurrent future posting.
Only the server transaction can enforce that final check.

Opening entry ID should be stable for client/environment/cutoff, not a new random
or changed-manifest ID. Every represented source maps to that one opening entry;
replay instead maps each source to its deterministic import ID. Never do both.
Manual legacy funds require a distinct approved opening/legacy command and reviewed
accounting treatment (for example an opening reconciliation/equity counterpart).
Do **not** fabricate a CARD receipt to pass Stage 2A `receive`: its account schema
currently lacks this opening counterpart, and Stage 2B has no legacy-import command.
Adding that versioned command requires its own balanced/reconstruction/emulator tests.

Before commit, an abandoned plan needs no financial rollback. After a future import,
preserve originals and manifest; generate a deterministic reversal plan linked to
original imported journal IDs and the approved correction manifest. Reverse
subsequent allocations/reservations before funding, respecting engine dependencies
and expected revisions. Create-only reversal IDs/guards prevent duplicate correction;
provider/source consumption guards remain tombstoned. Never delete/edit journals
or replay the same receipt under a new ID. Re-import after reversal is not authorized
by this design: use an explicitly approved linked replacement-correction command,
with a separate tested chain of provenance. Rehearse interrupted/uncertain commits.
Portal rollback is a separately reviewed read-source switch, not deletion of money
history; do not restore the legacy reader if post-cutover activity would be omitted.
Proposed reversal ID: `legacy_reverse_` plus the SHA-256 of canonical
`[originalJournalId, approvedCorrectionId]`, with an independent single-reversal
guard on the original journal ID. The correction ID must identify one immutable
owner-approved correction; retries use the same ID, never a fresh approval to
bypass the original guard.

## Safest PR #61 integration and next increment

Stage 2C-2 should join #61 and #62 intentionally in a separate draft integration PR.
Add an authenticated server service **without live routes**: derive actor identity
from a verified session/service principal; load immutable current request, exact
consent and owner approval; bind client/environment/amount/project/appointment
revision/policy hash; and atomically check those references alongside account/lot
revision and consumed approval IDs. Do not accept client-supplied role, availability,
provider-verification or approval flags. Refresh/revoke stale authorization safely.

Emulator acceptance: unauthorized/cross-client/project commands denied; stale
consent/appointment/policy rejected; exact owner approval required and single-use
for restricted transfers/corrections; concurrent replay/redemption/approval use is
atomic; failed/unavailable provider evidence adds nothing; retry/uncertain commit
is idempotent; cancellation/offer expiry cannot erase purchased funds. Keep routes,
real provider calls and data migration disconnected. Stage 2A's old `promote` remains
unapproved; do not introduce bonus credit or discount-to-money conversion.

## Remaining owner approvals

None is needed to run this synthetic increment. Before **any real-record inspection**,
separately approve the exact environment/project, collection/field allowlist, date
range and cutoff, read-only principal, identity-resolution process, minimized
protected output location, retention/deletion period and reviewers. Do not export
names/emails/notes/health information unnecessarily or place financial data in chat,
GitHub, general logs or unprotected artifacts. No access/export has happened here.

Separately approve per-client identity/mirror/receipt/adjustment decisions and opening
versus replay strategy; obtain legal/accounting decisions on fees/advances, tax,
refunds, restrictions and missing historical policy acceptance. Later approval must
cover the exact versioned import command/manifest, IAM/rules changes (if needed),
staging rehearsal, backup/reversal plan and client read-source cutover. This PR
requests none of those actions and grants no migration/Production authority.

## Exact local commands

```sh
npm ci
npm run test:legacy-import
npm run reconcile:synthetic
npm run test:ledger
npm run test:ledger:emulator  # Node 22+, Java 21+; local demo project only
npx eslint lib/ledger/import tests/legacy-import scripts/reconcile-legacy-synthetic.mjs
npm test
npm run lint
npm run build
```

The synthetic command accepts no file/project arguments, loads only committed
synthetic fixtures and prints a deterministic offline report. Library functions
have no filesystem, Firebase SDK, network, secrets or financial-posting imports.
No production exporter/normalizer is included. Dependencies and lockfile are unchanged.

Verified locally: 26/26 offline import tests, 19/19 inherited ledger tests and
19/19 real local Firestore emulator tests pass. Scoped ESLint and deterministic
repeat-output/whitespace checks pass. Next production build passes (36 pages).
Full suite is 90/91: existing Jane/Janet client-search expectation failure remains.
Repository lint retains the existing unescaped apostrophe in
`AdminSquareInvoiceAssistant.js:164` and three image warnings. None is changed here.
