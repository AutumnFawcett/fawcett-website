# Tattoo checkout — Square Sandbox (test only)

This small, production-compatible slice builds on the existing live Payments page rather than importing the unrelated multi-project migration/backend from the dev branch.

## What ships
- A server-side endpoint at `/api/admin/tattoo-checkout` for Square's **CreatePaymentLink** (one-time quick-pay).
- Requests require an existing Firebase Portal ID token. The server verifies the token using Firebase Authentication and reads only that user's own `adminUsers/{uid}` document through **Firestore REST with Firebase Auth Rules**. Only active admins pass.
- Only CAD tattoo deposits, sessions and consultations, with an explicitly reviewed amount ($1 to $10,000), are accepted.
- Square Sandbox link generation uses a unique, retryable idempotency key and server-only Sandbox credentials.
- The existing admin invoice helper shows a Sandbox test button **only when enabled**. Square Dashboard invoicing works unchanged and remains the real-payment path.

## Safety gates
The test route is enabled **only** when ALL are true:
`VERCEL_ENV=preview`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID=fawcett-website`,
`NEXT_PUBLIC_FIREBASE_API_KEY` is configured, plus these **server-only Preview variables**:

```
SQUARE_TATTOO_SANDBOX_ENABLED=true
SQUARE_TATTOO_ENVIRONMENT=sandbox
SQUARE_TATTOO_SANDBOX_ACCESS_TOKEN=<Square Sandbox application token>
SQUARE_TATTOO_SANDBOX_LOCATION_ID=<Square Sandbox location>
```

Do **not** put Square tokens in `NEXT_PUBLIC_` variables. Do not change the existing production Firebase project, Firebase IAM, rules, existing Square Founders variables, or any live payments switches. No new database collections or environment variables are required unless you explicitly choose to test in Preview.

`VERCEL_ENV=production` makes this route return 503 even if someone copies Sandbox settings into Production. Sandbox checkout does not create real charges, confirmed payment ledger entries, subscription plans, or credit. No real customer details are transmitted in the Square API payload.

## Next release, separately authorized
To collect **real website checkout payments**, implement a secure production-purpose switch, persisted idempotent payment-order and transaction ledger, signed Square webhook validation, charge/refund/dispute reconciliation and tested owner-reviewed production credentials. Only then consider server-posted dollar-for-dollar Studio Credit and future subscriptions, after terms and tax review.

Square Checkout API: https://developer.squareup.com/reference/square/checkout/create-payment-link
Firestore REST Auth: https://firebase.google.com/docs/firestore/use-rest-api

Do not activate a live charge path as part of this PR.
