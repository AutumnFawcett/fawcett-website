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
