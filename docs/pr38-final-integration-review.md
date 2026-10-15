# PR #38 final integration review

Historical review of commit `6dc6cdc`, before Phase 5. The [Phase 5 verification feature](portal-email-verification.md) supersedes the missing-verification implementation findings below; its production activation and operator prerequisites remain separate.

The existing `codex/transactional-email-notifications` branch now includes shared development commit `1b1398551971cf16c294eab9239caf58195dd057` (merged PR #37). No separate PR, automatic PR merge or production operation is involved. Production remains `fawcett-website-sandbox`; leave `fawcett-website` untouched. Development/testing uses only fictional `demo-fawcett-dev` emulators.

## Integration and compatibility fix

The merge conflicts were `package.json` and `docs/development-environment.md`. Both notification commands and Phase 4A guidance are retained. Rule/migration suites stay serialized on the one approved emulator project. All seven Phase 4A cutover/session tests remain active. Deferred cross-project tests remain archived and unrun.

The review found a real message relationship defect: reusing an existing application conversation could discard a selected `membershipOfferResponseId`, because the endpoint copied relationships only from that conversation. The shared admin helper now forwards only allowlisted selected relationship IDs and source references. The authenticated endpoint validates every linked original's owner, rejects conflicts with existing conversation relationships, checks response/application consistency, and preserves reviewed selected links in both original and projection. It derives sender/client identity on the server. Notification receipts hash the complete immutable message identity, including the relationships; retries cannot silently substitute a different selection. Earlier PR #38 synthetic receipts use the older digest and are conservatively held by the new validator; regenerate only fictional emulator fixtures if needed. This is not a production receipt migration or a request to replay old email.

Regression tests call the real shared browser helper and server handler with synthetic Auth tokens for `AdminInbox`, `AdminIntakeDashboard` (all four intake aliases), `AdminMembershipRequests`, `AdminMembershipOffers`, and `AdminMembershipOfferResponses`. They cover existing conversations, additional selected links, exact source aliases, source/projection ID preservation and resulting test-only notifications. Negative cases reject cross-owner records, conflicting conversation links and responses from another application. Existing relationship IDs, Auth UIDs, messages, payments and projects are not migrated or rewritten.

## Vercel Preview evidence

Read-only GitHub deployment/status records were reviewed on 2026-10-15. These describe existing Vercel builds; no redeploy was requested and no deployed application/data endpoint was accessed.

| UTC creation time | Commit / context | Result | Deployment evidence |
| --- | --- | --- | --- |
| 13:00:59 | `1b13985519`, shared branch after #37 merge | Failed | [GitHub record](https://api.github.com/repos/AutumnFawcett/fawcett-website/deployments/7093257392/statuses), Vercel `dpl_EqsftJomapeQ8xxw1RQpfEuGKmtz` |
| 12:52:20 | `78e88fccd6`, original #38 feature head | Succeeded | [GitHub record](https://api.github.com/repos/AutumnFawcett/fawcett-website/deployments/7093062964/statuses) |
| 12:35:33 | `fcef4fcaf3`, #37 feature head | Succeeded | [GitHub record](https://api.github.com/repos/AutumnFawcett/fawcett-website/deployments/7092691658/statuses) |
| 12:13:00 | `b9c132b0fa`, shared branch after #36 | Failed (multiple attempts) | [GitHub record](https://api.github.com/repos/AutumnFawcett/fawcett-website/deployments/7092198700/statuses) |
| 11:50:19 | `ba9714faa9`, #36 feature head | Succeeded | [GitHub record](https://api.github.com/repos/AutumnFawcett/fawcett-website/deployments/7091733272/statuses) |
| 11:19:24 | `cbd3ae0549`, shared branch after #35 | Failed (multiple attempts) | [GitHub record](https://api.github.com/repos/AutumnFawcett/fawcett-website/deployments/7091108521/statuses) |

The source trees for successful #37 head `fcef4fc` and failed shared merge `1b13985` are **identical** (`git diff fcef4fc 1b13985 --stat` is empty). The failed shared build does not contain #38 notification code. Thus the latest observed failure is associated with the #37 shared-branch deployment, not the original #38 feature deployment; earlier failures predate both. Identical trees and differing results warrant checking branch-scoped settings, install/build commands, caches and infrastructure, but **do not prove an environment-variable root cause**.

Private Vercel build logs and current Preview settings were not available: no Vercel connector, CLI, credential binding or exported Vercel credential was present. GitHub's status supplies a failed result and log command, not the error log. No credentials were requested or read. The owner can inspect the failed deployment in Vercel or run the read-only command `vercel inspect dpl_EqsftJomapeQ8xxw1RQpfEuGKmtz --logs` in their already authenticated operator environment. Compare only sanitized error lines/settings names with the successful feature build. Root cause remains **unconfirmed pending those logs**; a successful local build is not a substitute for hosted evidence.

### Safe Preview configuration checks

The integrated optimized production build is tested with `VERCEL_ENV=preview`. An isolated subprocess test also loads Next configuration with **all six public Firebase settings absent** and proves that Preview configuration succeeds. Those missing values are not required for emulator builds and should not be filled with real production values.

Before changing any Preview settings, use the failed log's actual error. Under separately approved Preview-only configuration work:

- Keep Firebase mode absent/default or `emulator`. Do not force live mode, spoof `VERCEL_ENV=production`, or supply a public production marker.
- Remove inherited real `NEXT_PUBLIC_FIREBASE_*` values from Preview, rather than relaxing the guard. Supplied non-demo values intentionally fail before a build.
- Keep Admin service-account credentials/cloud ADC absent. An optional Admin project must be `demo-fawcett-dev`; endpoint overrides must remain the fixed loopback hosts.
- Keep notifications off/default, `NOTIFICATIONS_ENABLED=false`, payments disabled, and provider/scheduler credentials absent.
- Review branch-specific Vercel overrides, Node/npm versions, root directory, build command and dependency installation. A rejected live config, enabled payments or credentials is an intentional isolation error; a dependency/install/framework error is a different diagnosis.

Ordinary hosted Preview does not run the loopback Firebase emulators. Static routes can build/render, but Auth/Firestore/admin API workflows need the local synthetic environment; a failed runtime connection to a loopback emulator is not evidence that Preview needs production Firebase. No Vercel environment variables/settings were changed here, and no connection to either real project was made.

## Email verification audit and activation blocker

Four signup entry points create password accounts: `components/TattooPortalLogin.js`, `components/ConsultRequestForm.js`, `components/MembershipApplicationForm.js` and `components/ClientMessages.js`. They sign in/create a user, optionally update display name and create the portal/profile/intake records. None calls `sendEmailVerification`, handles `applyActionCode`/`checkActionCode`, reloads verified account state, or offers resend/verification status. Login currently permits an unverified account to use its owned portal. A matching CRM email, manual studio file, successful password login or display-name update does not verify mailbox ownership.

The notification worker reads the current **server-side Auth user**, not a browser flag, form email or stale token claim. It requires an enabled owner with `emailVerified === true` for client notices and uses that Auth email. It holds unverified notices with `verified_email_required`. Studio intake alerts and portal recording can still succeed. Synthetic tests prove that a new password signup is unverified, a held notice stays held after verification, and a later new submission can receive a test notice once Auth ownership is verified. No verification or transactional email is actually sent.

Before enabling client email, separately implement/review:

1. A shared verification service/UI used by all four signup paths and existing unverified accounts. Offer an explicit verify/resend action, clear pending state, bounded resend cooldown and sanitized errors; notification failure must not block valid intake recording or private portal messaging.
2. Firebase Auth verification-email templates and authorized domains configured by the owner outside Codex. Use approved HTTPS action/continue URLs with strict destination allowlists; handle valid, expired, reused and wrong-user codes. Never log action codes or put client/health/intake data into URLs. Firebase verification email is itself an external email feature and requires separate activation approval.
3. Refresh the signed-in user (`reload`) and token after code application or returning from the verification link. Confirm with server Auth state before enabling notifications. Keep Auth UIDs and existing source/portal relationships stable; do not infer identity from matching CRM email or set `emailVerified` on behalf of real clients merely to bypass the guard.
4. A controlled policy for email changes (verified ownership of the new address and any needed reauthentication), disabled/deleted users and accounts with no email. Do not send to an old/form address. Keep changed in-flight recipient identities held for reconciliation.
5. An explicit policy/UI for held notices. Verification must not automatically replay historical consultations or private messages. Only future eligible records notify automatically; any reviewed replacement notice needs ownership/age review and provider duplicate reconciliation.
6. Emulator tests for each signup path, valid/expired/replayed codes, resend limits, refresh across existing sessions, address changes, disabled users and attempted forged verification. Any later provider acceptance test must use approved test sinks only. Do not globally deny existing unverified users their portal histories or break consultation recording to force verification.

These changes are documented prerequisites, not activated in this PR. New studio-managed files remain private and create no Auth account; existing Phase 2 regression tests continue to enforce that boundary.

## Notification isolation and review gates

Default configuration is `off`; even an enabled switch and dummy key cannot choose provider transport in Preview. Emulator `test` transport returns an in-process receipt without calling email HTTP. Test addresses must be fictional `@example.test`; separately approved provider staging rewrites all recipients to the provider's fixed test sink. Only a genuine Production context, the retained backend, explicit sender/recipients/origin, mode and activation switch can select provider delivery. Tests exercise the production adapter only through injected fake HTTP. Queue/browser denials, verified ownership checks, signed webhook validation and bounded idempotent retries remain active after integration.

Do not enable client notifications before the verification workflow, reviewed legacy projections/privacy cutover, sender/domain/provider setup, scheduler/capacity/monitoring and explicit owner activation approval are complete. Do not weaken Firestore rules or Preview guards to bypass these gates. No real project/data access, real emails, rules deployment, payment activation or automatic PR merge has occurred.

## Integrated validation results

- `npm test`: **268 passed; zero failures, cancellations or skips**. Breakdown: environment/model 16, payments 102, Firestore authorization 79, Auth/admin integration 10, migration/cutover 27, notifications 34. All seven merged Phase 4A session/rules-cutover tests ran. Deferred cross-project tests remain intentionally unrun and are not counted.
- `VERCEL_ENV=preview npm run build`: passed as an optimized production build with all server endpoints compiled. This validates code in Preview context, not hosted emulator availability or actual Vercel build settings.
- `npm run lint`: zero errors, three pre-existing home-page `<img>` warnings.
- `npm run notifications:test-tick`: returned `disabled: true` under default configuration.
- Negative authorization tests deliberately produce permission-denied SDK logs. CLI remote-config/MOTD, Node module-type and metadata lookup warnings were nonfatal. Provider HTTP was injected/mock-only; local test delivery has no email network transport.

Initial regression runs helped refine the fixtures: the new combined workflow fixture produces more than one 20-job batch, so its final assertion now processes two normal ticks and proves eventual delivery for every case. No assertions were removed and no failed case was skipped. Final full-suite results above include the selected-link fix and that normal queue-draining behavior.

Remaining external blocker: owner inspection of private Vercel logs is still required to establish the exact historical failure cause. No real credentials or setting changes are needed for these local results, and none should be supplied to Codex for this review.
