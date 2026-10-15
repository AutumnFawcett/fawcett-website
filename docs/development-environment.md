# Development isolation (Phase 0)

## Boundaries

The Firebase project that has received real consultation submissions or portal accounts is production until independently verified. Its display name is not a safety boundary. No live records, exports, credentials, or production configuration belong in Codex or synthetic fixtures.

`lib/firebaseEnvironment.mjs` selects emulator mode by default outside Vercel Production, including local `next build` and `next start`. Only `VERCEL_ENV=production` together with `NODE_ENV=production` can select live mode. Next embeds a platform-derived deployment environment in the browser bundle; a supplied public deployment marker is not trusted. Do not spoof `VERCEL_ENV` locally. This is an accidental-connection guard, not an authorization boundary against someone deliberately changing the code or platform environment.

Emulator mode has a fixed demo project and fixed localhost endpoints. Supplied non-demo browser configuration, live Admin project IDs, service-account values, and remote emulator overrides are rejected. Firebase Admin uses a named demo app and emulator endpoints without service-account credentials. The npm command wrapper removes a platform-supplied `GOOGLE_APPLICATION_CREDENTIALS` binding only from local child processes, without opening the file or changing the parent environment; direct unwrapped execution rejects that binding. Other Firebase credentials are rejected rather than silently removed.

Authentication, Firestore, and Storage SDK calls use the existing application interfaces. Live Production configuration remains supported without changes to Vercel Production settings. Payment business logic is unchanged. Phase 1 proposes private source records and separate portal projections in local firestore.rules; these rules are exercised only in emulators and are not deployed. See client-privacy-migration.md before any production cutover. Passing local tests does not secure or migrate the live database.

## Configuration

- `.env.example`: emulator-only example; copying it is optional. Do not overwrite an existing `.env.local`.
- Local browser settings: the six `NEXT_PUBLIC_FIREBASE_*` app values can remain absent. Fixed synthetic defaults are supplied internally.
- `NEXT_PUBLIC_FIREBASE_MODE`: optional `emulator` locally; `production` is rejected outside Vercel Production.
- `FIREBASE_ADMIN_PROJECT_ID`: optional locally, must be `demo-fawcett-dev` if present.
- Admin emulator endpoints: fixed `127.0.0.1:9099` and `127.0.0.1:8080`.
- No Admin private key, client email, Firebase login, or cloud ADC is needed locally.
- `SQUARE_PAYMENTS_ENABLED=false`; no Square access tokens or notification credentials. The local Next configuration rejects enabled payments.
- Preview deployments must not inherit live Firebase settings. Remove those values from Preview only under separately authorized deployment-setting work. This phase changes no deployment settings.

`firebase.emulators.json` is separate from the existing deployment config. The added Storage rules file is explicitly local and is never deployed. All npm emulator commands specify a demo project. Avoid raw Firebase deploy commands.

## Codex installation and startup

Use the existing checkout at `/workspace/fawcett-website`; tasks are already isolated. Do not create Git worktrees unless explicitly requested. Preserve user changes and do not overwrite existing local environment files.

1. Check Node/npm and Java 21 availability. Run `npm ci --cache /workspace/.npm-cache --no-audit --no-fund`.
2. Dependency installs require `registry.npmjs.org`. Official verified emulator downloads require `storage.googleapis.com`. PR creation requires GitHub API access separately. Do not disable TLS or artifact verification.
3. Run `npm run emulators` in a managed terminal. The wrapper stores CLI state and downloaded emulator artifacts under ignored `.firebase-cache/`.
4. In another terminal run `npm run seed:emulators`, then `npm run dev -- --hostname 0.0.0.0`. Keep both processes alive. They must restart in future tasks; snapshots do not retain processes.
5. Make internal requests to `/`, `/consult`, `/tattoo-portal`, `/tattoo-project-membership`, and `/admin/clients`; require HTTP 200 and expected page content. SDK integration tests separately exercise Auth and Firestore permissions. Do not publish localhost preview links during onboarding.
6. Stop only services started by this task before `npm test`, which manages emulator ports itself. Run lint and build as well. Restart development emulators, reseed synthetic fixtures, and restart the website afterward if needed.

Never supply the original production project's six variables to complete onboarding. Previously saved pending Firebase variable requirements are unnecessary for emulator mode and should be removed in environment settings. Never fill them with live values. Saved cloud scripts must follow this document.

## Synthetic fixtures and test scope

`seed:emulators` creates two synthetic Auth users plus fixed client, consultation, membership application, conversation, and message documents. It verifies emulator-only policy before any SDK operation. It does not create payment records, send email, or invoke Square.

The environment unit suite tests default selection and rejection of live configuration. Integration tests seed twice, sign in, read owned records, reject unauthorized profile writes and anonymous reads, and verify synthetic admin access. Existing payment unit tests use mocks; existing rules tests run locally. No production dataset is needed.

Storage connects to its emulator to prevent a future Storage call from reaching live infrastructure. Its local signed-in access rules are only for synthetic fixtures, not a proposed production policy. JavaScript source files remain JavaScript; `.mjs` is used for modules shared with Node tooling.

Phase 3: [synthetic migration rehearsal](migration-rehearsal.md), [read-only owner inventory](production-inventory-checklist.md), and [cutover/rollback gates](production-cutover-runbook.md). No production execution is included.

Current production direction: [Phase 4A in-place readiness](in-place-production-readiness.md). Retain `fawcett-website-sandbox`, leave `fawcett-website` untouched, and use only `demo-fawcett-dev` emulators for development. No live operation is authorized.

Transactional email remains off during cloud setup. See
[transactional notifications](transactional-notifications.md) for the emulator-only
`npm run test:notifications` and optional `npm run notifications:test-tick` workflow.
Do not add Resend, scheduler or production Firebase credentials to Codex. Local
notification test mode is an in-process synthetic sink and makes no email requests.

Phase 5 adds [portal email verification](portal-email-verification.md). Local
verification uses only the Auth emulator and fictional `@example.test` addresses;
`npm run test:verification` requires no email service credentials. Live verification
has a separate default-off activation switch. Resend and payments remain off.
