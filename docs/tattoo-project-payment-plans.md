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
