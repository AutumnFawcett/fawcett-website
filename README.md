This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Safe local development

Treat the existing Firebase project as production because it may contain real client records, regardless of its display name. Do not put its configuration, service-account keys, or data into Codex.

Use Node.js 24, npm, and Java 21 for the Firebase emulators. This project uses JavaScript and the Next.js App Router.

```bash
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
# Optional: copy only if .env.local does not already exist. Do not overwrite user files.
cp -n .env.example .env.local
npm run emulators
```

In another terminal, seed fixed synthetic records and start the website:

```bash
npm run seed:emulators
npm run dev
```

Auth, Firestore, and Storage connect only to loopback ports 9099, 8080, and 9199 for the nonexistent Firebase project `demo-fawcett-dev`. The emulator CLI is explicitly pinned to that demo project and `firebase.emulators.json`. No Firebase login or cloud credentials are required. Emulator data is disposable; rerun the seed after restarting. Never import a production export.

Synthetic login fixtures are `admin@example.test` and `client@example.test`, both with the intentionally public emulator-only password `Synthetic-only-123!`. These are not real accounts. Seeding is repeatable and touches only fixed synthetic emulator IDs. No payment records, checkout sessions, subscriptions, or notifications are activated.

The six browser Firebase app settings can remain unset locally. Missing emulators cause connection failures, never a fallback to live Firebase. Local builds also use emulators even though Next sets `NODE_ENV=production`. Development and Preview reject live Firebase configuration and service-account credentials. Only an actual Vercel Production build may use the existing live configuration. See [environment safety](docs/development-environment.md) for details and cloud startup instructions.

```bash
npm run lint
npm run build
npm test
# Or run individual suites:
npm run test:environment
npm run test:payments
npm run test:firestore
npm run test:integration
```

`npm test` manages temporary emulators itself. Stop the development emulator process first to avoid occupied ports. A local build can complete without running emulators; functional Auth/Firestore checks require them. The proposed Phase 1 Firestore rules are exercised only in emulators. See [client privacy and migration](docs/client-privacy-migration.md) for the new read boundary and the separately approved production cutover required. Existing real records remain subject to the live deployed policy.

For a build smoke test, use `npm run start` after `npm run build`. Emulator browser endpoints assume the browser is on the same machine. A remote Codex browser would need approved forwarding of the emulator ports; do not point it at production to work around this.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

Studio client management and production prerequisites: [Phase 2 guide](docs/admin-client-management.md).

Phase 3: [synthetic migration rehearsal](docs/migration-rehearsal.md), [read-only owner inventory](docs/production-inventory-checklist.md), and [cutover/rollback gates](docs/production-cutover-runbook.md). No production execution is included.
