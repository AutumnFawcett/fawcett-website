# Studio-client payments — review-only release

This extends Phases 1A–1E and Founder entitlements (#22); it does not replace them.
Development uses only `demo-fawcett-dev` Auth/Firestore emulators and mocked Square
transport. No provider calls, settings changes, production access or activation are
part of this PR. Production migration execution remains hard-disabled.

## Admin workflows

Open `/admin/payments` as an active studio admin. The private studio payment panel
loads paginated `studioClients` through the existing server API. Names are display
labels; stable `studioClientId` is the identity. No Auth account is created.

**Manual:** choose a studio client, deposit/payment, positive CAD amount (at most
100,000 CAD), received date, method, unique receipt/reference when available, and
private notes. Review and submit. The immutable result is `studioPayments/{id}`,
`origin: manual`, `status: recorded`, `providerConfirmed: false`, plus a creation
audit containing actor and time. It is not proof of a Square payment, `paid` status,
a Founder contribution, entitlement or tattoo credit. No portal projection exists.
Do not place card numbers or security codes in notes or references.

**Hosted:** choose the client, amount and deposit/payment purpose, review, and
prepare checkout. This requires BOTH payment switches; it is unavailable by default.
The authenticated admin chooses the amount, not the payer. The payer follows a
Square-hosted URL and needs no Firebase login. The Square item is only “Tattoo
deposit” or “Tattoo payment”; names, health details, project text and notes are not
sent in line items. Share the link privately outside the application; no email is
sent automatically. Payment links are bearer capabilities: anyone possessing one
may pay that order, but obtains no client history or portal access. Square may
collect payer contact information under its own checkout flow.

The return page is non-authoritative. Only the existing signature-verified,
matched completed-webhook pipeline creates immutable `paymentTransactions`.
`purpose: tattoo_payment` never executes Founder fulfilment. The admin report shows
up to 100 hosted orders (a bounded operational view, not a complete reconciliation
export); the existing authoritative transactions are available only to active
admins. Original legacy payment history/editing remains below the new panel.
The legacy create-payment form is replaced; source document IDs are no longer
substituted for Auth UIDs.

## Optional identity/project evidence

The new UI deliberately omits Auth UID entry. The API accepts an optional existing
UID only against a unique, pre-existing server-only
`studioVerifiedAccountLinks/{studioClientId}` record:

- `state: verified`, matching `studioClientId`, `clientUid`, `reviewedBy`, `reviewedAt`;
- `accountCreatedAt` exactly matches the current Auth account creation time;
- account exists, is enabled and is not linked to another studio client.

This PR supplies NO link creation or approval endpoint. A separately reviewed
verified-account workflow is still required; do not populate links from matching
email addresses or casually provision evidence from this document.

A project ID requires pre-existing server-only
`studioProjectAssociations/{projectId}`: `state: approved`, matching `projectId`,
`studioClientId`, reviewer/time and exact `projectFingerprint` from the shared typed
fingerprint function. An Auth-owned project additionally requires that same
verified UID. Changed/missing/conflicting projects fail closed. Association evidence
is not created by payment requests. Until separately reviewed association tooling
exists, use no project on manually created clients. No originals are modified.

Orders retain studio ID, optional verified UID, optional project and its approval
fingerprint. Charge/refund/dispute transactions and processed webhook records
inherit them only from trusted orders/original charges, never provider-supplied
identity claims. Founder identifiers, effects and behavior are unchanged.

## Retry, accounting and recovery

- Money is validated as positive safe integer CAD cents; browser decimal input is
  parsed into cents, with server validation authoritative.
- An opaque request ID maps to one deterministic destination. A request cannot
  change client, amount, notes, actor, action or Square environment on retry.
- Manual receipt references lock method/reference pairs globally. Reusing one
  with a new request is a conflict; use a distinct verified receipt per actual
  payment, including installments against one invoice. Blank references cannot
  prevent a human intentionally creating two different requests for one payment.
- A transaction atomically writes record/order, request mapping and audit. Source
  client/project/link documents are transaction reads, protecting against changes
  during reservation. At most 20 new hosted requests/admin/hour; retries bypass
  that allocation limit.
- Hosted checkout reuses the existing `createAndAttach`, provider adapter, response
  validation, idempotency key and conditional identity attachment. Ambiguous
  transport/attachment failure retains the same order and retry key. Concurrent
  attachment may return a recoverable error; retry the original request.
- The UI retains only request ID in session storage through retries/reloads, not
  payment/contact/notes content. Re-enter original details after reload. Successful
  submission disables the form until “Start another payment.” Never clear an
  uncertain marker just to bypass a conflict. Lost browser/session markers require
  operator reconciliation before a replacement request.
- A malformed provider response fails closed and needs operator reconciliation;
  it is not automatically retried under a new order. No failed request is proof
  that Square did not create a payable link.
- Existing signature, amount/location/environment checks, duplicate event hashes,
  transaction identity collision checks and immutable parent-linked refund/dispute
  effects are reused. Refund/dispute metadata follows the original charge even if
  studio files later change. No automatic financial history rewrite or credit
  adjustment occurs. Existing WON-dispute recovery remains manual reconciliation.
- Manual records are immutable in this release. Correcting an accounting mistake
  requires a reviewed append-only adjustment workflow; no silent edit/delete or
  duplicate “replacement” entry. This adjustment UI is a remaining requirement.

## Dashboard invoices are separate

Owner-created Square Dashboard invoices are NOT automatically imported. The website
processor requires a trusted website `paymentOrders.providerOrderId` mapping.
Unrecognized provider orders cannot create website charges or tattoo credit.
For a separately authorized Dashboard workflow, verify payment completion in Square,
record the specific receipt as `square_dashboard` in the private manual panel, and
retain the external invoice/payment reference. This remains bookkeeping, not
provider-confirmed website accounting. Reconcile gross, refunds, fees/net and open
balances outside this UI. Never invent a website order mapping to force recognition.
Invoice lifecycle/import and recurring membership billing require later PRs.

## Privacy, fence and production prerequisites

New roots `studioPayments` (including audit), `studioPaymentRequests`,
`studioPaymentReferenceLocks`, `studioPaymentRateLimits`,
`studioVerifiedAccountLinks`, and `studioProjectAssociations` remain default-denied
by checked-in rules. The authenticated API is their access boundary; browser admins
cannot forge evidence or write these records directly. Do not add portal allowlists.
The existing operator intentionally stops on unknown roots/child collections;
these private roots and audits require explicit inventory-scope review before a
future production inventory. Do not waive that stop or activate its factory.

`/api/admin/studio-payments` POST preflights maintenance. All service writes and
storage writes use the fenced Admin facade, with the control read inside committing
transactions. Provider calls check again before transport; this cannot atomically
fence an external HTTP request. Pause/drain provider writers for cutover and reconcile
ambiguous in-flight orders. GET reports remain authenticated/admin-only during
maintenance. Raw privileged SDKs remain outside Firestore rules enforcement.

Production-only, owner-operated setup after separate deployment/activation approval:

1. Verify production browser and Admin bindings/database/rules identify the retained
   `fawcett-website-sandbox`; preserve existing Auth accounts, IDs and history.
2. Scope six public Firebase app settings and server-only Admin project/email/key to
   Vercel Production ONLY. Verify they bind the same approved backend; the configured
   project name alone is insufficient evidence. No Production values in Preview.
3. Preview/Codex use fixed demo config or absent optional public defaults, Admin
   project `demo-fawcett-dev`, no Admin key/client email/cloud credential binding,
   no Square token and both switches false. `Non-demo Firebase Admin project rejected`
   means an incompatible live Admin project reached the emulator-mode guard. Fix
   environment scope, never remove the guard. Hosted Preview does not have Codex's
   loopback emulators. Do not repeat the September branch-scoped Firebase recipe.
4. Independently approve live merchant/location, explicit `SQUARE_ENVIRONMENT`, token,
   signature key and exact HTTPS webhook URL. Reuse validated canonical-origin
   configuration `FOUNDER_CANONICAL_ORIGIN`; studio returns to `/payments/return`.
5. Deploy only reviewed compatible app/rules/index artifacts after the privacy
   cutover gates. Existing provider-order lookup queries require verified index
   coverage outside Codex. Set the approved write-fence state deliberately; never
   auto-open a missing control. Backup/restore evidence and callback recovery remain
   prerequisites. This PR does not supply a production migration adapter.
6. Leave `SQUARE_PAYMENTS_ENABLED=false` and
   `SQUARE_STUDIO_PAYMENTS_ENABLED=false`. Separate owner approval is required to
   enable BOTH for studio checkout. The global switch also affects Founder checkout:
   separately review Founder exposure before enabling it. Notifications, verification
   delivery and subscriptions remain disabled. No scheduler is added.
7. Before activation, review hosted-link retry/double-payment behavior with Square
   Sandbox in a separately approved isolated provider test, then perform the owner's
   controlled live acceptance/reconciliation procedure. Current tests mock transport;
   historical #20 proves earlier Sandbox checkout, not current studio checkout.
8. Roll back new link creation by switching studio/global creation off outside Codex
   under approved procedures. Disabling checkout must NOT disable webhook handling:
   existing payable links, delayed charges, refunds and disputes still arrive.
   Disable/cancel outstanding links in Square under separate authorization when
   required. A maintenance fence makes callbacks retryable (503), not durably queued;
   provider retention is finite, so pause/replay/reconcile procedures are mandatory.

## Validation

`npm run test:studio-payments` uses synthetic Auth/Firestore emulators and mocked
Square transport; it is part of `npm test`. Tests cover no-account records, private
read/write boundaries, admin authorization, forged fields/signatures, verified UID
and project mismatch, receipt and request deduplication, concurrent requests,
ambiguous/partial checkout recovery, fence closure, and charge/refund/dispute
identity propagation. Run full `npm test`, `npm run lint`, `npm run build` before
review. No live delivery or provider activation follows from passing tests.
