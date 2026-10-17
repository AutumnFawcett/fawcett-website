# Tattoo Project Payment Plans — request-only release

This focused release is based on `main` (`ba67999`), retaining the existing
consultation login, request, conversation and message workflow. It reuses the
existing membership page URL, tier amounts and Fawcett visual language rather
than bringing the coordinated development backend into this release.

## Client and studio workflow

1. Open the homepage's **Explore Payment Plans** link or
   `/tattoo-project-membership`.
2. Choose Starter ($500 initial + $150/month), Builder ($750 + $300/month),
   or Commitment ($1,000 + $500/month). Amounts are CAD.
3. The existing `/consult` screen preselects the preference. Clients can change
   or clear it, sign up or log in as before, and complete their consultation.
4. The plan description is appended to the existing `request.budgetRange`
   string and included in the existing conversation's initial summary. The
   client's separately entered project budget is retained. The existing admin
   consultation detail/search and project conversion therefore retain the
   preference without requiring a new collection, field permission or inbox.

This annotation is descriptive, not structured billing data. Future billing
must obtain explicit approved terms and a fresh enrollment decision; it must
never interpret this string as consent, paid status, usable credit or a charge.
No payment SDK, checkout endpoint, recurring enrollment, credit posting or
notification delivery is added or activated. The former standalone membership
application component is retained but this page now directs requests through
consultations. Existing historical membership records are untouched.

Payments are **intended** to become dollar-for-dollar Fawcett Studio Credit,
subject to final disclosed program terms. No fixed tattoo price, appointment,
acceptance or artist availability is promised.

## Validation

- `npm test`: tier values, preference annotation, preservation of entered budget,
  standard consultations and invalid/array plan inputs.
- Build with synthetic Firebase public configuration, then
  `npx playwright install chromium` and `npm run test:browser` (or set
  `CHROMIUM_PATH` to an installed Chromium executable).
- Browser coverage: 390px/1280px layouts, all three handoffs, invalid query
  values, changing/removing the preference, signup/login controls, and a
  synthetic existing-account login retaining the plan and consultation fields.
- Browser tests block all external traffic; the login case mocks Auth transport.
  They do not submit production records or prove live Firestore acceptance.
  No live Firebase, Square or email service is used.
- `npm run lint` and `npm run build`.

## Shortest release path

Review this PR against `main`, approve the request-only copy, and merge only
when the owner approves production deployment through the existing release
process. No new environment variables, database indexes, rules deployment,
operator activation or data migration is required by this feature. Do not use
live Firebase configuration for Codex/browser tests or Preview validation;
use synthetic demo configuration and blocked external transport as above.

After an authorized release, verify the public plan cards and consultation
handoff. Any live submission smoke test requires separate owner authorization;
review the request and initial conversation in the existing inbox if performed.
Rollback uses the prior website release; no record rollback or deletion is
needed. Final written terms and separately approved Square integration remain
prerequisites to collecting payment, not to publishing this request-only page.

## Preview build / browser initialization fix

Firebase Auth, Firestore and Storage are no longer initialized at import time.
`withFirebase` protects all 24 Firebase-consuming components: server rendering
and the initial hydration render show a loading state; a browser effect validates
configuration and initializes the existing Firebase SDK services. Only then can
the component mount, obtain the SDK objects through `getFirebaseClient()` and
start its existing authentication/listener workflows. The SDK objects and all
Firestore calling patterns remain unchanged; these are not proxy references.
The corresponding effects include the stable Auth/Firestore objects in their
dependency arrays.

A deployment with incomplete configuration can build and display public pages.
Its interactive account features show an accessible, explicit configuration error
with a retry action. No fallback project, API key or automatic emulator connection
is supplied. SDK initialization errors also reach that error screen. Subsequent
login/submission failures retain the existing error handling. A conflicting
already-initialized default Firebase app is rejected instead of reused.

Validation for this fix:

- Full `npm run build` with all six public Firebase variables absent and the local
  dotenv file temporarily excluded (restored afterwards), simulating Preview.
- Against that build:
  `TEST_FIREBASE_MISSING=1 npm run test:browser -- firebase-missing.spec.js`.
  These tests cover missing-config errors on admin/client/login/consult routes,
  no Firebase traffic, and the public payment-plan handoff.
- A separate full build with explicit synthetic demo configuration, followed by
  `npm run test:browser -- plans.spec.js`, including synthetic existing-account
  login. No live credentials or network calls are used.
- `npm test` covers initializer behavior, exact SDK object reuse, conflicting
  project rejection, missing configuration and propagated SDK errors. It also
  verifies each preferred plan in the full consultation message summary beyond
  the short inbox preview. That full summary remains the message `body` shown by
  the existing admin inbox, while `request.budgetRange` remains available in the
  admin consultation detail.

The Playwright server is always started fresh, so stale processes cannot silently
serve a previous build/configuration. Set `CHROMIUM_PATH` if using system Chromium.
Nothing in this fix configures or activates Firebase, Square or production delivery.
