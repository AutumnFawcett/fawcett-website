# Studio client management — Phase 2

## Scope and records

`/admin/clients` now provides studio-managed files above the legacy portal history.
New files use randomly generated `studioClients/{studioClientId}` IDs, independent
of Firebase Authentication UIDs. Creating or editing a file never creates an Auth
account, changes a password, grants portal access or changes existing source or
portal records. All contact fields, status, preferred artist and `studioNotes`
are private to active admins through `/api/admin/clients`.

The older history panel remains read-only and retains consult/application/project/
conversation browsing and navigation. Only an explicit recorded Auth UID groups
legacy records. Equal email addresses no longer combine unrelated records, and
source document IDs are never treated as Auth UIDs. Existing intake, inbox,
projects, appointment and financial workflows retain their current record IDs and
write paths. Existing private legacy notes remain on their private originals.
Edit new studio contacts and notes in the new manager rather than writing inferred
profiles into the legacy UID-keyed collection.

Collections:

- `studioClients/{id}`: contact fields, private notes, revision, timestamps and
  normalized duplicate keys. No `clientUid`, credentials or portal projection.
- `studioClients/{id}/audit/{eventId}`: server-authored actor UID, action, changed
  field names, revision, timestamp and reviewed duplicate decisions. Consultation
  association events include source ID and the review reason. Events intentionally
  omit previous/new note text and full contact payloads, reducing retained copies
  of sensitive information. No audit edit/delete operation exists in this API.
- `studioClientDuplicateLocks/{hashedKey}`: contention locks for normalized contact
  keys. Transactions prevent two concurrent unreviewed matching creations.
- `studioConsultAssociations/{consultId}`: one reviewed studio-file association for
  the consultation, with reviewer, timestamp and reason. Does not change the
  consultation's original Auth UID, data or document path.

All four paths are denied to browser SDK clients, including active admins, by the
existing default-deny rules. They are not added to portal projection allowlists.
No rules file changes or deployment are part of this phase. The Admin SDK bypasses
rules: server authorization and input validation are therefore tested directly.

## Authorization and safe writes

The route verifies the Firebase bearer token with revocation checking and requires
`adminUsers/{uid}.active === true` before reads or writes. Every transaction checks
the role again before writing. Responses are private/no-store. The API rejects
unknown input fields (including ownership/link injection), invalid IDs, malformed
contacts, unsupported statuses/artists, oversized notes and unsupported actions.
An update must carry the current revision; stale edits fail without overwriting.
A saved file and its audit event commit in one transaction. New records and edits
have no deletes, merges, payment operations or notification side effects.

Normalized full name, email, last ten phone digits and Instagram handle identify
*possible* duplicates, never authoritative identity. Case, whitespace, phone
punctuation/country-code differences and a leading Instagram `@` are normalized.
Phone suffix matching may produce false positives, especially internationally;
name matching intentionally produces warnings for namesakes. Differences in
spelling, aliases, incomplete contacts or alternative handles can evade matching.
Admins must review originals; do not treat absence of a warning as proof of uniqueness.

Saving a possible duplicate is blocked with candidate IDs/contact summaries. A
review reason of at least ten characters and the current server-issued review token
allow a deliberately separate file. Changing candidates/revisions or identifying
input invalidates the token. The decision is audited; no existing file is merged,
deleted or overwritten. Locks are hashes, but hashes and normalized contact keys
are still sensitive metadata and require the same private access policy.

The manager lists files in stable ID pages of 100. Search applies to loaded pages;
the UI explicitly identifies this scope and provides Load more. Duplicate matching
always checks all matching studio files server-side, irrespective of loaded pages.
Legacy sources have not been normalized or migrated into this registry; review the
legacy panel and the separate approved inventory before creating corresponding
studio files. This check does not establish uniqueness against legacy history. Audit
history displays the latest 100 events; older events remain retained. Very large
sets of identical contacts may require an operational review interface before use
at scale; this phase does not silently truncate duplicate candidates.

## Reviewed consultation association

1. Save/select a studio file and supply the original consultation document ID.
2. Retrieve its current submitted contact details, timestamp, status and original
   account UID. Independently review identity and the full original in the existing
   consultation screen; no email match constitutes ownership verification.
3. Enter a reason and explicitly confirm review. The server compares both the
   selected client revision and a digest of the exact consultation reviewed.
4. Commit an association and audit event atomically. A repeat association to the
   same file is idempotent; an association to a different file is rejected.

Original consultations, messages, applications, appointments, projects, payments,
UIDs and portal projections are never rewritten by association. It neither copies
free-text health details nor grants access to linked history. Correcting an
association requires a separately reviewed workflow that preserves prior events;
there is no silent reassignment endpoint in this phase.

## Verified account linking — separate controlled design

Linking is deliberately unavailable. A future approved workflow must:

1. Require an active admin, recent reauthentication, an explicit reason and a
   single-use expiring review request. Independently confirm the person's intent
   and identity through a trusted studio process.
2. Require the client to sign in to the intended existing Firebase Auth account,
   confirm a verified email and recent authentication, and accept the specific
   pending link. Never create an account/password for a manually entered client.
   Email equivalence or possession of a consultation ID is insufficient.
3. Check for conflicting links on both sides in one transaction. Store dedicated
   UID-to-studio-ID mappings rather than changing stable IDs or rewriting history.
   Use immutable actor/subject/reviewer audit events, with controlled revocation.
4. Review each legacy source's ownership and client-visible projection separately.
   Linking alone must not republish legacy notes/health text, transfer payment
   entitlements or broaden portal access. Quarantine disputed/missing ownership.
5. Add token-replay, expired-review, recent-auth, verified-email, wrong-user,
   conflicting-link and unlink-with-history authorization tests before activation.

No such endpoint exists; ownership fields and link actions are rejected today.

## Production prerequisites and migration

No production data was accessed, no migration ran and no production settings changed.
Before any separately approved deployment:

- Complete Phase 1's approved rules/frontend cutover and reviewed projection plan
  in [client-privacy-migration.md](client-privacy-migration.md). This phase does not
  close exposure under old deployed rules. Legacy records without projections
  remain private after that cutover and unavailable in the portal until reviewed.
- Independently verify the real Firebase/Vercel production identity and deployed
  rules. Verify the new studio namespaces have default-deny access, including
  wildcard/collection-group rules. Never copy production data/config into Codex.
- Confirm the server's existing Firebase Admin credentials are correctly scoped
  for the intended project, the Node runtime supports the route and active admin
  role documents are correct. No new secret or Firebase configuration is needed
  in Codex; use the established demo Auth/Firestore emulators only.
- Review retention, access monitoring, backup and recovery for private files/audit
  records. Trusted Admin SDK operators can bypass application audit constraints;
  operational IAM, retention and monitoring must constrain those privileges.
- Verify required Firestore indexes in the actual deployment environment. Current
  queries use single-field indexes (`duplicateKeys` array, document ID, audit
  timestamp and association studio ID). Restore excluded indexes if applicable;
  emulators do not establish live index readiness.
- If existing real clients are to receive stable studio IDs, prepare a separately
  approved dry-run inventory and restricted backup outside Codex. Explicitly review
  duplicates/ownership, create studio files and a provenance manifest, and preserve
  original source IDs, private notes, UIDs and all historical/financial relationships.
  Do not infer links from email or IDs. Reconcile changes during preparation and
  make any backfill auditable and restartable. No automatic migration is included.

Payments, checkout, subscriptions and notifications remain inactive/unchanged.
This branch must be reviewed and merged into `codex/fawcett-current-work` separately;
it must not deploy or merge into main automatically.

## Local validation

Use `npm test`, `npm run lint` and `npm run build` with the existing ignored safe
emulator environment. Integration tests use synthetic `.test` accounts and verify
actual Firebase Auth bearer tokens, active roles, private browser denial, immutable
source history, audit writes, stale revisions, duplicate review/concurrency and
reviewed association conflicts. Existing Phase 0/1/payment regressions remain in
the full suite. No real-data or production index validation is claimed.

Phase 2 review evidence: 206 automated tests pass (15 environment/model, 102 payment,
79 Firestore privacy, 10 Auth/Firestore integration). Lint has zero errors and three
existing image warnings; the production build completes. A separate Chromium smoke
check against the built app and synthetic emulators exercised admin create/edit,
audit history, reviewed association and duplicate review, then client portal privacy.
The 390px mobile viewport had no horizontal page overflow and no browser runtime
errors occurred. Browser tooling was temporary under `/tmp`; no dependency or lockfile
changes were needed. The repository's emulator tests remain reproducible with npm.
