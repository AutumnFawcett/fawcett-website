# Isolated migration operator — Phase 6B

This directory is a standalone JavaScript operator adapter, not website/server API
code. Its only executable backend is the fixed `demo-fawcett-dev` Auth/Firestore
emulators on loopback and database `(default)`. The production factory throws
before SDK initialization. There is no live switch, credential selector, deploy
command, migration route, scheduler or automatic approval operation.

The intended future production project is `fawcett-website-sandbox` and is metadata
only here. `fawcett-website` is not a destination. Do not add production values or
credentials to this environment, the rehearsal runtime, test artifacts or Git.

Read [the operator operating procedure](../docs/migration-operator-procedure.md)
for the executable synthetic walkthrough, schemas, abort/withdrawal behavior,
remaining risks and separate production activation requirements.

- `runtime.mjs`: trusted emulator factory and narrow read/write capabilities;
  no original, Auth, role, grant, deployment or payment mutation capability.
- `model.mjs`: versioned immutable manifest, typed inventory and explicit field
  selection. Reuses the reviewed projection/type/privacy primitives without
  weakening Phase 3's synthetic guard or Phase 6A's application fence.
- `authorization.mjs`: fresh authenticated operator, separate owner grant,
  independent active identities, bounded authorization and transactional fence.
- `operations.mjs`: inventory, withheld-by-default preparation, per-record
  approval preparation, disabled authorization preparation, apply, reconcile,
  and journal-owned withdrawal. No generic original repair or force overwrite.
- `cli.mjs`: operation-specific flags and private bounded input/output artifacts.

Tests: `npm run test:operator`. It is also part of `npm test`. These tests clear
fictional emulator records; do not run suites concurrently with interactive work.
The development fixture bootstrap lives outside this adapter and issues no grant.

Phase 9A: [namespace, aggregate report, query/index and cutover contract](../docs/launch-inventory-and-cutover-contract.md). Inventory schema 2 / adapter phase9a-v1 require fresh reviewed artifacts; no production activation. New read-only CLI operations: inventory-summary and reconcile-summary.
