# Owner's read-only production verification checklist

This checklist is for the owner and an authorized reviewer **outside Codex**. It
is not authorization to access production from this workspace or to change any
setting. Keep results in a restricted studio record. Record evidence locations,
reviewer names and timestamps; do not paste credentials, client exports, health
information or raw message text into chat, GitHub, this repository or Codex.

A display name such as “Fawcett Website Sandbox” does not make a project safe for
testing. Any project that has accepted real submissions/accounts is production
until independently verified. Do not rename, replace, delete or switch projects
as part of verification.

## Gate 1 — identity and configuration (read only)

- [ ] Identify the actual public domain, active Vercel project, current production
  deployment ID/commit, previous deployment and connected Git branch. Verify which
  deployment real clients reach, including aliases/redirects/custom domains.
- [ ] In Vercel Production settings and the built browser app's Firebase identity,
  compare project ID, Firebase app ID, auth domain and bucket. Compare the server
  Admin project ID and service identity separately. Confirm that browser and
  server point to the intended same database/project. Inspect values privately;
  browser app configuration is not a database authorization mechanism.
- [ ] In Firebase/Google Cloud Console, record immutable project ID and number,
  display name, database IDs/regions and Storage bucket identity. Confirm whether
  `(default)` is used; this code does not select a named Firestore database.
- [ ] Record how Vercel Production, Preview/Development, original “sandbox”, and
  Codex differ. Never assume environment separation from labels or branch names.
  Codex uses only `demo-fawcett-dev` with loopback emulators. Its guard rejects live
  project configuration and credentials; do not weaken that guard for staging.
- [ ] Confirm production builds use the genuine Vercel Production environment with
  complete intended Firebase settings and no emulator endpoints. Inspect only
  variable names/presence in shared records. Check that local/Preview contexts
  have no live credentials and no production database access.
- [ ] Record current active admin-role documents and their relationship to actual
  Auth accounts privately. Review inactive/departed staff and service IAM roles.
  Do not edit roles or accounts during inventory.

## Gate 1 — policy, data scope and writers (read only)

- [ ] Record the *deployed* Firestore rules version/release and privately compare it
  with the reviewed candidate `firestore.rules`. Repository contents do not prove
  live policy. Specifically inspect legacy owner reads, wildcard/collection-group
  access, portal namespace, founder raw profiles and server-only financial data.
- [ ] Inventory aggregate counts and collection/subcollection names, including all
  13 mapped sources: clients, consultRequests, membershipApplications,
  conversations, messages, projects, appointments, payments, creditLedger,
  membershipOffers, membershipOfferResponses, membershipChangeRequests and
  projectTimeline. Note unknown/custom paths instead of assuming this is exhaustive.
- [ ] Inventory existing `portalRecords`, `studioClients` and nested audit events,
  studioConsultAssociations, duplicate locks and any prior migration metadata.
  Note existing destinations: the rehearsal refuses to overwrite/adopt them.
- [ ] Inventory backend financial paths independently: founderProfiles,
  paymentOrders, paymentTransactions, paymentWebhookEvents, paymentCheckoutRequests,
  paymentCheckoutRateLimits, founderContributions and founderCounters. These are
  outside this projection backfill and must remain preserved and unchanged.
- [ ] Establish counts of records with explicit UIDs, missing/deleted/disabled Auth
  accounts, profile IDs differing from UIDs, missing/cross-client links, duplicate
  contacts and uncertain ownership. Do not resolve ownership from email or document
  IDs alone. Do not publish ambiguous records to make counts match.
- [ ] Classify private field locations and free-text risks in a restricted review:
  readiness/health, adminReview/internal notes, review-derived summaries, drafts,
  clinical timeline entries, staff identities, financial references, appointment
  notes, generated message bodies and conversation previews. Do not copy examples.
- [ ] Confirm original IDs, explicit UIDs, supported timestamp precision, currencies,
  cents/dollar aliases, refunds/negative ledger movements and links can be verified
  without rewriting them. Unknown financial semantics are blockers, not conversions.
- [ ] Identify every writer/reader: active website versions, cached/mobile clients,
  staff sessions, Admin SDK APIs, functions, scheduled jobs, extensions, webhooks,
  imports and external integrations. Note triggers that could send email/SMS or
  payments when a projection/journal is created. Do not enable/execute them.
- [ ] Check deployed single-field exclusions and required composite indexes against
  every actual portal/admin query (including UID + conversation ID and timeline
  visibility filters). The repository has no deployment index manifest; emulator
  success does not establish index readiness or current production query support.
- [ ] Inspect Auth provider/authorized-domain settings, session persistence and
  email verification/recent-auth requirements without changing accounts. Record
  actual existing-client and signup behavior. New studio files must create no Auth
  users and must not automatically link even when an email matches.
- [ ] Inspect Storage rules, bucket access, uploaded/reference-link data, backup
  locations, retention, logging and recovery capability. The checked-in app only
  initializes Storage; this does not establish safety of existing live objects.
- [ ] Record current payment/notification activation state and owners. Keep it
  unchanged; a readiness exercise must not toggle, call or replay a payment or
  notification integration.

## Gate 1 signoff and stop conditions

Owner: __________ Reviewer: __________ Evidence date/time/timezone: __________
Verified production identity: __________ Evidence retained privately at: __________
Unknown projects/writers/policies/indexes/ownership: __________

Stop if identity, backups, ownership, deployed policy, write fencing or side-effect
control is uncertain. Gate 1 is only read-only inventory. Backup, migration,
maintenance and deployment each require the separate approvals in the
[cutover runbook](production-cutover-runbook.md). No gate has been approved by the
current Codex task, and no live condition was verified here.

Owner-confirmed cross-project direction: `fawcett-website-sandbox` → `fawcett-website`; development remains isolated. See the [cross-project approval plan](cross-project-production-plan.md) for Auth/password/session limits, destination collision policy, Storage mapping and additional gates. No live operation is authorized.
