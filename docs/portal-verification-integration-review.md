# Phase 5 integration review

## Baseline and scope

The owner had already merged PR #39 at 2026-10-15 13:42:57 UTC before this review began. The latest shared branch is `f80fea85a6129a61f1c81cf934d39fb65d4620c2`, including PR #38 (`602f25d`) and the Phase 5 implementation. Its source tree is identical to the reviewed PR #39 head (`5d828e8`). No merge was performed by this review.

The follow-up branch `codex/portal-verification-final-review` starts directly from that shared commit. This report records fresh validation of the existing implementation; it does not duplicate account-registration code, enable email delivery, change rules or migrate client records. No code/configuration defect requiring another implementation change was identified in the reviewed paths.

## Requirement review

| Area | Implemented behaviour and evidence |
| --- | --- |
| Standalone Tattoo Portal signup | `TattooPortalLogin` calls the nonthrowing `verifyAfterRegistration` helper after Auth creation. Normal signup opens `/portal/verify-email`; the existing founders destination is preserved. |
| Consultation signup | `ConsultRequestForm` requests verification after Auth creation and retains the current consultation flow. Verification send failure does not reject a valid registration/intake. |
| Membership application signup | `MembershipApplicationForm` uses the same helper and retains application entry/thank-you navigation. |
| Message-page signup | `ClientMessages` requests verification and retains its original owned profile/message workflow. These are the four registration entry points found in application components. |
| Existing unverified users | The global reminder links to the verification screen. The API depends on Auth identity, not a client projection or CRM lookup; an existing Auth user can request verification without creating another account or replacing a client file. |
| Accessible verification UI | Black/white/blue responsive screen with semantic heading, labelled reminder, alert/status regions, buttons with busy/cooldown states and explicit portal navigation. Pending verification never gates private portal access. |
| Status refresh | Reloads Auth and forces a fresh ID token on screen arrival, manual refresh and throttled visible-tab focus. Does not maintain an independently trusted Firestore verification flag. |
| Action links | Checks Firebase operation/project configuration, code shape and account match; refreshes stale identity first. Signed-out verification is supported. Rejects foreign keys/tenants, other action modes and duplicate parameters; does not follow supplied redirect URLs. Invalid/used/expired results have recoverable guidance. |
| Resend and abuse protection | An authenticated empty-body server request uses only the current enabled Auth user. Transactional UID and mailbox budgets allow a 60-second cooldown and five attempts in a rolling 24 hours. Concurrent requests, page reloads, changing address and recreating an account do not reset applicable limits. Failed/uncertain sends consume the reservation. |
| Email changes | No self-service email-change flow was found or added. Native SDK email changes reset verified status; old-address codes are rejected even with a stale browser session. Future email-change UI must use recent reauthentication and proof of the new mailbox. |
| Notification eligibility | The worker rereads current enabled Auth ownership and `emailVerified`, uses that Auth address, and checks source/projection ownership and trusted admin receipts. Verification alone does not make unreviewed legacy records eligible. |
| Private history and held mail | No change to Auth UIDs, source IDs, account links, private records or financial history. Verification does not generate legacy portal projections or release/replay older held notifications. Legacy privacy migration remains a separately approved operation. |
| Emulator isolation | All active tests use the fixed `demo-fawcett-dev` emulators. Local verification permits fictional `@example.test` recipients and targets the fixed Auth emulator. Live Firebase settings/credentials are rejected outside genuine Production context. No real projects or accounts are queried. |

The synthetic suites exercise the common registration helper/server path and Auth SDK behaviour. Review of the four component call sites confirms their wiring; the suite is not a browser-click end-to-end run of all four forms. Invalid/reused actions use real emulator codes; expired-code recovery is checked using the SDK error category because emulator testing does not establish real wall-clock expiry or inbox delivery.

## Delivery stays disabled

The notification configuration defaults to `off`. The checked-in local example retains `NOTIFICATIONS_MODE=off`, `NOTIFICATIONS_ENABLED=false` and `SQUARE_PAYMENTS_ENABLED=false`. The actual local `npm run notifications:test-tick` returned `disabled: true`. Provider-mode selection is rejected in development/Preview even if a switch and dummy key are supplied; test transport has no email HTTP side effect.

Firebase verification is separate: synthetic emulator links are available locally, while live verification defaults off unless the owner separately approves `EMAIL_VERIFICATION_ENABLED=true` and an explicit canonical HTTPS `EMAIL_VERIFICATION_ORIGIN` in the genuine retained-production context. Neither verification nor its UI activates Resend, subscriptions or payments.

The application counters protect its endpoint. Firebase's public Auth API can be invoked independently by a modified client; project-level quotas, signup protections and supported Firebase abuse controls must be reviewed before live activation. Server cooldowns are not a claim of global Firebase email-abuse prevention.

## Production prerequisites remain manual

Use [the Phase 5 setup/runbook](portal-email-verification.md) for local rehearsal and the full owner checklist. Before any production send, separately approve the privacy cutover/projection prerequisites, existing retained-project Auth identity, Firebase verification template branding, authorized canonical domain, Firebase-hosted versus custom action handling, quotas/abuse controls, IAM, private limiter protection, HTTPS origin and action-URL log retention. Keep other Auth action templates away from a verify-only custom handler.

No new credentials are needed in Codex. Do not populate development/Preview with real Firebase values. New email-change/recovery features, real template delivery/expiry checks, and activation of transactional notifications each require their own review. No live send, rule deployment, Production-variable change, payment activation or automatic merge is authorized by this report.

## Fresh validation results

- `npm test`: **288 passed, zero failures/skips**: environment/model 16, payments 102, Firestore authorization 79, Auth/admin integration 10, migration/cutover 27, notifications 34 and verification 20. The active synthetic tests cover successful/replayed/invalid actions, verified-status refresh, wrong/signed-out accounts, rolling UID/mailbox limits, negative authorization, preserved history, unverified notification withholding and email changes.
- `npm run lint`: zero errors; the three pre-existing home-page `<img>` warnings remain.
- `VERCEL_ENV=preview npm run build`: optimized production build passed with emulator isolation in place.
- A task-owned optimized server returned HTTP 200 for `/tattoo-portal`, `/consult`, `/tattoo-project-membership`, `/portal/messages` and `/portal/verify-email`. The verification page had the expected copy, no-referrer and no-store headers; the API rejected an unauthenticated request with HTTP 401. The server was then stopped. These are HTTP/render checks, not browser-interaction E2E tests.
- `npm run notifications:test-tick`: `disabled: true`, confirming the actual local default rather than just the example file.
- Expected negative-test permission denials and nonfatal CLI/Node/metadata warnings were distinguished from failures. Deferred cross-project tests remain unrun and are not included in the counts. Real inbox delivery/expiry, deployed Console configuration and production readiness remain outside these synthetic results.

No implementation changes or conflict resolution were required after the review. This follow-up PR is a review record for the already merged Phase 5 feature; production activation remains unapproved and disabled. No deploy or merge was performed.
