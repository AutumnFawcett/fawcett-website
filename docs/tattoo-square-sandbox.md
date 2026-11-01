# Tattoo payments — isolated Square Sandbox order and webhook journal

## Current state
This is a **test-only** extension of the existing Fawcett admin Payments page, not a live payment or membership feature. The public Production domain keeps the Square API routes hard-disabled by the Vercel environment check. Owner-created Square Dashboard invoices are still the current real-payment option.

The existing `/api/admin/tattoo-checkout` endpoint now requires a configured, writable **Sandbox journal** before it can return a simulated payment link. If that journal is unavailable, the checkout fails closed instead of issuing a link without a trusted order identity.

## Verification flow
1. A logged-in, active Fawcett studio admin requests a reviewed one-time CAD Sandbox link (deposit / tattoo session / in-person consult); the server validates the existing `fawcett-website` Firebase Auth token and admin record.
2. The server checks access to the **separate** Firestore project `fawcett-website-sandbox`, asks Square Sandbox for the link, and atomically stores the idempotency key hash, exact Square order ID, link ID, amount, currency, location and purpose in `tattooSandboxOrders` and `tattooSandboxOrderLookup`.
3. Square sends a notification to `/api/payments/webhooks/tattoo-sandbox`. The server verifies the HMAC-SHA256 header against the **exact subscribed HTTPS notification URL and unmodified request body**, checks Sandbox environment and event ID, and writes the event hash/dedupe record in `tattooSandboxWebhookEvents`.
4. A COMPLETED payment is recorded in `tattooSandboxTransactions` only if its Square order, location, currency and amount match that existing trusted Sandbox order. Duplicate notification IDs and repeated charge updates are idempotent. Unrecognized/mismatched signed events are journaled as **unlinked**, not counted as payment.
5. Linked refund and dispute notifications are recorded as **review-needed**, not automatically applied to client credit, appointment status or refunds. All events and transactions retain `studioCreditIssued: false`; no existing `payments`, `creditLedger`, `clients`, or `appointments` collection is changed.

No client names, emails, card details, or member balances are sent in our Square quick-pay request or stored in the new journal.

## Owner approval required before even running a Sandbox transaction
A separate, appropriately scoped Sandbox-only service account must have Firestore access **only** to `fawcett-website-sandbox` (this PR does not grant access or create the account). Keep private keys/tokens server-side and never paste them into chat, GitHub or screenshots. The following need to be scoped to a specifically approved **Vercel Preview deployment**, never Production:

```text
SQUARE_TATTOO_SANDBOX_ENABLED=true
SQUARE_TATTOO_SANDBOX_WEBHOOKS_ENABLED=true
SQUARE_TATTOO_ENVIRONMENT=sandbox
SQUARE_TATTOO_SANDBOX_ACCESS_TOKEN=<Square Developer Sandbox access token>
SQUARE_TATTOO_SANDBOX_LOCATION_ID=<Square Sandbox location ID>
SQUARE_TATTOO_SANDBOX_SIGNATURE_KEY=<Sandbox webhook subscription signature key>
SQUARE_TATTOO_SANDBOX_NOTIFICATION_URL=https://<approved-preview-host>/api/payments/webhooks/tattoo-sandbox
SQUARE_TATTOO_SANDBOX_JOURNAL_PROJECT_ID=fawcett-website-sandbox
SQUARE_TATTOO_SANDBOX_JOURNAL_CLIENT_EMAIL=<Sandbox-only service account email>
SQUARE_TATTOO_SANDBOX_JOURNAL_PRIVATE_KEY=<Sandbox-only private key>
```

The existing Preview's `NEXT_PUBLIC_FIREBASE_PROJECT_ID` **must** remain `fawcett-website` for studio-admin authentication. The separate journal service account independently writes only to `fawcett-website-sandbox`. Required Preview Firebase web variables, including `NEXT_PUBLIC_FIREBASE_API_KEY`, must be valid. The Sandbox webhook subscription must be configured in Square's Developer Dashboard for payment, refund and dispute events using exactly the declared notification URL. Set none of this up without owner approval and a defined least-privilege policy.

**Do not deploy/firestore rules, migrate records, alter IAM, or set Production credentials as part of this code-only release.** No Firebase Admin SDK or new npm dependency is required; Sandbox journal access uses a standard Google OAuth2 service-account assertion and Firestore REST API.

## Important limitations
- The existing live site's historical admin `payments` and `creditLedger` remain distinct from this Sandbox journal. A signed event does **not** activate production Studio Credit.
- Square Sandbox checkout simulates charges; it does **not** prove live settlement to a bank account.
- Refund/dispute statuses require review, and events may arrive out of order. An unlinked event is retained for investigation rather than automatically linked later.
- External Apple Calendar scheduling is separate. Automatic client subscriptions and monthly billing are still disabled.
- Service-account keys, notification URL, Square webhook subscription, database access and an end-to-end Sandbox test are **not** provisioned by merging this PR.
- Concurrency and event redelivery must be tested under a real Sandbox session before allowing production payments.

## References
- [Square Checkout CreatePaymentLink](https://developer.squareup.com/reference/square/checkout/create-payment-link)
- [Square webhook signature verification](https://developer.squareup.com/docs/webhooks/step3validate)
- [Firestore REST API authentication](https://firebase.google.com/docs/firestore/use-rest-api)

## Future go-live gate
Live billing needs a separate code and approval process covering trusted production order/client identity, idempotent charge/refund/dispute handling, provider-readback and reconciliation, taxes and terms, manual exception handling, and an owner-approved activation flag. Recurring plans and dollar-for-dollar Studio Credit remain separate later releases.

## Preview-only failure logging (PR #59)

Firestore commit failures already capture HTTP status plus optional allowlisted
`googleReason` (from `error.details[].reason`) and `missingPermission` (from
`error.details[].metadata.permission` or a recognized permission token in the
Google message). Those optional fields are returned to the admin. They are absent
when Google provides no recognized details; HTTP 403 alone does not identify a
specific permission or policy. The checkout error display now includes
`googleReason`, matching the journal-preflight display.

The failure handler emits one JSON warning in **Vercel Preview only**, labelled
`tattoo_sandbox_checkout_failure`. The response and log use the same revalidated,
allowlisted diagnostic. Only static stage/reason values, an integer HTTP error
status, and recognized Google reason/permission constants can be emitted. Raw
errors, stacks, response bodies, credentials, headers, tokens, account identities,
project/document paths, Square IDs, checkout URLs, amounts and idempotency keys
are never included. Logging failure does not change the controlled response or
retry provider requests. There is no new flag or configuration requirement, and
Production remains hard-disabled.

Fictional generic failure (not an assertion of the live cause):

```json
{"event":"tattoo_sandbox_checkout_failure","stage":"sandbox_journal_write","reason":"sandbox_firestore_commit_failed","httpStatus":403}
```

**Next diagnostic step:** after code review and the existing PR Preview becoming
Ready, inspect Preview runtime logs for this event on
`/api/admin/tattoo-checkout`. Logging cannot recover an earlier exception
retroactively. If a new diagnostic is needed, the owner must separately authorize
the existing journal-only preflight: it can create two diagnostic documents but
never calls Square. Do not run checkout, change settings, or regenerate the
original idempotency key for this investigation. If the preflight documents
already exist, its successful read does not exercise the failed commit path.
Share only the allowlisted diagnostic fields. If no recognized Google details
are present, retain the generic 403 result rather than guessing an IAM change;
a separately approved owner-side read-only policy/permission investigation is
then needed.

## Resource-name correction and journal-only verification

The REST store now separates `projects/.../documents/...` resource names in
`writes[].update.name` from HTTPS URLs used for GET and commit transport. Each
write retains `currentDocument: { exists: false }`; the two writes remain one
atomic commit. This fixes a confirmed API-format defect, but the observed 403
cause remains unproven until an owner-approved write succeeds.

Official references:
- https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents#Document
- https://firebase.google.com/docs/firestore/reference/rest/v1/Write

After the corrected PR Preview is READY, the owner may separately authorize and
perform this test (the coding agent must not perform authenticated writes):

1. Open the exact corrected Preview deployment, sign in as an active studio
   admin, and visit `/admin/payments`. Do not use the production domain.
2. Click **Check Sandbox journal (no Square request)** once. Do not click the
   checkout/link button or reuse the failed TAPOUT checkout.
3. Expect POST `/api/admin/tattoo-checkout` HTTP 200 with exactly:
   `{"sandboxJournalWritable":true,"squareCalled":false,"studioCreditIssued":false}`.
   The UI says “Sandbox journal write passed. No Square link or payment was created.”
4. To prove a NEW commit occurred, establish that both deterministic probe
   documents were absent before this run, then confirm both exist afterward in
   `(default)` → `tattooSandboxDiagnostics` in `fawcett-website-sandbox`, with
   `kind: journal_preflight`, `version: 1`, `environment: sandbox` and new creation
   timestamps. IDs are `journalId("probe", "fawcett-journal-preflight-v1-first")`
   and `journalId("probe", "fawcett-journal-preflight-v1-second")` (SHA-256).
   An HTTP 200 with existing probes proves reads only. Do not delete probes,
   change IDs, or modify configuration to force a new write without approval.

If the corrected Preview still returns 403, stop after that attempt. Inspect
existing Google Cloud audit logs for the exact UTC request time in project
`fawcett-website-sandbox`, filtering `protoPayload.serviceName="firestore.googleapis.com"`
and `protoPayload.methodName="google.firestore.v1.Firestore.Commit"` (include
Data Access and Policy Denied logs). Required evidence: principalEmail matching
`tattoo-journal@fawcett-website-sandbox.iam.gserviceaccount.com`, resourceName,
status code/message, authorizationInfo permission/resource/granted entries,
and any policy-denial reason or VPC Service Controls violation metadata. Keep
raw request bodies, document values, credentials and tokens private. If no log
exists, report the logging/retention gap; do not infer a missing IAM permission
or enable logging/change policies as part of this code-only task.

## Square webhook envelope compatibility

Square's payment.created/payment.updated, refund.created/refund.updated and
dispute.created/dispute.state.updated schemas do not require a top-level
`environment`. The parser accepts its absence. If explicitly supplied, only a
string equal to sandbox (case-insensitive) is accepted as a compatibility check;
that untrusted value never authenticates the environment. Preview-only guards,
Sandbox subscription HMAC key, exact configured URL, raw-body constant-time HMAC,
isolated journal and trusted order/location/CAD amount checks remain unchanged.
Tests use representative envelopes with merchant_id, event_id, created_at,
data.type/id/object and dispute location_id, signed with synthetic keys and
handled entirely in memory. No real webhook is sent.

References (API version 2026-09-16):
- https://developer.squareup.com/reference/square/payments-api/webhooks/payment.created
- https://developer.squareup.com/reference/square/payments-api/webhooks/payment.updated
- https://developer.squareup.com/reference/square/refunds-api/webhooks/refund.created
- https://developer.squareup.com/reference/square/refunds-api/webhooks/refund.updated
- https://developer.squareup.com/reference/square/disputes-api/webhooks/dispute.created
- https://developer.squareup.com/reference/square/disputes-api/webhooks/dispute.state.updated

Sequential duplicate events and payment IDs do not create extra charge records.
Concurrent create conflicts return 503; redelivery can then read the committed
record. Same event ID with changed raw bytes fails closed. Already recorded
unlinked events remain unlinked on identical redelivery, even if an order is
subsequently available. There is no automatic backfill/provider readback or
complete refund/dispute state history; review records do not issue Studio Credit.

Before any owner-approved payment test, verify the exact new READY Preview
commit and inspect the existing Square Sandbox subscription URL against the
configured notification URL (including hostname/path, without exposing its key).
The subscribed hostname must serve that corrected commit; the deployment URL
and stable branch alias are not interchangeable for HMAC. Confirm payment event
subscriptions and reachability without changing settings. Then separately
authorize one new low-value Sandbox test. Do not retry TAPOUT or rerun writes as
part of code verification. Preserve the owner-verified diagnostic documents.


## External-payment confirmation correction (November 1, 2026)

`COMPLETED` plus a matching order/amount/location does not establish a
Square-processed charge. Square's external-payment documentation explicitly
allows completed bookkeeping payments whose proceeds are not credited to the
seller's Square account. `external_details.type=CARD` does not make
`source_type=EXTERNAL` a Square card payment.

For this restricted Sandbox Checkout flow, only exact `source_type=CARD` is
eligible. EXTERNAL, CASH, missing/unknown types and all other source types are
journaled `unlinked` with `unsupported_payment_source`; no charge is created.
Even CARD with an external_details field fails closed. Existing trusted-order,
location, exact CAD amount, COMPLETED, signature and Preview guards still apply.
Sandbox Checkout documents credit/debit cards only; wallet, bank, Afterpay,
Square-account and gift-card flows are not approved by this change. CARD is a
source-category check, not an independent credit/debit product validation or
proof of bank settlement. Sandbox never settles real funds.

### Prior owner-run test: reclassified evidence
The previously recorded November 1 $1 CAD Developer Control Panel payment was
reported by the owner to have source_type=EXTERNAL and external_details.source=
Developer Control Panel. Its existing confirmed_charge must be flagged for manual
review, NOT counted as proof of Square-processed card acceptance. It proved
signed delivery and journal plumbing only. Preserve all existing records.
No Firestore migration/deletion/overwrite is part of this correction.

Historical same-event replays return the previously stored outcome before
classification. An old confirmed_charge response is therefore not new source
verification. The regression explicitly preserves that behavior and records the
review requirement; do not redeliver old events as proof this guard works.
Existing transactions do not retain source_type, so identify candidates via
owner-supplied payment IDs and original Square delivery payloads, not by guessing
from COMPLETED/providerConfirmed. No automated record audit has been performed.

### Provider verification and remaining gate
A signed, matching CARD webhook is sufficient for the present isolated Sandbox
journal classification; this correction does not add any provider API requests.
Before live billing or Studio Credit, require a separate server-side Sandbox/
Production-specific GetPayment readback/reconciliation design comparing payment
ID, source_type, status, order, location, exact amount/currency and allowed card
product, failing closed on discrepancies/unavailability. Readback must apply the
same source guard: fetching a COMPLETED EXTERNAL payment does not repair it.
Capture/payment completion is not proof of bank settlement; settlement claims
need a separate settlement reconciliation process.

No new payment test is authorized. Next establish an owner-approved procedure
that actually produces a Square Sandbox CARD payment linked to the trusted
order (the Developer Control Panel EXTERNAL simulator cannot satisfy it).
Then separately authorize the test. Refund/dispute live tests, deliberate
redelivery/concurrency, recovery/readback and Production readiness remain gated.

Official references:
- https://developer.squareup.com/docs/payments-api/take-payments/external-payments
- https://developer.squareup.com/reference/square/objects/Payment
- https://developer.squareup.com/docs/checkout-api/guidelines-and-limitations
- https://developer.squareup.com/reference/square/payments-api/get-payment

## Server-side GetPayment readback (supersedes earlier verification gates)

New confirmations now require GET against the fixed Sandbox Payments API host,
using only the existing server-side Sandbox access token, API version 2026-09-16,
no cache, no redirects, an 8-second timeout and a 64-KiB streamed response limit.
Signature/configuration checks run first. No client route or UI accepts a token
or exposes readback. No raw response, card details or credentials are persisted
or logged. Failure responses retain the existing generic 503 outcome.

The retrieved payment must match webhook payment ID and the trusted journal's
Square order ID, location, exact integer amount and CAD currency; status must be
COMPLETED and source_type must be CARD, without any external_details property.
When card_details exists, CAPTURED is required on both retrieved and webhook
payments. When card_type is supplied, CREDIT/DEBIT only. Missing optional card
details do not bypass required source/status/identity checks. A successful
readback is evidence of a completed Sandbox card simulation, not bank settlement.

New confirmed transactions store providerReadbackVerified=true,
paymentVerificationVersion=1 and sourceType=CARD. isVerifiedSandboxCharge is the
mandatory minimum eligibility predicate for future reconciliation (in addition
to trusted order identity, amount, location and business authorization checks).
No client-credit or revenue reconciliation is enabled by this release. The
current journal uses this predicate before linking refund/dispute reviews.
Historical providerConfirmed=true is insufficient.

### Failure, replay and concurrency policy
- Network errors, timeout, invalid/oversized JSON, missing payment object and
  non-2xx responses (including 404, 429 and auth failures) return 503 with no
  event/transaction commit. Correct configuration or await recovery; redeliver
  the same event only under separate owner approval. No automatic provider retry
  loop runs inside the webhook handler.
- Provider PENDING/APPROVED is retryable with no event commit. Definitive
  contradictions are journaled unlinked/provider_payment_mismatch and never
  create a confirmed transaction. They require manual review, not automatic
  mutation or relinking of the same event.
- A completed CARD event whose trusted order/lookup is missing returns 503
  without an event tombstone. Identical delivery can reconcile after the journal
  becomes visible. Wrong unknown orders also remain unconfirmed/retryable.
- Already verified identical event deliveries reuse versioned evidence without
  another provider request; changed payload under the same event ID fails closed.
  Different event IDs for the same payment read back again but reuse the same
  create-only payment transaction. Concurrent creates retain 200/503 semantics;
  redelivery recovers without duplicate charge records. No distributed lock added.
- Historical confirmed events now return historical_confirmation_review_required
  instead of claiming fresh confirmation. Stored bytes are unchanged. New events
  cannot upgrade existing unversioned charges and are flagged
  historical_confirmation_requires_review. No backfill/migration is performed.
- Refund/dispute review records still are not a complete status history or
  automatic financial reversal. Out-of-order refunds/disputes without an eligible
  charge remain unlinked and need manual review; no credit or revenue is issued.

### Acceptance A — Sandbox Payments API CARD simulation (NOT hosted checkout)
Prepared procedure only; requires separate owner approval and a reviewed isolated
test harness before any write/payment request. Do not run it as part of this task.
1. Verify corrected READY Preview, matching Sandbox subscription URL, disabled
   Production checkout, and existing Sandbox credentials' PAYMENTS_READ access.
   Credential presence is not proof of API authorization; do not print tokens.
2. Prepare one fresh, owner-controlled, payable Sandbox order and corresponding
   trusted isolated order+lookup journal, exact 100 CAD cents, correct location,
   no tips/add-ons. The existing hosted simulator's EXTERNAL payment/order must
   not be reused. A separately reviewed harness must establish order payability
   and journal linkage; this change adds no order/payment creation endpoint.
3. Through the separately approved server-side harness/API Explorer in Sandbox,
   use Payments API CreatePayment with documented source_id=cnon:card-nonce-ok,
   a fresh idempotency key, autocomplete=true, amount_money 100 CAD, trusted
   location_id and order_id. Never expose the access token to app client code or
   persist source tokens. No real card; no hosted Test Payment simulator.
4. Require returned CARD/COMPLETED, matching identity/amount/location, and CAPTURED
   card_details when present. Let the resulting real Sandbox notification arrive;
   do not manufacture a matching webhook. Confirm delivery HTTP 200 and
   confirmed_charge, then exactly one transaction with versioned readback evidence
   and studioCreditIssued=false. Correlate IDs locally, never publish them.
5. Redelivery, refunds and concurrency tests require separate approval. This API
   simulation proves the backend card/readback path only, not hosted card entry,
   redirect behavior, customer checkout UX or bank settlement.

### Acceptance B — future real-card Production hosted checkout
BLOCKED: Production remains disabled. Requires a separate reviewed Production
implementation, explicit owner approval of real charge amount/fees, business
terms/tax treatment, reconciliation and refund plan, and dedicated Production
credentials/signature configuration. Never switch this Sandbox transport to a
Production host or relax its Preview guards.
After those gates only: one owner-controlled hosted checkout, verify real card
entry, final agreed total and redirect, Production GetPayment readback + trusted
order/location/amount + CARD/COMPLETED/capture evidence, matching signed delivery
and a single correctly reconciled transaction. Refund only with explicit approved
scope; normal processing fees may apply. Sandbox success cannot authorize this.

Square support's October 28, 2026 answer confirms hosted Sandbox does not allow
test-card entry; its Test Payment button simulates completion. Do not attempt to
force a CARD result or count EXTERNAL as CARD. This supersedes the older generic
Sandbox test-card instructions earlier in this document.
- https://developer.squareup.com/forums/t/unable-to-test-payment-flow-in-sandbox-for-square-hosted-checkout-page/27682
- https://developer.squareup.com/reference/square/payments-api/get-payment
- https://developer.squareup.com/docs/devtools/sandbox/payments
