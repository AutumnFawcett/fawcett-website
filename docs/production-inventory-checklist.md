# Owner checklist — retained production backend (Phase 4A)

**Read only, outside Codex.** Retain `fawcett-website-sandbox`; it contains real
clients despite its name. Do not access/change `fawcett-website` for this plan.
Do not edit/save settings, create/delete accounts, export client data, start backups,
run migrations or deploy anything during this inventory. Those require later gates.
Keep findings privately; share completion/counts/blockers rather than credentials,
client text, medical notes, exports or screenshots of personal information.

Follow [in-place readiness and go/no-go gates](in-place-production-readiness.md).
This checklist does not assert that any live setting has been checked by Codex.

## 1. Confirm the website and backend

- [ ] In Vercel, open the studio's project and current **Production** deployment.
  Record its deployment ID, commit, public aliases/domain and connected Git branch.
  Do not redeploy or promote a preview.
- [ ] In Settings → Environment Variables, inspect Production scope privately without
  editing. Confirm `NEXT_PUBLIC_FIREBASE_PROJECT_ID` and `FIREBASE_ADMIN_PROJECT_ID`
  identify `fawcett-website-sandbox`. Confirm actual browser-bundled Firebase app
  identity through an authorized read-only inspection; saved settings alone do not
  prove which values are embedded in the current deployment.
- [ ] In Firebase Console, select by exact **project ID/number**, not display name.
  Project settings → General → Your apps identifies the current web app. Compare its
  API key/auth domain/bucket/sender/app ID with the existing Vercel browser bindings
  privately. Check the server service identity's authorized project separately.
- [ ] Record database ID/region and actual bucket identity. Current code uses default
  Firestore; a named-database mismatch is a blocker. Do not guess bucket suffixes.
- [ ] Production has no emulator endpoints. Only genuine Vercel Production uses live
  config; local/Preview/Codex stays demo-only. Preserve correct existing settings.
  Any mismatch requires investigation/approval, not automatic correction or a switch
  to `fawcett-website`.

## 2. Record the deployed policy and index state

- [ ] Firestore → Rules: record deployed version/release/evidence location and compare
  privately with the reviewed candidate `firestore.rules`. Do not click Publish.
  The repository does not prove which rules are currently deployed.
- [ ] Determine whether clients can currently read entire originals (including private
  review/health text). Record the risk without pasting examples. New views alone
  do not close raw-source exposure; rule enforcement is required.
- [ ] Check wildcard/collection-group access to originals, `portalRecords`, private
  studio paths, `migrationRuns`, raw founder profiles and authoritative financial
  collections. Admin SDK access bypasses rules and needs separate review.
- [ ] Firestore → Indexes: record current indexes/exemptions/readiness. Compare actual
  queries against the new view namespace: UID equality, UID + conversationId messages,
  UID + clientVisible timeline and any real additional ordering/filter combinations.
  Include studio duplicateKeys, ID paging, audit timestamp and association queries.
  Do not create/delete indexes during inventory. Emulator success does not prove
  live composite or single-field index readiness.

## 3. Inventory counts and ownership privately

Use approved read-only aggregate/path inventory; note unknown collections and nested
subcollections. Do not export documents into Codex or assume the table is exhaustive.
Keep raw path/UID evidence in restricted owner storage, not in GitHub/chat.

| Scope | Record privately |
| --- | --- |
| clients | Count, explicit UID presence, profile-ID/UID mismatches, existing views |
| consultRequests, membershipApplications | Counts, links, private readiness/review fields, generated summaries/drafts |
| conversations, messages | Counts, source/owner links, clinical summaries/previews, reviewed versus withheld history |
| projects, projectTimeline | Counts, source links, private/health entries, legacy review-derived client summaries |
| appointments | Count, project/owner links, internal versus client-visible notes |
| payments, creditLedger | Counts, exact currencies/amount aliases/negative movements, IDs/links/timestamps and private references |
| membershipOffers, membershipOfferResponses, membershipChangeRequests | Counts, ownership, published/draft status and relationships |
| portalRecords | Counts by source, existing destinations, owner/content review status, unknown/unowned views |
| studioClients + audit, studioConsultAssociations, duplicate locks | Private counts, stable studio IDs, audit/association integrity; no automatic Auth linkage |
| migrationRuns | Existing run/journal identities, ownership and restart/withdraw dispositions |
| Other financial/backend paths | founderProfiles, paymentOrders, paymentTransactions, paymentWebhookEvents, checkout/rate-limit state, founderContributions/counters and unknown server-only histories |
| Storage/external links | Actual buckets/object counts, ownership/access metadata, reference/download URL inventory and unknown access rights |

- [ ] Identify missing/deleted/disabled Auth owners, duplicate contacts, uncertain
  owners, missing/cross-owner links and unknown schema/type/money cases. Do not infer
  ownership from email/source ID or repair records during inventory.
- [ ] Separately classify free-text consult summaries (`Health / Notes`), previews,
  health/admin/internal notes, appointment/project descriptions, links and legacy
  `adminReview.clientProjectSummary`. A field allowlist cannot certify their text.
  Capture counts/dispositions, not raw private examples in shared reports.

## 4. Check Auth and writers without changing them

- [ ] Authentication → Users/Sign-in method/Settings: record account/provider counts,
  disabled states, relevant authorized domains and configured tenant/MFA/session
  behavior privately. Do not export password hashes, reset passwords, revoke sessions,
  enable providers, create accounts or request client passwords.
- [ ] Review actual `adminUsers/{uid}` active roles and server IAM against existing
  Auth identities. Do not promote/demote anyone now. Studio files must create no Auth
  account, password or automatic link even when their email matches an account.
- [ ] Inventory every writer: active/old website bundles, cached/offline clients,
  admin browsers, server APIs, Admin SDK jobs, Functions, extensions, imports,
  webhooks and scheduled services. Identify the owner of each and whether it maintains
  the exact approved source/view pair or intentionally withholds a view.
- [ ] Confirm whether a **real write fence** is available for direct SDK writes and
  privileged/external writers. A maintenance page does not pause them. Do not deploy
  a fence or disable Auth during this inventory. Source-only legacy intake and
  later re-publication of unreviewed summaries need an approved ongoing policy.
- [ ] Record current notification/payment integrations and activation state without
  calling/replaying/enabling them. Check triggers that would fire on view/journal
  creation. Preserve the inactive/unchanged state throughout this work.

## 5. Recovery and operator preparation

- [ ] Record existing backup/PITR/retention/status and prior restore evidence without
  starting an export/restore. Note separate Auth, Storage, configuration and deployment
  recovery coverage; Firestore backup alone does not cover these systems.
- [ ] Identify who can later approve/perform a protected backup and isolated restore
  outside Codex, verify source hashes/IDs/UIDs/links/money/timestamps, and reconcile
  post-backup writes. Do not restore over production as a test.
- [ ] Record only the names/presence and authorized project of existing server
  credential bindings privately. No credential generation/rotation/disclosure is
  requested. Identify a separate future operator identity and needed read/plan,
  apply, withdrawal, backup, rules/index and Vercel responsibilities; see
  [adapter design](in-place-adapter-design.md). No account-write permission is needed
  merely to generate projections.

## Gate 0 result — do not proceed automatically

Owner: __________ Reviewer: __________ Evidence date/time/timezone: __________
Production project/database/app verified: __________
Private evidence location: __________
Counts complete / unknown paths: __________
Policy/index/owner/content/writer/fence/backup blockers: __________

**Go for inventory review only** when evidence is complete. Anything uncertain is
no-go for production migration/deployment. Gates 1–5 in the readiness guide still
require separate signoffs. Keep both real projects unchanged during Phase 4A and
leave the separate `fawcett-website` project untouched.
