# Phase 6A validation and review scope

Feature branch: `codex/write-fence-publication-controls`. Target:
`codex/fawcett-current-work`, verified at `6e979067b01f16cd1f722394675740f1f54039ce`
(the merged PR #40 commit, including the earlier shared work).

No production Firebase access, real client data, production configuration change,
rules deployment, payment/email activation or merge was performed. Only fixed
`demo-fawcett-dev` emulators and fictional `@example.test` accounts were used.
The separate `fawcett-website` project remains untouched.

## Final checks

The final complete `npm test` invocation exited 0, with **323 passed, zero failed,
skipped or cancelled**:

| Active npm suite | Passed |
| --- | ---: |
| test:environment | 16 |
| test:payments | 102 |
| test:firestore | 79 |
| test:integration | 10 |
| test:migration | 28 |
| test:notifications | 34 |
| test:verification | 20 |
| test:safety | 34 |

`npm run lint` exited 0: zero errors, three pre-existing `no-img-element` warnings
in `app/page.js`. `npm run build` exited 0 with the optimized production build and
both new admin API routes and the publication page included. Local production
server smoke check: `/admin/publication` returned HTTP 200 and contained the review
screen and admin review link. That temporary smoke process was stopped afterward;
no remote deployment was invoked. `git diff --check` passed.

Expected negative authorization cases print Firestore PERMISSION_DENIED messages.
Node's existing mixed-module warning, emulator metadata lookup warning and optional
Firebase CLI MOTD/remote-config warning are distinct from test failures. The
archived cross-project suite remains excluded from the active npm command under
the in-place production decision; it was not run. Browser visual/end-to-end tests
against a live hosted project were not performed or claimed.

The 34 new safety cases cover closed/missing/malformed/unsupported/invalid-epoch
controls; native admin SDK/REST requests which succeed when open and fail when
closed; browser-admin inability to reopen; safe owner reads/session continuity;
source-only and forged publication attempts; atomic consult and membership
batches, concurrent retries and receipts; stale epoch rejection; interrupted Auth
signup recovery with the same UID; transactional fencing, batches and nested refs;
CRM and reply shutdown; no verification/notification transport during maintenance;
private/default-withheld records, source-bound review, private edits and durable
withdrawal; redaction/ownership/unsupported-value failures; source/view late-write
reconciliation; signed webhook retry behavior and financial preservation; and all
five admin reply workflows through authenticated helper/server integration.
Existing suites retain consultation, membership, portal reference overload,
conversation selection/message/history, studio deduplication/audit, notification
queue/retry/idempotency/webhook, verification and payment coverage.

## Intentional behavior changes and remaining gates

Ordinary CRM saves preserve the last approved view and require a separate review
before publishing changed content. New generic admin records remain private.
First-reply conversation creation uses only a fixed safe envelope; existing legacy
conversations are never auto-approved. Missing/invalid fence state blocks writes,
so local interactive development needs the existing synthetic seed command after
starting emulators. No live configuration or new secret is needed.

See [the owner runbook](write-fence-publication-controls.md) for the complete
mutation inventory, operator-controlled schema, privileged-writer limitations,
explicit go/no-go gates, rollback and reopening procedures. Remaining production
blockers include completed backup/restore evidence, actual writer/rules/index/view
inventory, privileged shutdown/drain and provider callback capture/replay, a
separately approved production adapter and manifests, and review/withdrawal of
all existing unreviewed views. Existing live data is not made safe by an undeployed
PR; deployed policy and legacy content remain unverified.

## Complete changed-file inventory

- `.env.example`
- `app/admin/layout.js`
- `app/admin/publication/page.js`
- `app/api/admin/clients/route.js`
- `app/api/admin/conversations/route.js`
- `app/api/admin/messages/route.js`
- `app/api/admin/publication/route.js`
- `app/api/auth/verification/route.js`
- `app/api/founder/profile/route.js`
- `app/api/internal/notifications/route.js`
- `app/api/payments/checkout/founder/route.js`
- `app/api/payments/webhooks/square/route.js`
- `app/api/webhooks/resend/route.js`
- `app/layout.js`
- `components/ClientMessages.js`
- `components/ConsultRequestForm.js`
- `components/MaintenanceBanner.js`
- `components/MembershipApplicationForm.js`
- `components/PublicationReview.js`
- `components/TattooPortalLogin.js`
- `docs/development-environment.md`
- `docs/in-place-adapter-design.md`
- `docs/in-place-production-readiness.md`
- `docs/phase6a-validation.md`
- `docs/production-cutover-runbook.md`
- `docs/production-inventory-checklist.md`
- `docs/write-fence-publication-controls.md`
- `firestore.rules`
- `lib/adminFirestore.js`
- `lib/clients/clientHandler.mjs`
- `lib/clients/clientService.mjs`
- `lib/migration/engine.mjs`
- `lib/migration/fixtures.mjs`
- `lib/notifications/adminConversations.mjs`
- `lib/notifications/adminMessages.mjs`
- `lib/notifications/queue.mjs`
- `lib/notifications/webhook.mjs`
- `lib/notifications/worker.mjs`
- `lib/portalFirestore.js`
- `lib/portalProjection.mjs`
- `lib/safety/browserFence.js`
- `lib/safety/publication.mjs`
- `lib/safety/publicationState.mjs`
- `lib/safety/reconciliation.mjs`
- `lib/safety/serverFence.mjs`
- `lib/safety/writeFence.mjs`
- `lib/server/firebaseAdmin.js`
- `lib/verification/server.mjs`
- `package.json`
- `scripts/reconcile-publication.mjs`
- `scripts/seed-emulators.mjs`
- `tests/environment/adminClients.integration.mjs`
- `tests/firestore/clientPrivacy.rules.test.js`
- `tests/firestore/membershipApplications.rules.test.js`
- `tests/firestore/membershipChangeRequests.rules.test.js`
- `tests/firestore/membershipOfferResponses.rules.test.js`
- `tests/migration/inPlaceCutover.test.mjs`
- `tests/migration/rehearsal.test.mjs`
- `tests/notifications/workflows.test.mjs`
- `tests/safety/writeFence.test.mjs`
- `tests/verification/verification.test.mjs`
