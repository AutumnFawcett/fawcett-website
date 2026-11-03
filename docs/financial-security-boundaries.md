# Stage 2D-3 — inactive financial trust boundaries

Stack: PR #66 (`46bdbdb`) → this draft; target `feature/stage2d-funding-family`. Existing PRs #59–66 stay unchanged/unmerged. No route, real user/role/record, payment, credit issuance, rules, IAM, environment or Production change. This is an emulator-backed security foundation, not a deployed authorization certification.

## Enabled runtime and fail-closed deployment boundary

Only `createLocalFinancialDependencies()` can mint an enabled runtime. Its fixed profile is project `demo-fawcett-ledger`, database `(default)`, financial environment `sandbox`, Firestore `127.0.0.1:8087`, and Auth `127.0.0.1:9097`. It validates both project environment selectors and emulator hosts, rejects Vercel/Production process markers, constructs its own SDK instances and freezes Firestore endpoint settings using the supported one-time `settings({})` call.

The service requires the opaque minted runtime, actual Auth instance and original owned Firestore references. It checks Auth `app.options.projectId`, Firestore `projectId`/`databaseId`, expected project and command environment. Missing/ambiguous/injected SDKs fail before commands. Transaction instrumentation can wrap methods only while retaining references to the original owned SDK. Resource probes construct DocumentReferences; they do not read/write a probe record. No private SDK fields or credential contents are inspected.

**No deployed financial writer profile is enabled.** Preview and Production financial services fail closed even if somebody sets emulator environment strings. Deployments can still build/render the unchanged application because these libraries remain disconnected from routes. This deliberate checkpoint avoids claiming that configuration metadata proves deployed workload identity, IAM, credential audience or safe signing-key custody. A future reviewed Preview-only bootstrap must bind deployment identity to a distinct approved Sandbox project/database, secure verifier-only public keys and scoped writer identities; it must never fall back to a default app, ADC-inferred project, Production resources or an emulator token verifier.

## Authenticated entry and exact authorization

Future server routes may import only `lib/financial-commands/index.mjs`; client modules may import no financial service. An ESLint-AST architecture contract scans application/component/library/script imports, requires/re-exports and dynamic imports. It rejects raw adapter/security-module imports, nonliteral module loading, test-authority imports and indirect barrel bypasses outside the explicit infrastructure allowlist. The existing synthetic reconciliation script has one exact fixture-data exception. CI runs the contract; no branch-protection settings are changed.

`createFinancialAuthorization()` calls actual Firebase `verifyIdToken(token, true)` before transactions, checking issuer/audience/auth_time/iat/exp and rejecting tenant tokens. Actor UID/time come from verified identity/server clock, never command JSON. Each transaction/retry reads a current owned principal, action, active status, epoch and scope. Grants are explicit client/project pairs; legacy flat lists are additional restrictive intersections, not a cross product. Project associations themselves require owned booking-authority records.

A 15-second authorization lease is checked before writes. Once a command observes a principal revision/epoch, a different revision on retry requires a fresh command even if its requested action remains granted. Duplicate commands still check current authority. Owner approvals bind current revision and revocation epoch in addition to the existing exact operation/client/project/policy/restriction/account binding; approval use remains atomic and single-use.

`coordinateFamily()` now supplies the funding-family adapter with actual verified identity, current transactional client/project role checks and signed audit records. Reservation/freezing can be explicitly granted; releasing protections requires owner role. Transferred-value spending, cross-lot refund execution and all live routes remain disabled. Low-level callbacks remain trusted implementation dependencies, not independent authentication proof.

## Role provisioning and revocation

Principal schema v2 adds exact grants and a monotonic `revocationEpoch`. Old unowned/v1 principals fail closed; no real roles are migrated. `createFinancialRoleManager().decide()` requires an existing owned owner with `manage_roles` permission and complete scope over both previous and proposed grants.

It assigns only admin/client roles and only their closed action allowlists. Client grants must refer to that client's own UID. It cannot promote anybody to owner, modify an existing owner via assignment, self-elevate, delegate owner actions to admins, or expand beyond the owner's exact scopes. An authorization-only preflight precedes target lookup, so unauthorized callers cannot probe Auth account existence. Authority is checked again in the write transaction. Auth target existence/status checks occur outside retry callbacks; the manager does not create or update Auth users. Owner genesis/restoration remains an offline, separately approved provisioning ceremony, not an email convention or client callable endpoint. Only disposable emulator fixtures have a seed authority in this increment.

Each role decision atomically increments revision/epoch, writes an immutable signed before/after authorization decision, seals the current principal projection, and stores a signed exact-intent replay record. Revocation disables financial authority and advances `validAfterSeconds` to at least the next whole second, preventing same-second old-session reuse. Scope changes invalidate old approvals by revision; restored access retains the revocation fence. Operation IDs must be globally unique per environment; conflicting reuse is denied. Concurrent financial operations conflict with principal updates and retry against the new authority.

### Concrete cross-service revocation procedure

Firebase Auth and Firestore cannot share a transaction:

1. Commit and acknowledge the Firestore financial revocation/epoch first. This is the financial lock and conflicts with in-flight transactions that read the principal.
2. Through a separately approved Auth administration process, revoke refresh tokens/disable the Auth user outside transaction callbacks.
3. If Auth cleanup fails, keep the Firestore principal disabled. Never restore privileges as compensation for an Auth failure.
4. Restore only through a reviewed role decision and fresh authentication after the retained epoch fence; do not reset epochs, revision history or old approvals.

An Auth-only change made outside that procedure still has an in-flight window after token verification, bounded by the 15-second lease and commit timing. This code does not promise instant atomic cross-service revocation or verify real provisioning/IAM. No actual Auth cleanup is performed here.

## Record ownership and protected verifier contract

A matching hash, ID or `verified` flag is insufficient. Protected reads require an ownership receipt with an Ed25519 signature over record kind, exact path/content hash, issuer key ID, project, database and environment. Trusted issuer keys come from the server runtime, never a record or request. Receipts use create-only, key-versioned document IDs; tampered bytes, paths, fake signatures and wrong writer kinds fail closed.

| Record | Permitted producer |
| --- | --- |
| Principals and role-decision/replay audits | Privileged role manager; local fixture authority for synthetic genesis only |
| Provider payments, readbacks, order bindings and refund evidence | Reserved provider-verifier writer; synthetic fixture authority only in this increment |
| Policy definitions | Reserved versioned policy publisher; synthetic fixture authority only |
| Booking/project/appointment/request authority | Reserved booking authority; synthetic fixtures only |
| Completion records and current completion heads | Reserved authenticated completion-authorizer; synthetic fixtures only |
| Consent receipts/replay records, owner approvals and command audits | Protected command service |
| Immutable financial journals and financial/family replay records | Isolated ledger writer after all transaction guards |

Command writers cannot sign provider evidence or role-management audits. Role writers cannot claim command-audit ownership. Provider/payment semantics and existing CARD/readback/order/value checks still apply even to an owned record. Completion identity/price/revision controls remain unchanged. Original funding journals, financial/family replay metadata and journal replays/reversals now verify ownership as well. A valid journal signature cannot authenticate a tampered operation acknowledgment.

**Keys are ephemeral emulator-only test authority, generated in memory and never logged/exported as private material.** No secret is deployed. They deliberately do not support persistent or multi-instance deployments: a new process must explicitly seed disposable fixtures under its own issuer. Real verification consumers must have only approved public verifier keys; private provider keys must belong to a separately protected verifier writer (for example a reviewed KMS-backed service), not a generic command instance. Durable registry, key rotation/retention and workload identity remain unimplemented deployment gates. Local ownership receipts are not a substitute for IAM or tamper-resistant audit retention.

A later provider verifier must obtain server-side readback outside transactions, reject EXTERNAL/contradictory source details, validate original payment/order/location/merchant/CAD/amount/completion/capture, bind original trusted request/client/project, enforce freshness and replay uniqueness, and atomically publish signed exact evidence/order bindings. It must never sign a browser-supplied provider-confirmed flag. No Square ingestion is implemented now.

Mutable account/lot/family projections still rely on transactional consistency, immutable journals and privileged-writer ownership. This increment does not claim to stop arbitrary malicious Admin SDK code or certify deployed rules. Existing funding-family reconstruction remains necessary; signing a journal does not make an inconsistent projection correct.

## Verification and deployment limitations

```sh
npm run test:contracts
npm run test:ledger
npm run test:legacy-import
npm run test:ledger:emulator
npm run test:commands:emulator
npm test
npx eslint lib/financial-security/*.mjs lib/financial-commands/*.mjs lib/ledger/server/*.mjs tests/financial-commands/*.mjs tests/ledger-firestore/*.mjs tests/agreements/financialArchitecture.test.mjs
npm run lint
npm run build
```

The existing Java 21 CI job runs both loopback emulator suites. Test socket guards cover both financial-command and raw persistence fixtures. Synthetic setup explicitly signs its server-owned fixtures; deliberate unsigned mutations fail ownership or earlier semantic checks. No real Firebase account, project, rules, IAM or financial data is inspected. Local Java 17 remains an emulator-start blocker; use the established CI rather than changing owner tooling.

Full tests/lint retain the unrelated Jane/Janet expectation and JSX apostrophe error (plus img warnings). No maintenance fixes are mixed into this PR.

Next small stage: read-only deployment identity and protected verifier-writer design/attestation for a separate Sandbox Preview profile, then a narrowly approved implementation. Keep all financial routes inactive until durable key custody, owner provisioning/revocation operations, evidence writers, policy review and real-environment authorization QA are approved.

Primary references: [Firebase ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [session revocation](https://firebase.google.com/docs/auth/admin/manage-sessions), [Admin Auth app binding](https://firebase.google.com/docs/reference/admin/node/firebase-admin.auth.auth), [Firestore public SDK settings/identity contracts](https://github.com/googleapis/nodejs-firestore/blob/main/types/firestore.d.ts). SDK configuration identifies configured resources; it does not establish deployed IAM permissions.
