# Square payment foundation setup

Phase 1A records verified Square webhook events and authoritative financial transactions. It does **not** expose checkout, recurring billing, campaign totals, or credit-ledger effects.

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
- `SQUARE_PAYMENTS_ENABLED` (emergency kill switch; leave `false` in Phase 1A)

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

Other event types are signature-validated and recorded as ignored. POS, appointment, and other Square payments are also ignored unless they carry a server-issued `reference_id` in the form `fawcett:<purpose>:<orderId>:<expectedCents>[:<enrollmentId>[:<clientUid>]]`, where purpose is `founders`, `membership`, `appointment`, or `other`. The webhook requires the integer CAD amount to equal `expectedCents`. A browser must never construct this link or supply a price/payment state. Before checkout is enabled, replace this compact linking convention with a pre-created, server-owned order/link record and validate amount, currency, location, and purpose against it.

## Local Sandbox testing

1. Create a Sandbox webhook subscription in the Square Developer Dashboard.
2. Expose the local Next.js route through an HTTPS tunnel and set the exact tunnel URL in both the subscription and `SQUARE_WEBHOOK_NOTIFICATION_URL`.
3. Point Firebase Admin only at a dedicated non-production project or the Firestore emulator. Do not use production credentials.
4. Set `SQUARE_ENVIRONMENT=sandbox` and keep `SQUARE_PAYMENTS_ENABLED=false`.
5. Use Square's Sandbox webhook test facility, then confirm one `paymentWebhookEvents` record per event and no transaction for an unlinked test payment.
6. Run `npm run test:payments`, `npm run test:firestore`, `npm run lint`, and `npm run build`.

The webhook handler performs no Square API request. It validates `x-square-hmacsha256-signature` as Base64 HMAC-SHA-256 over the exact notification URL concatenated with the exact raw body, using constant-time comparison. JSON parsing happens only afterward.

## Rotation and emergency response

To rotate a token, Firebase credential, or Square webhook signature key, create the replacement in the provider console, update the corresponding Vercel secret in the correct environment, redeploy, test a signed Sandbox notification, and only then revoke the old value. Never print secrets while diagnosing configuration.

`SQUARE_PAYMENTS_ENABLED=false` is the payment-creation kill switch. Phase 1A does not create payments at all, and later checkout code must refuse new payment creation unless this value is exactly `true`. Disabling checkout must **not** disable the webhook route: refunds, disputes, delayed status changes, and already in-flight payments can arrive after new sales stop. Keep webhook verification and recording online until all in-flight transactions are reconciled and the provider retention window has passed.

## Record behavior

Webhook keys combine the explicit environment with a SHA-256 digest of Square's event ID, preventing Sandbox/production collision. Firestore transactions serialize event claims and financial writes. An exact redelivery returns the stored outcome without a second effect; the same event ID with a different payload hash is rejected. Raw payloads and card data are never stored.

Completed charges remain charge records. Refunds (including partial refunds), chargebacks, and reversals are separate transactions linked by `parentTransactionId`; they never overwrite the original charge. Amounts are integer CAD cents. Fee and net amounts are omitted until Square supplies and the application explicitly validates them.

### `paymentWebhookEvents/{eventKey}`

Each record contains `provider`, `environment`, `eventId`, `eventType`, `payloadHash`, `signatureValidated`, `processingState`, `attemptCount`, `firstReceivedAt`, `lastReceivedAt`, `processedAt`, and `resultReason`. Identity fields and the payload digest must match on redelivery. The raw body is not retained.

### `paymentTransactions/{transactionId}`

Each record contains `provider`, `environment`, `currency`, `amountCents`, `type`, `status`, `purpose`, `providerTransactionId`, `webhookEventId`, `webhookEventType`, `reconciliationStatus`, `createdAt`, and `updatedAt`. Depending on the provider object and trusted link it can also contain `providerPaymentId`, `providerOrderId`, `orderId`, `enrollmentId`, `clientUid`, and `parentTransactionId`.

Browser clients cannot read webhook records or write either collection. Active admins can read payment transactions, but cannot write them from a browser. Clients cannot read transactions in this phase.
