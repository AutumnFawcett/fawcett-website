# Cross-project production migration — owner review plan

**Status: plan and synthetic evidence only. No production operation is authorized
or performed.** The project identities below were confirmed by the owner, not
inspected through Codex. Continue treating the source as production regardless of
its name. Do not delete, rename or empty either real project.

| Role | Project | Treatment |
| --- | --- | --- |
| Current data-bearing production | `fawcett-website-sandbox` | Preserve real Auth, consults, conversations, messages and all other records; later freeze under separate approval |
| Intended permanent production | `fawcett-website` | Inventory and back up first; never assume empty or safe to overwrite |
| Application development | `demo-fawcett-dev` | Existing isolated Auth/Firestore/Storage emulators only |
| Cross-project rehearsal | `demo-fawcett-cross-source` → `demo-fawcett-cross-target` | Two separate synthetic project namespaces/databases/Auth stores/buckets on local emulators only |

## Reviewed repository state and scope

The shared branch includes merged #32–#35. [Phase 3](migration-rehearsal.md) supplies
a guarded **same-project** approved-projection rehearsal. Its production block and
fixed `demo-fawcett-dev` runtime are unchanged. It does not transfer Auth, Storage,
original documents or project configuration. The [inventory checklist](production-inventory-checklist.md)
and [cutover runbook](production-cutover-runbook.md) remain applicable; this plan
adds the cross-project requirements below. The new test harness is not a production
migration adapter, bulk export/import utility, or a deployment command.

The app uses default Firestore, Firebase Auth UID ownership, separate private
originals and owner-scoped `portalRecords`, and server-only studio records. Moving
projects requires coordinated changes to both browser and Admin project identity.
A project display-name change or Vercel variable edit alone does not move data.
The development guard still forbids live configuration in local/Preview contexts.

## Approval gates — all production work stays outside Codex

| Gate | Owner/reviewer must approve privately | Stop condition |
| --- | --- | --- |
| A — Inventory | Exact source/destination project numbers, database/bucket identities, current deployment, counts, Auth providers/tenants, writers, roles, policies and collisions | Unverified identity or unknown destination contents |
| B — Recovery | Recoverable source **and destination** backups; supported Auth recovery; Firestore/Storage restore test in separately approved isolated recovery infrastructure outside Codex | No demonstrated restore or retention/access plan |
| C — Identity and disposition | UID/provider/email/phone/tenant collision report, per-record disposition, password/reset strategy, privilege mapping, URL/reference mapping, client communication | Automatic merge, uncertain owner or unsupported credentials |
| D — Operator implementation | Separately reviewed production adapter, exact project/database binding, least privilege, per-item journals, conditional creates, safe logs, revision/digest checks, source/Auth freeze mechanism | This PR's emulator harness cannot be promoted by a flag |
| E — Content and configuration | Exact approved projection manifest, withheld records, all runtime writers, destination rules/indexes/Auth domains/providers/bucket settings, protected frontend build | Unknown sensitive text, missing index or unreviewed side effect |
| F — Cutover window | Write-freeze coverage, final backups/deltas, exact artifacts, operators, support plan, abort criteria and rollback point | Maintenance UI without backend/Auth fencing |
| G — Open to clients | Reconciled counts/amounts/links, fresh-session checks, source retirement controls and two-person go/no-go | Any unexplained drift or authorization failure |

For each gate record approver, operator, project/database/bucket, commit, manifest
and backup references, timestamp/timezone and evidence location. Retain evidence
privately outside Codex/GitHub. These gates have **not** been granted by this task.
No credentials, exports or hash configuration should be requested in chat.

## 1. Inventory both projects and pre-existing destination data

The owner/operator first performs read-only Console checks using the existing
[checklist](production-inventory-checklist.md). Identify all collections and
subcollections, including unknown ones, Auth accounts/providers/claims/MFA/tenants,
Storage objects/metadata/URLs, admin roles, indexes, rules, functions, extensions,
webhooks, scheduled jobs, email/SMS and payment integrations. Record current live
Vercel aliases and project identities. Do not copy private examples into this plan.

Default collision policy: **stop; do not overwrite, merge, rename IDs or adopt an
existing record automatically**, even if content/contact values appear identical.

- Auth: detect same UID, case-normalized email, phone number, provider ID + provider
  subject, and tenant conflicts. Matching emails are not proof of identity. An
  import API may update an existing UID; do not rely on it to reject collisions.
- Firestore: compare every destination path, including subcollections. Protect
  existing destination-only clients, financial records, projections and studio
  audit. Identical contents are not proof that this run owns the record.
- Storage: check bucket/object-name collisions, generations and metadata. Require
  conditional creates; never overwrite a destination object as a convenience.
- Roles/claims: preserve prior evidence, but do not grant old privileges merely
  because an account was imported. Independently approve each destination admin.

Each conflict needs an explicit owner-approved disposition and provenance record.
A UID/path belonging to two distinct real people cannot preserve both identities
in one default namespace. That is a **no-go requiring a separately approved design**,
not a reason to mint a replacement UID or merge histories. A destination-only
record can remain untouched only after its compatibility/ownership is established.
Only a journal owned by the exact approved run can establish safe resume behavior.

## 2. Backups, recovery and freeze

Before any source/destination writes, obtain Gate B approval for protected backups
of **both** projects. Firestore backup/export does not include Auth, Storage or all
project configuration. Preserve original Firestore paths and metadata, Auth identity/
provider/credential material through a supported restricted process, Storage bytes/
metadata, policies/indexes, admin evidence and deployment/configuration references.
Password hashes, salts, signer keys and Auth exports are sensitive recovery material:
restricted storage/IAM, encryption, audited access and owner-approved retention;
never put them in Codex, GitHub, logs or a web client. No such material is needed here.

Demonstrate restore outside Codex in separately approved recovery infrastructure
with integrations disabled, no public access and no production credentials/data
flowing into the Codex environment. Compare account metadata, UID/path sets, nested
records, byte checksums, timestamp values, currencies, cents/dollar aliases, negative
credit entries and relationship ownership. Record backup watermarks and recovery
objectives. Keep untouched destination backups for any pre-existing records.

A maintenance page is not a freeze. Before the final snapshot/catch-up, enforce a
separately reviewed fence on source Firestore/Storage writes from old/cached SDK
clients and pause Admin SDK writers, webhooks, imports, jobs and extensions. Address
**Auth** creation/deletion, email/password/provider changes and privileged claim
changes as well: freezing Firestore does not freeze Auth. The repository has no
verified cross-service freeze implementation. If the platform cannot safely fence
all relevant Auth changes, stop and approve/test an explicit final Auth-delta and
account-change reconciliation strategy before migration. Do not silently miss a
password change or a newly registered account.

Prevent bulk-copy triggers from sending messages, processing payments or altering
entitlements in either project. Keep payments and notifications inactive/unchanged.
Do not enable extensions, send resets or replay webhooks during this planning task.

## 3. Auth identity, passwords and client sign-in

Preserve each approved source UID exactly. Import supported account fields,
email/email-verification state, phone, disabled status, display data, provider
identities and supported creation/last-sign-in metadata. Capture original recovery
metadata separately where the import API cannot preserve it. Do not enumerate
accounts from the old `clients` collection or create accounts for studio files.

**Password continuity is conditional, not established by UID preservation.** A
supported Firebase Auth export/import can preserve a usable password only when the
actual hash/salt and correct original algorithm parameters are available and
validated. Firebase's modified `SCRYPT` is not interchangeable with standard scrypt.
An authorized operator must privately verify hash algorithm, signer key, salt
separator, rounds/memory cost and encoding/permissions, using the supported current
Auth tooling. Some previously imported/unsupported credentials may lack exportable
hashes; inspect completeness per account rather than assuming every export works.
Never ask clients for their plaintext password, derive it from a hash, or generate
a password for a manually entered studio client.

Before approving password retention, perform a supported hash-import test with
controlled test accounts in approved infrastructure outside Codex; never inspect
real client passwords. If hashes/parameters are unavailable or invalid, Gate C must
approve a password-reset/recovery plan and communications. It must preserve UIDs,
verify ownership, use destination action links/templates/domains and handle account
recovery without automatic email-based linking. Do not send resets or notifications
now. An identity-only import is insufficient to promise existing password login.

Sessions do not transfer across Firebase projects:

- Source ID tokens have the source issuer/audience; destination Admin verification
  must reject them even when the UID matches. Refresh tokens, session cookies,
  pending reset/email-action links and project-bound custom tokens are not portable.
- Expect a fresh destination sign-in after the new build and hard reload. Rebuild
  browser configuration; do not copy browser persisted credentials or accept both
  project audiences to hide migration errors. Existing tabs can still address the
  source; keep its data fenced. Refresh-token revocation alone does not immediately
  withdraw every cached ID token/data copy, and is not a database privacy policy.
- Reconfigure/review authorized domains, provider/OAuth clients, callback URIs,
  email templates/actions, anti-abuse/App Check and MFA requirements. Linked provider
  subjects or Apple/team-scoped identity mappings may need provider-specific handling.
  Importing provider metadata does not configure or test a live provider login.
- Review custom claims: retain approved client entitlements, but independently
  approve admin privileges. Re-establish `adminUsers/{sameUid}` only after identity
  review; require recent reauthentication/MFA for operators as separately designed.
  Do not copy role flags blindly. Preserve original role/claim evidence in backups.
- Inventory tenant use explicitly. The current app uses default Auth/Firestore
  ownership; unknown tenants or repeated UIDs across tenants block migration until
  a tenant-aware design is separately approved.

## 4. Firestore, projections and relationships

Copy original private CRM records at the same document paths, including nested
subcollections/audit, without flattening objects or deriving new client identities.
Preserve explicit UIDs, relation IDs, financial/provider references and exact stored
Timestamp field values (`createdAt`, `updatedAt`, appointments, received times etc.).
Do not recompute payments, credit, subscriptions, customer IDs or timestamps with
`serverTimestamp()`. Never regenerate consult summaries or overwrite original chat.

Firestore document-level `createTime`/`updateTime` metadata generally gets new
values when records are created in a different project; it is distinct from stored
Timestamp fields. Capture original metadata in the protected migration inventory
and prove supported recovery fidelity. Do not claim an SDK copy preserves original
server metadata or transaction history. Auth last-sign-in/password-update metadata
can also change after a real fresh sign-in/reset; reconcile against the snapshot
and retain original provenance rather than suppressing new legitimate events.

Typed Firestore DocumentReference values can embed the source project/database.
Inventory them, validate ownership and explicitly rebind approved references to the
same logical path in the destination; leaving them unchanged can reference the old
project. Preserve the original fully qualified reference in restricted provenance.
Unknown/external references, named databases, custom types or schema variants block
until reviewed. Preserve bytes, GeoPoints, arrays, maps and timestamp precision;
do not round-trip raw documents through lossy JSON.

Copy server-only financial collections and idempotency/webhook/checkout state as
preserved history only, after schema and collision review. Do not process/replay
those records or let existing live callbacks switch backend projects inadvertently.
Retain studio files and audit privately at stable studio IDs; matching imported
Auth emails do not link them. Source associations stay as reviewed associations.

At the destination, **do not blindly import old `portalRecords` or old permissive
rules as public access**. Keep it private until the approved policy/content review.
Independently approve any existing destination projections. Regenerate only exact
reviewed eligible views at the original IDs; preserve unreviewed/sensitive originals
privately. Use Phase 3's source/projection hashes, owner/reviewer checks, immutable
manifest identity, transactional journals and conflict-safe withdrawal semantics
in a future reviewed destination adapter. The current Phase 3 adapter remains
locked to development and is not that production implementation.

Health/readiness, admin review/notes/statistics, private references, staff identities,
clinical timeline entries and draft offers remain private. Sensitive legacy message
bodies/previews stay unprojected. Keyword checks cannot establish confidentiality;
unknown content/ownership means withhold. Review every link's owner and exact
financial alias/value. Keep an explicit eligible/withheld/error manifest instead of
making counts match by publishing more records.

Review normal post-migration writers too: `portalProjection` can intentionally
publish `adminReview.clientProjectSummary`, whereas the migration candidate excludes
review-derived text. A legacy summary must be independently reviewed before any
ordinary admin edit can republish it. Reviewed URL remapping can likewise be lost
if a normal writer later derives a view from an unchanged old URL. Block rollout
until this source/writer/content policy is approved and tested; a clean initial
backfill alone does not solve future publication.

## 5. Storage and URL/reference disposition

Inventory actual source/destination buckets and object names; newer buckets may use
`.firebasestorage.app`, older ones `.appspot.com`. Do not infer names from project IDs.
Copy exact bytes and approved metadata with checksums and source/destination generation
preconditions under the freeze. Preserve owner UID/object-key relationships. Record
original creation/update time and generation in protected provenance: destination
bucket identity, generation/metageneration and server timestamps will change.

Do not clone IAM/ACLs or bearer download tokens blindly. Review destination access
rules before enabling reads, regenerate/revoke tokens only under an explicit access
plan, and review any public/signed/download URLs. Long-lived URLs can bypass ordinary
client authorization. Never make a bucket public to repair broken links.

Old `gs://` references, download URLs, signed URLs and free-text `referenceLinks` may
still point to source objects. Use a reviewed per-reference mapping, not global text
replacement. Preserve original message bodies/URL provenance privately; decide which
client-visible destination links are approved. The current adapter has no general
URL-remap/writer-persistence workflow. Unresolved links or private/public ambiguity
are blockers. Keep the source restricted and retained until link/access/retention
requirements are met; do not delete it to force clients onto new URLs.

## 6. Owner-friendly Firebase and Vercel preparation

These are future **approved operator steps outside Codex**, not instructions to
perform production changes during this review. First complete Gates A–E.

1. In Firebase Console, select each project by exact project ID/number. Inventory
   and back up the destination first. Do not click “delete project,” create another
   live project, or replace the data-bearing source because it is named sandbox.
2. In the intended destination, review the web-app registration and default database
   identity/location, billing/quotas, Auth providers/domains, bucket identity, IAM,
   rules, indexes and integrations. Settings are not migrated by copying documents.
   Providers/email actions/MFA need their own verified configuration. Do not enable
   payments, notifications or side-effecting extensions.
3. An authorized operator prepares the separately reviewed destination private rules,
   Storage policy and required single-field/composite indexes. Wait for index
   readiness and verify default-deny/owner boundaries. This PR neither deploys nor
   changes rules and has no production index manifest. Do not restore permissive
   source rules at the destination.
4. With later deployment approval, in Vercel → project → Settings → Environment
   Variables → **Production only**, prepare the destination Firebase web-app values
   and server configuration below. Find existing web-app values in Firebase Console
   → Project settings → General → Your apps → intended web app → SDK configuration.
   Do not register a replacement app without the inventory/approval decision.
   Retain the prior settings in the approved secret
   recovery system. Enter server credentials only through that secure UI/system;
   never paste values into chat, GitHub, screenshots, Codex or `NEXT_PUBLIC_*`.
5. Build the exact reviewed release using genuine Vercel Production context while
   clients remain behind the approved maintenance fence. Preview/local live Firebase
   use remains forbidden. A variable edit alone does not replace Firebase values
   already embedded in a deployed browser bundle; a coordinated rebuild/release is
   required. Do not manually forge `VERCEL_ENV` or the derived deployment marker.

| Production setting | Future approved value/source |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_MODE` | `production` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `fawcett-website` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | API key in the intended destination web-app configuration |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Destination web-app auth domain; independently verify any custom domain |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Exact destination bucket from Console; do not guess its suffix |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender/project number in the destination web-app configuration |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | The intended destination Firebase web-app ID |
| `FIREBASE_ADMIN_PROJECT_ID` | `fawcett-website` |
| `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | Supported least-privilege server identity authorized for the destination; existing app expects these server-only certificate bindings; prepare only after approval |
| Auth/Firestore/Storage emulator overrides | Absent in Production; never route production to loopback |
| Payment/notification settings | Preserve the approved inactive state; do not activate during Firebase migration |

Do not mix target browser config with source Admin credentials/project or the reverse.
Keep local/Codex on `demo-fawcett-dev`. No new development credential is needed, and
this task has not changed any Vercel environment variable.

## 7. Approved execution, reconciliation and rollback

After Gate F, freeze source and destination writers, capture final source/destination
backups and reconcile all Auth/data/object deltas since the reviewed snapshot.
Re-run collision/ownership checks. The future operator adapter must journal bounded
imports and every per-user import error, conditional document/object create and
approved reference rewrite. Cross-project Auth/Firestore/Storage writes are **not
one atomic transaction**. Partial import is a stopped/restartable state, not a reason
to delete destination accounts or blindly re-import. Bind the run to exact source,
destination, snapshot, transformations and manifest. Resume only journal-owned,
unchanged items; changed/unowned destinations require new review.

Reconcile approved inventory with imported/skipped/withheld/conflict/error counts,
UID/path/object sets and logical hashes. Compare all supported Auth fields/provider
subjects, disabled states, approved claims/admin mappings, private notes, message
bodies, Timestamp fields, amount/currency aliases, negative credit movements and
relationship ownership. Check nested records, typed references and object checksums.
Explain new server metadata and every withheld view. Unknown collections/items,
errors, mismatched owners/amounts or missing indexes are no-go conditions.

Coordinate the approved destination rules + browser/server release under maintenance.
Fresh destination sessions must read only own reviewed views and cannot read private
originals/studio records. Test existing accounts under the approved password strategy,
new registration/consult/message pairs, selected conversations, inactive/non-admin/
anonymous denial, studio file creation without Auth creation, approved admin workflows
and Storage access. Do not exercise checkout, charges, resets or notifications now.
Only lift fences after Gate G and verify late/offline retries do not write to source.

Protect the old project as well: clients retaining source tokens or old links must
not retain access to internal notes under old rules after cutover. Retain source
originals and recovery evidence restricted/read-only for the approved observation
and retention window. No source decommission/delete is authorized by this plan.

**Rollback before destination client writes:** keep maintenance, withdraw only matching
run-created views using the approved journal, retain both private datasets/accounts,
and evaluate a reviewed compatible source release and privacy policy. Reauthenticate
to source as needed. Never roll back to permissive original reads, overwrite existing
destination data, delete imported accounts blindly, or assume cookie portability.

**After any destination signup/write/account change:** stop a simple switch-back.
Source lacks the new destination state. Keep maintenance, capture destination backup/
deltas and obtain a separately reviewed recovery/reverse-reconciliation decision.
Do not lose new messages/consults/payments/accounts by pointing Vercel back to stale
source config. DNS/bundle rollback does not reverse data or Auth migration. Preserve
both histories, timestamps and journals; never replay payment/email events to catch up.

## 8. Synthetic rehearsal evidence and limits

`npm run test:cross-project` starts only local Auth/Firestore/Storage emulators.
Two fixed project namespaces have separate Auth stores, Firestore databases and
buckets. They share local emulator processes; this is not two real cloud projects
or a production isolation/IAM test. No real project ID is accepted by the harness;
production credentials/remote hosts are rejected and Phase 3 guards stay unchanged.

The known fixture contains 5 Auth identities (including disabled and provider/phone
metadata), 25 Firestore paths including an admin role, nested studio audit, typed
reference/GeoPoint/bytes and financial history. Copy simulation preserves 24 private
originals and withholds the admin role pending separate privilege approval. Exactly
13 known reviewed portal views are created; 12 paths are not projected, including
private/clinical/unreviewed sources and role/audit/reference cases. Nothing infers
Auth accounts from studio client files.

Tests cover UID/email/provider/phone/document collision blocking, unchanged source,
original UID/logical-path/amount/timestamp fidelity, reference project rebinding,
provider/disabled metadata, withheld privileges, wrong-project token rejection,
fresh sign-in, identity-only import failing password login, new registration and
owner/non-owner privacy, separately approved destination admin access, studio-file
creation without Auth creation/linking, Storage collision preservation/bytes/metadata across buckets,
in-memory typed-document backup restore, view withdrawal with private originals
retained and the destination-only write gap that makes blind rollback unsafe.

Limitations are material: Auth Emulator passwords are fake, so these tests import
identity/metadata and separately set a **known synthetic-only** password to test
fresh sign-in. They do **not** validate real SCRYPT hash import, actual OAuth/MFA,
email delivery, session-cookie migration or project settings. The emulator ignores
API-key project selection; tests explicitly select its fixed logical Auth namespace
and use rules-test client contexts. Storage fixture rules allow signed-in synthetic
access and are **not a production privacy policy**. Storage copy preflight is not a
cloud generation-precondition test. Firestore server create/update metadata, IAM,
managed backups, live indexes, trigger suppression, production freeze, exhaustive
inventory and distributed restart/reverse synchronization are not proven here.

This test-only fixture copier has no operational CLI, production enable flag,
source export files or arbitrary project inputs. It must not become a production
adapter without Gate D. Existing Phase 3 tests separately validate per-record
journal/resume/withdraw semantics in one emulator project. A real cross-project
adapter, writer/URL policy, credential continuity and independent restore/freeze
verification remain blockers before any production operation.

## References for the future authorized operator

Consult current official documentation before selecting live tooling/permissions;
these links are references, not actions executed here:

- [Firebase Auth bulk import](https://firebase.google.com/docs/auth/admin/import-users)
- [Firebase CLI Auth import/export](https://firebase.google.com/docs/cli/auth)
- [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firestore project-to-project migration](https://firebase.google.com/docs/firestore/manage-data/move-data)
- [Cloud Storage copy/rename/move](https://cloud.google.com/storage/docs/copying-renaming-moving-objects)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)

Local validation for this PR: **236 automated tests passed, zero failures/skips**
(15 environment/model, 102 payments, 79 privacy rules, 10 existing Auth/Firestore
integration, 20 Phase 3 migration and 10 cross-project tests). `npm run lint` passed
with zero errors and three existing home-page image warnings. `npm run build`
passed. The fixed namespaces and buckets were used only in the local emulators;
no real Firebase project, production credential or Vercel setting was accessed.
No production identity, password hash, managed recovery, live policy or index
readiness was verified by these tests. Stop for owner review before any live step.
