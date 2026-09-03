# Square payment foundation setup

Phase 1B adds a server-only checkout service and Square Payment Link adapter. API and UI wiring are deliberately deferred because the application does not yet have an established server-side Firebase ID-token verification route. There is no public checkout endpoint or redirect endpoint, and no live `/founders` button. Subscriptions, taxes, shipping, inventory, discounts, tips, gift cards, splitting, campaign totals, and credit-ledger effects remain out of scope.

## Accounts and environments

A Square **merchant account** is the business account that ultimately owns locations and receives real payments. A Square **Developer application** supplies application credentials and webhook subscriptions. Its Sandbox resources, tokens, locations, customers, orders, and payments are separate from production resources. Never reuse a Sandbox signature key, token, location, or notification URL configuration in production.

The server requires an explicit `SQUARE_ENVIRONMENT` value of `sandbox` or `production`; there is no production default. Phase 1A must use `sandbox`.

## Server-only environment variables

Set these as encrypted Vercel environment variables, scoped to the intended Vercel environment. Never prefix them with `NEXT_PUBLIC_` and never paste their values into source control:

- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY` (the PEM may use escaped `\n` newlines)
- `SQUARE_ENVIRONMENT`
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_LOCATION_ID`
- `SQUARE_WEBHOOK_SIGNATURE_KEY`
- `SQUARE_WEBHOOK_NOTIFICATION_URL`
- `SQUARE_PAYMENTS_ENABLED` (emergency kill switch; leave exactly `false` until a separate approval)

Firebase Admin uses these individual service-account fields; do not commit a service-account JSON file. The webhook configuration is loaded only when the runtime route is invoked.

## Notification URL and webhook selection

Configure Square with the exact public HTTPS value stored in `SQUARE_WEBHOOK_NOTIFICATION_URL`:

`https://<deployment-host>/api/payments/webhooks/square`

Signature validation includes this exact string. Scheme, hostname, path, trailing slash, and case must match the Square Developer Dashboard subscription exactly.

Subscribe only to the events this foundation understands:

- `payment.created`
- `payment.updated`
- `refund.created`
- `refund.updated`
- applicable `dispute.*` events needed for chargeback lifecycle reporting

Other event types and unrelated Square POS payments are signature-validated and recorded as ignored. Payment Link webhooks may omit `payment.reference_id`, so completed charges require `payment.order_id` and resolve it against the trusted `paymentOrders.providerOrderId` mapping. The matched order supplies the internal order ID, amount, CAD currency, provider, environment, and purpose. If `reference_id` is present it must equal the internal order ID; identities are never substituted or used as fallbacks. Amount, currency, configured location, environment, and provider order must all match.

Only a Square payment whose status is exactly `COMPLETED` creates the immutable charge effect. `APPROVED`, `PENDING`, `CANCELED`, and `FAILED` deliveries are retained as ignored webhook events and never count as collected funds. Similarly, a refund effect is created only for `COMPLETED`; pending or unsuccessful refund states do not create financial records and cannot block a later completed event.

Square's documented dispute lifecycle includes `EVIDENCE_REQUIRED`, `PROCESSING`, `WON`, `LOST`, and `ACCEPTED`. A dispute can withhold funds before its terminal result, so the first observed debit-bearing state (`EVIDENCE_REQUIRED`, `PROCESSING`, `ACCEPTED`, or `LOST`) creates one immutable `chargeback` effect keyed by the Square dispute ID. Later state webhooks cannot create a second effect. `WON` does not automatically create a credit or reversal in this phase: recovery timing and settlement evidence require reconciliation before a compensating transaction can be recorded.

## Founder offer catalogue

The versioned catalogue is server-owned and accepts no custom amounts: `founder-10-v1` (1000 cents), `digital-founder-25-v1` (2500), `studio-supporter-50-v1` (5000), `art-founder-100-v1` (10000), and `opening-founder-250-v1` (25000). Every offer is CAD, quantity `1`, purpose `founder`, and has a fixed item name. The service—not a browser—creates the internal reference and idempotency key and supplies the configured Square location.

## `paymentOrders/{orderId}`

The create-only initial document uses a server-generated ID of at most 40 characters and contains `orderId`, provider `square`, explicit environment, purpose `founder`, versioned `offerId`, safe integer `amountCents`, currency `CAD`, status, nullable `clientUid`, nullable `providerOrderId`, nullable `providerPaymentLinkId`, nullable `checkoutUrl`, stable `idempotencyKey`, timestamps, and nullable safe `failureCode`. Status is one of `creating`, `pending`, `creation_failed`, `paid`, `refunded`, or `disputed`. Conditional transactions prevent a second provider identity from being attached. Browser clients—including admins—cannot access this collection.

The adapter accepts only trusted order and offer values and validates non-empty Square link/order IDs, an HTTPS `square.link` or `checkout.square.site` URL, and any returned order total/currency before persistence. An unclassified SDK exception has an ambiguous provider outcome, so it leaves the order `creating` and returns only a safe reconciliation-required error; `provider_creation_failed` is reserved for a future explicitly classified definitive rejection and is never inferred from arbitrary exception fields. Malformed received responses retain only `provider_response_invalid`; raw errors and secrets are not stored or logged. If Square returns a valid link but the conditional Firestore attachment fails, the order likewise remains `creating` with its original order ID and idempotency key for reconciliation. The server-only reconciliation service reloads that exact order, verifies its embedded order ID and environment, and repeats the idempotent provider request rather than creating a new internal order. Neither ambiguous failure returns the checkout URL.

## Local Sandbox testing

1. Keep `SQUARE_PAYMENTS_ENABLED=false` for normal automated tests. Tests inject a fake adapter and must never contact Square.
2. For a separately approved manual Sandbox checkout test only, use a dedicated non-production Firebase project, set `SQUARE_ENVIRONMENT=sandbox`, temporarily enable the flag only in the isolated test runtime, and use Square Sandbox credentials.
3. Create a Sandbox webhook subscription in the Square Developer Dashboard.
4. Expose the local webhook route through an HTTPS tunnel and use its exact URL in Square and `SQUARE_WEBHOOK_NOTIFICATION_URL`.
5. Confirm the Payment Link creates a distinct internal ID and Square order ID, then confirm its completed webhook atomically creates one charge and marks the order paid.
6. Disable the flag immediately after the isolated exercise and run all project checks.

The webhook handler performs no Square API request. It validates `x-square-hmacsha256-signature` as Base64 HMAC-SHA-256 over the exact notification URL concatenated with the exact raw body, using constant-time comparison. JSON parsing happens only afterward.

## Rotation and emergency response

To rotate a token, Firebase credential, or Square webhook signature key, create the replacement in the provider console, update the corresponding Vercel secret in the correct environment, redeploy, test a signed Sandbox notification, and only then revoke the old value. Never print secrets while diagnosing configuration.

`SQUARE_PAYMENTS_ENABLED=false` is the payment-creation kill switch. Phase 1A does not create payments at all, and later checkout code must refuse new payment creation unless this value is exactly `true`. Disabling checkout must **not** disable the webhook route: refunds, disputes, delayed status changes, and already in-flight payments can arrive after new sales stop. Keep webhook verification and recording online until all in-flight transactions are reconciled and the provider retention window has passed.

The service checks the kill switch before creating a Firestore record or invoking Square. If link creation or strict response validation fails, the order moves from `creating` to `creation_failed` with a safe code and can be reconciled without exposing provider details. Roll back checkout by setting the flag to `false`; continue processing webhooks for existing orders. A success/cancel browser redirect is presentation only and must never mark an order paid—only a verified, matched completed webhook can do so.

An otherwise valid completed payment whose Square order ID has no mapping yet is recorded as `retryable_unlinked`, not terminally deduplicated. This permits an identical signed event to be processed after the trusted mapping becomes visible while continuing to report unrelated provider orders as ignored. Payload-hash collision checks still run before every retry, and processed events remain terminally idempotent.

Phase 1A lifecycle assertions for signatures, event identity collisions, non-completed payment/refund states, refund order matching, dispute inheritance, retry behavior, and exactly-once effects remain covered. Assertions based on parsing the former compact `reference_id` convention were intentionally replaced by trusted `paymentOrders.providerOrderId` lookup assertions; the compact reference is no longer an authority, and an optional reference is now checked only for exact equality with the matched internal order ID.

## Record behavior

Webhook keys combine the explicit environment with a SHA-256 digest of Square's event ID, preventing Sandbox/production collision. Firestore transactions serialize event claims and financial writes. An exact redelivery returns the stored outcome without a second effect; the same event ID with a different payload hash is rejected. Raw payloads and card data are never stored.

Completed charges remain charge records. Refunds (including partial refunds), chargebacks, and reversals are separate transactions linked by `parentTransactionId`; they never overwrite the original charge. Amounts are integer CAD cents. Fee and net amounts are omitted until Square supplies and the application explicitly validates them.

### `paymentWebhookEvents/{eventKey}`

Each record contains `provider`, `environment`, `eventId`, `eventType`, `payloadHash`, `signatureValidated`, `processingState`, `attemptCount`, `firstReceivedAt`, `lastReceivedAt`, `processedAt`, and `resultReason`. Identity fields and the payload digest must match on redelivery. The raw body is not retained.

### `paymentTransactions/{transactionId}`

Each record contains `provider`, `environment`, `providerLocationId`, `currency`, `amountCents`, `type`, `status`, `purpose`, `providerTransactionId`, `webhookEventId`, `webhookEventType`, `reconciliationStatus`, `createdAt`, and `updatedAt`. Depending on the provider object and trusted link it can also contain `providerPaymentId`, `providerOrderId`, `orderId`, `enrollmentId`, `clientUid`, `providerState`, and `parentTransactionId`.

Browser clients cannot read webhook records or write either collection. Active admins can read payment transactions, but cannot write them from a browser. Clients cannot read transactions in this phase.
