# Phase 9B — owner-operated two-project read-only audit

For the short execution procedure, use the [owner checklist](two-project-audit-owner-checklist.md).

**Review only. Do not execute against real projects until code review and separate
owner authorization of the read-only run and identity/IAM evidence.** Development
uses fictional data and fixed local emulators only. This tool is not an operator,
migration, exporter, deployment, payment verifier or approval workflow.

## Corrected project facts and scope

The owner verified the deployed `main` / `ba67999` browser's actual Firestore
request destination as `fawcett-website`, not the formerly presumed retained
sandbox. Both projects contain potentially real production data. Neither is an
approved destination; historical one-project and cross-project directions must
not be executed based on their old labels.

| Project | Project number | Database / location | Owner-provided observations, not audit results |
| --- | --- | --- | --- |
| fawcett-website | 723963949221 | (default) / nam5 | 15 Auth users; 12 top-level collections / 105 top-level documents; real consultations, conversations and appointments; PITR enabled and completed backup READY |
| fawcett-website-sandbox | 625305990122 | (default) / nam5 | 5 Auth users; 10 top-level collections / 30 top-level documents; Square/Founder records; completed backup and isolated restore operation, integrity review outstanding |

These counts are observation baselines and may legitimately change. Nested/missing-
parent counts are different from top-level counts. The audit does not treat these
numbers as proof that a dataset is complete, empty, synthetic or production-safe.
It selects no destination and never rebinds the website or another application.

## Implementation and permission boundary

`audit/cli.mjs` is standalone Node JavaScript, using built-ins and fixed REST
capabilities only. It does not load `.env`, Firebase Admin, the application runtime,
Square, migration code or the production operator. No npm install is required for
the owner executable. `npm run test:audit` is development-only and starts synthetic
emulators; it is NOT the owner command.

The executable accepts no project, database, host, token, credential file, write,
export, repair, migration or detailed-output option. The two fixed project IDs,
numbers, default databases, native Firestore type and locations are verified before
ANY document/Auth enumeration in either project. Resource Manager/database metadata
reads are the prerequisites, not client-data reads. Both identities and permission
checks are rechecked after scanning. Mismatches stop rather than selecting another
project or assuming the environment-variable value is authoritative.

Cloud Shell execution requires its genuine `CLOUD_SHELL=true` marker, the explicit
`--iam-reviewed-read-only` acknowledgement and existing active human gcloud user
credentials. Service accounts, impersonation, credential/token file overrides,
emulator endpoints, hosted Vercel context and debug hooks are rejected. The tool
captures active-account/token command output in memory and never prints it. It does
not log in, change gcloud's selected project, grant roles or enable APIs.

Before running, an independent IAM reviewer must verify effective access on BOTH
projects, including organization/folder/group/custom/conditional grants. The active
human account must have read-only access with no Firestore/Auth mutations, import/
export, deployment, IAM grant or other write capabilities. Existing project Owner,
Editor, Firebase Admin, Datastore User and similar write-capable accounts are not
acceptable. Use an existing authorized read-only human identity; if none is usable,
stop and obtain separate IAM preparation approval. Do not weaken the tool or add
service-account keys to work around this gate.

The runtime probes required permissions (`resourcemanager.projects.get`,
`datastore.databases.getMetadata`, `datastore.entities.get/list`,
`firebaseauth.users.get`) and rejects the enumerated dangerous permissions. Its
fixed `testIamPermissions` POST is read-only, as is Firestore's `listCollectionIds`
POST. All other transport operations are fixed GETs. No Firestore commits, writes,
transactions, Auth account mutations, email sends or generic request method exist.

**Permission probes are defense in depth, not proof of every effective IAM grant.**
They cannot exhaust future permissions, resource-conditioned grants or credentials
on a compromised host. Independent IAM review remains mandatory. Disabled APIs,
403s, unexpected permission responses and expired credentials stop the run; no API
is enabled and no alternative credential is tried automatically.

## Owner Cloud Shell walkthrough — after review

1. Owner and independent reviewer approve the exact commit, two identity triples,
   read-only principal, output location, scope and privacy handling. Confirm that
   no destination/migration approval is being granted. Verify Auth and Admin SDK
   bindings separately from the already confirmed browser Firestore destination.
2. Use an authorized, trusted Google Cloud Shell session. Check out the reviewed
   repository commit. Node 22 or newer is required; the development validation uses
   Node 24. Do not place production credentials, exports or client records in the
   repository, Codex or a Preview environment. Do not manually forge the Cloud Shell
   marker or unset guard variables simply to bypass a refusal.
3. Verify the existing active human account has reviewed read-only access to both
   projects and the existing APIs are available. Do not create keys, impersonate,
   enable services or edit IAM/settings as part of this run. Close debugging/tracing
   tools; do not use shell tracing, HTTP capture, Node inspectors or heap dumps.
4. Create a private temporary output directory and a NEW report file:

   ```sh
   umask 077
   audit_directory="$(mktemp -d)"
   node audit/cli.mjs --iam-reviewed-read-only --output "$audit_directory/aggregate.json"
   ```

   No npm installation, Firebase CLI login, `gcloud config set project`, service
   enablement or deployment command is needed. Keep the directory private. The
   file is created exclusively with mode 0600; existing files are not overwritten.
   Console output is a fixed completion/failure sentence, never a data dump.
5. Review the aggregate report privately. A failed run exits nonzero and writes
   only `scanComplete:false`, `upgradeApproved:false`, `AUDIT_INCOMPLETE`; it does
   not preserve partial counts as a complete inventory. No exception text, stack,
   HTTP error body or sensitive failing path is written. Do not retry by changing
   projects, privileges, masks or bypassing an unknown namespace.
6. On success, compare the two separate provenance-bound summaries with the owner
   baselines, explaining legitimate deltas. Counts can overlap: issue counters count
   findings; classifications count existing documents; collection totals include
   nested collections; missing parents are not existing documents. A complete scan
   NEVER sets `upgradeApproved:true` or merges a potential collision.
7. Retain the aggregate file, reviewed commit, operator/reviewer names and execution
   window in the owner's restricted evidence location, under an approved retention
   policy. Do not commit/paste reports, screenshots, tokens or client data into
   GitHub/Codex. Delete temporary artifacts under that policy. Google-managed access
   audit logs follow existing project policies; this tool does not disable them or
   claim that resource identifiers are absent from provider-controlled access logs.

## Data minimization, completeness and interpretation

Auth enumeration covers the default project user store, not Identity Platform
tenant stores or MFA recovery material. The owner must confirm this scope against
the Console baseline before authorizing the run; if tenant-scoped accounts exist
or scope is unknown, stop for a separately reviewed tenant-aware extension.

The field mask excludes names, message bodies, consultation content, health details,
private notes and Storage URLs. Only relationship and provider-reference/amount fields needed for checks are read into transient memory. Auth enumeration
requests UID, email, disabled state, creation time and provider subjects; never
password hashes/salts. No selected values, document IDs/paths, emails, hashes,
provider IDs, monetary values or client contents are exported. Report project
identities are the fixed, non-secret approved project identifiers, not client IDs.

Collection counters use only canonical schema labels from `audit/contracts.mjs`,
such as `studioClients.audit` and `portalRecords.clients`; they never echo an actual
nested document path or unknown collection name. Unrecognized namespaces fail the
entire scan. Known nested audits/receipts/history are private-only. Expected missing
namespace containers are distinguished from missing source/audit parents. All CRM
originals and existing projections require review; absence of detected relationship
errors is not evidence that free text is safe. The audit intentionally does not
fetch or classify health/message content.

Explicit links are checked within their source project. Missing/ambiguous owner
fields, missing or duplicate profile associations, disabled/missing Auth users,
missing targets, conflicting owner UIDs and orphan/misassigned projections are
counted, never repaired. Manually managed studio clients do not need Auth accounts.
Legacy schemas can produce conservative review findings. Matching email, UID,
provider subject or document location across projects is only a potential collision,
not permission to merge accounts/records or change ownership.

Payment checks count missing relationships, provider/environment label conflicts,
invalid integer-cent values, duplicate transaction references and refund/dispute
parent inconsistencies. Labels come from records, NEVER Firebase project names.
Even a record marked Square/production/completed is not proof of payment: this
read-only audit does not call Square, verify historical signatures or establish
settlement, refunds received, fees, usable credit or entitlements. Dashboard invoices
may be outside the website ledger; no automatic reconciliation or credit is posted.

Pagination follows every continuation token and rejects repeated tokens, duplicate
records/IDs, empty continuation pages, malformed responses, errors and scope changes.
Missing document parents are discovered using `showMissing=true`, then their nested
collections are traversed. Limits are 100 entries per Firestore page, 1,000 Auth users
per page, 1,000 pages per enumeration, 10,000 records/collections/users per project,
six nested collection levels and 4 MiB per HTTP response. Overflow stops, never
truncates or marks a partial result complete. SIGINT/SIGTERM request cancellation and a generic incomplete report. A hard kill,
crash or output I/O failure can leave an empty/invalid artifact; never accept it as
a complete report. Rerun a failed scan from the start.

Two matching observations compare selected values and exact document metadata,
including masked-out-content edits through updateTime. This detects many concurrent
changes but is NOT a global point-in-time snapshot or proof of no later writes. An
active site may require retry/review if scans change. The tool cannot establish a
write fence, pause privileged writers, verify browser/server bindings, prove backup
integrity, inspect Storage, certify ownership/content/historical sender authorization, select a retained project or
approve an in-place/cross-project migration.

## Protected owner-only follow-up and in-place decision gates

There is deliberately no verbose/detailed export mode. If aggregates indicate
problems, a separately authorized owner/reviewer privately inspects the relevant
canonical collection in Firebase Console using existing read-only access. Compare
source relationships, Auth identity evidence and original provider records without
pasting record IDs, screenshots, messages or notes into chat/GitHub. Unknown schemas
require a reviewed contract extension and synthetic tests, not an approve-all switch.
If a programmatic detailed diagnostic becomes necessary, it requires its own privacy,
permission and protected-output review; this tool supplies none.

Before approving an in-place upgrade:

1. Establish actual deployed browser Auth, Admin principal/database and Storage
   bindings; browser Firestore evidence alone does not settle those identities.
2. Obtain complete independently reviewed inventories for BOTH projects, explain
   unknowns/collisions/withheld records and preserve per-project provenance.
3. Verify READY backup coverage/watermarks and protected integrity comparisons for
   both Firestore datasets; separately establish Auth, Storage and configuration
   recovery. A successful sandbox restore does not protect the other project or
   prove full integrity.
4. Decide explicitly whether an in-place upgrade of fawcett-website can preserve its
   existing accounts/history without moving records. Preserve the sandbox separately
   pending its reviewed disposition. Do not infer a destination from project names,
   matching contacts or an earlier plan. A cross-project move has additional account,
   collision, Storage, session and rollback gates and requires separate approval.
5. Review the compatible frontend/server/rules/index artifacts, writer shutdown,
   callback handling, safe projection publication, source preservation and rollback.
   Any real migration adapter/operation remains a separate implementation/security/
   execution approval. Existing createProductionOperator stays hard-disabled.

No deployment, real read, data movement, payment/email activation or migration
execution follows automatically from this tool or its tests.

## Fictional example

[Aggregate example](examples/two-project-audit-fictional.json) is generated from the
synthetic unit fixtures (`demo-fawcett-audit-one` and `demo-fawcett-audit-two`). It
contains counts only and is not either project's current inventory. The examples
intentionally include potentially overlapping identities/provider references; they
are not merged or declared actual settled payments.

## Development validation — October 17, 2026 (Edmonton)

- Final `npm test`: **482 passed**, zero failures across 12 active suites.
- New audit suite: **22 passed** (21 mock/contract/privacy tests and one real
  two-project Auth/Firestore emulator integration). Unit tests were also rerun
  after adding an explicit duplicate-page response assertion; all 21 passed.
- `npm run lint`: passed, zero errors; three existing homepage image warnings.
- `npm run build`: isolated demo production build passed.
- `git diff --check`: passed. No dependencies or lockfile changes.

The first full attempt exposed an existing verification test that reused a cached
token after an Admin email change: revocation correctly returned 401 rather than
the expected limiter 429 at a second boundary. The test now signs in again with the
new email and asserts the same UID before checking the durable budget. Authentication
code and revocation enforcement are unchanged; the final complete suite passed.

Coverage includes project-number/database/region gates before either data scan,
readonly versus write-capable IAM probes, unsafe credential/impersonation rejection,
no mutation interface/endpoints, scoped field masks, missing/ambiguous/conflicting
relationships, orphan/nested/missing-parent records, provider/environment/order/
refund/dispute reference checks, cross-project collisions without identity merging,
interrupted/repeated/empty/duplicate pages, malformed values/errors, changed commit
metadata, private CLI failures, aggregate-only canaries and reproducible examples.
The emulator integration verifies all seeded document contents/commit times and
Auth identities before/after with no changes and only GET/read-metadata POST calls.

Cloud Shell/Google metadata and permission responses are mocked in development.
No real Google Cloud Shell credentials, real IAM grant, live Firebase service or
client records were accessed. Emulator success cannot establish real API/permission
readiness, recovery integrity, settlement or a production upgrade decision.
