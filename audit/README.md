# Two-project read-only reconciliation

Standalone owner executable, independent of the migration operator and website.
No connection is made on import. Development/tests use fictional data only.

Start with the [short owner checklist](../docs/two-project-audit-owner-checklist.md).
The [technical contract](../docs/two-project-read-only-audit.md) covers IAM,
minimization, report semantics, limits and protected follow-up. No production run,
credential transfer or migration approval follows from merging this code.

- `contracts.mjs`: fixed verified project pair, namespaces and minimal field mask.
- `rest-reader.mjs`: scoped read methods; identity and permission verification.
- `cloud-shell.mjs`: existing user credential selection and restricted REST transport.
- `engine.mjs`: complete observation comparison and aggregate-only reconciliation.
- `cli.mjs`: owner-only invocation, private aggregate output and sanitized failures.

`npm run test:audit` starts the existing local Auth/Firestore emulators and tests
isolated `demo-fawcett-audit-one` / `demo-fawcett-audit-two` data. Mocked Cloud Shell
transport tests never contact real projects. This test command is part of `npm test`.
Production migration guards and application configuration are unchanged.
