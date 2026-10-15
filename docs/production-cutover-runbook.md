# Coordinated privacy rollout and rollback runbook

> Phase 6A development update: [enforced fence and publication controls](write-fence-publication-controls.md)
> supersedes earlier repository gap descriptions and cached-source-only behavior.
> The live rules/writers are unverified and no production operation is authorized.


**Phase 4A decision:** retain `fawcett-website-sandbox` as production. `fawcett-website` is not a destination and remains untouched. Use the [in-place readiness plan](in-place-production-readiness.md), [owner checklist](production-inventory-checklist.md) and [adapter design](in-place-adapter-design.md). Cross-project instructions are deferred; no production operation is authorized.

**Status: review-only plan. No production authorization, access or deployment has
occurred.** This PR supplies an emulator rehearsal, not a production execution
adapter. All operations below involving real infrastructure require new explicit
owner approval and an authorized operator outside Codex. Keep live data, manifests,
backup contents and credentials out of Codex/GitHub.

## Repository evidence and blockers

The earlier Phase 3 baseline contains PR #32 (demo isolation), #33 (private originals
and portal projections) and #34 (private studio files and audited associations).
The checked-in policy denies client reads of original CRM records; the portal
reads only own allowlisted projections. New studio records use a server-only API.
Existing originals, IDs and UIDs are not rewritten by this phase. Phase 1's ordinary
admin edit guard still withholds legacy sources with no projection.

Checked-in `firebase.json` is a deployment-capable rules configuration, while
`firebase.emulators.json` is the local test configuration. **Neither was changed,
and no deploy command is part of this rehearsal.** No production index manifest,
production inventory, protected backup, approved migration manifest, executable
write fence or production migration adapter has been verified/provided. AGENTS.md
mentions Next 16.2.7; package/lock currently use Next 16.3.3. Validation uses the
installed locked toolchain, JavaScript, npm and App Router.

No production rollout may proceed until the following independent gates are signed.
A person named “reviewer” in a synthetic manifest is not a production signoff.

| Gate | Required approval and evidence | Stop if missing |
| --- | --- | --- |
| 0 | Review/merge the feature PR into the shared work branch; preserve a reviewed candidate commit and test evidence | No automatic merge/deployment |
| 1 | Owner + reviewer complete the read-only inventory checklist and verify the actual project/policy/writers | No inferred environment identity |
| 2 | Owner authorizes a protected production backup and successful isolated restore rehearsal, outside Codex | No migration without recoverable originals/Auth history |
| 3 | Separately review a production-only operator adapter, IAM, explicit project/database binding, reports, approvals and write fence | This PR's tool deliberately cannot run against production |
| 4 | Owner + reviewer approve the eligible-record manifest, all withheld reasons/counts, content/ownership review and expected client behavior | No approve-all, email inference, redaction guesses or silent omissions |
| 5 | Owner approves exact maintenance window, writer pause, candidate rules/frontend artifacts, operators, abort thresholds and rollback plan | No infrastructure changes based on this document alone |
| 6 | Two-person go/no-go after reconciliation and fresh authorization tests | Keep maintenance if any privacy/data-integrity check fails |

For each gate retain approver, operator, scope, project/database, candidate commit,
manifest/backup reference, timestamp/timezone and a private evidence location.

## Backup and recovery preparation — Gate 2

1. In the authorized production administration environment, establish the supported
   Firestore backup/PITR/export mechanism and a protected, encrypted, access-limited
   destination **outside Codex**. Owner approval must identify the method and cost.
   Include private originals, subcollections, existing projections, studio files,
   associations/audit, migration metadata and server-only financial histories.
2. Separately preserve Auth account/UID/provider configuration and required account
   recovery material through a supported restricted process. A Firestore backup
   does not back up Firebase Auth. Include relevant Storage objects, rules/indexes,
   deployment versions and non-secret configuration references; manage credentials
   through the existing secret system, never a repository export.
3. Record backup completion/watermark, counts and protected integrity evidence.
   Demonstrate recovery to an approved isolated recovery environment outside Codex,
   with side effects disabled and no public access. Do not restore over production
   as a test. Verify exact IDs, UIDs, timestamp precision, relationships, currencies,
   payment/credit values and private notes. Retention/recovery-point objectives need
   owner signoff; a “backup job started” message is insufficient.
4. Distinguish application rollback (withdraw projections/maintenance) from data
   disaster recovery. This migration must not alter originals, so routine rollback
   must not restore whole backups or overwrite newer client submissions/payments.

## Candidate preparation and approved manifest — Gates 3–4

- Independently review the production execution adapter. Do **not** add a live
  project flag or bypass the emulator guard in this PR. A future adapter must bind
  an explicit verified project/database and least-privilege identity, preserve
  transactional hashes/journals and private reports, and have separate approval.
- Verify every source UID against the intended existing Auth account and independent
  ownership evidence. Quarantine missing, disabled, conflicting or disputed accounts,
  wrong profile IDs and missing/cross-client links. Never rename source IDs or infer
  a UID from contact values. Studio files remain separate; account linking is not
  authorized by migration and requires the Phase 2 controlled workflow.
- Review the exact candidate projection, all nested/free-text leaves and relationship
  context. Exclude readiness, admin review/notes/statistics, staff identifiers,
  private references and draft/private/health timeline entries. Do not derive text
  from private review objects. Sensitive legacy chat summaries/previews stay private.
  Do not change immutable original message bodies to satisfy a public schema.
- A regex/field allowlist cannot certify medical confidentiality. If a reviewer
  cannot establish that a free-text value is appropriate for the client, withhold
  the record. No automatic sanitization, keyword override or bulk approval.
- Bind each approval to the exact source and projection hashes, explicit UID,
  reviewing active admin and content/ownership attestations. Lock the run to the
  immutable manifest hash. Source changes require re-review, not a forced resume.
- Approve expected record counts, withheld records, absence/partial-history states,
  and financial reconciliation. Compare all cents/dollar aliases and timestamps
  exactly, without conversion, rounding, recomputation or entitlement rebuilding.
  Existing destinations require a separate reviewed reconciliation; never overwrite
  or silently adopt them. Test indexes and every authorized server writer.

## Maintenance and coordinated cutover — Gates 5–6

1. Announce an owner-approved window and support contact. Record current public
   deployment and candidate commit/rules versions. Protect candidate deployment
   access. A Vercel Preview cannot be pointed at live Firebase: the current guard
   intentionally forbids this. Any real production build/config work happens only
   in the separately authorized production environment outside Codex.
2. Enforce a write pause covering **direct Firestore SDK/REST writes from cached
   clients as well as the website UI**. A maintenance page alone is not a write
   fence. A separately reviewed temporary database policy/server-writer pause may
   be needed; no such policy is implemented or deployed in this PR. Pause jobs,
   imports and external writers; control Admin SDK writers independently because
   they bypass Firestore rules. Do not delete/disable client accounts or weaken
   privacy to implement the pause. If a safe fence is unavailable, stop.
3. Keep the maintenance fence active while applying the reviewed private-read/
   portal policy with compatible temporary write controls. Verify the correct
   project/database and deployed policy; test fresh owner/non-owner/anonymous and
   inactive-admin SDK/REST sessions. Legacy original reads and direct private studio
   reads must be denied before public projections become available. Allow for
   policy propagation; any unexpected allow is an abort condition. No rule deploy
   instructions are executed by this PR.
4. Take/verify the agreed cutover backup watermark under the fence. Reconcile all
   writes since inventory. Execute the separately approved operator migration,
   with record-level transactional source/ownership rechecks, immutable journals
   and private per-run reports. Keep unknown/sensitive records withheld. Observe
   triggers and abort on any unexpected email, payment or external side effect.
5. Deploy/promote the exact approved frontend/server candidate with genuine Vercel
   Production settings while maintenance remains active. New frontend + old rules
   denies portal reads; old frontend + new rules denies original reads. Do not
   open a temporary legacy-read exception to bridge mismatched releases. Verify
   browser/server project identity and active-admin server authorization.
6. Compare eligible + withheld + errors against the complete approved inventory;
   reconcile migrated/already-migrated counts, exact source preservation and
   financial amounts/links. Explain every intentional empty/partial portal state.
   Zero errors alone is insufficient if the approved inventory was incomplete.
7. Run the post-cutover matrix below using approved test identities/records through
   an authorized process. Never test checkout/notifications or create charges.
   Review fresh sessions and old browser tabs; cached data previously delivered
   cannot be retroactively withdrawn by rules.
8. With explicit Gate 6 signoff, lift the separate write fence and maintenance
   controls **without restoring old permissive read rules**. Verify consult/signup/
   messaging writes and source/projection pairing again. Reconcile late writes or
   offline retries; do not blindly rerun an old approved snapshot over live data.
   Retain monitoring, evidence and rollback operators for the agreed observation
   window. Payments/notifications remain in their prior approved state.

## Post-cutover verification matrix

| Identity/scenario | Required outcome |
| --- | --- |
| Existing client with reviewed projection | Own profile/history only; same IDs/UIDs/links/amounts/timestamps; no review/health/private references |
| Existing client without approved projection | Safe absent profile/withheld history; no source-read fallback or signup overwrite |
| Client selecting an existing conversation | Only own approved messages; reply/read state pairs work; no unrelated conversation access |
| Newly registered client | Own profile and consult/conversation/message pairs succeed; health stays in private source; no legacy takeover |
| Different client, anonymous, inactive admin | Private originals/studio records/journals denied; unrelated projected records denied |
| Active admin | Original review workflow works; studio create/edit/duplicate review/association/audit works through authorized API |
| Studio file with matching existing email | No Auth account/password or automatic link; private notes absent from portal |
| Financial history | Original recorded values/aliases/negative credit entries preserved; no checkout, subscriptions, webhook replay or notifications |
| Unknown/clinical/draft/private legacy record | Withheld with a private review reason; original intact; no automatic republishing |

## Abort and rollback — remain private

Abort for wrong project, missing backup, uncertain owner, unexpected writes/side
effects, raw/private read access, changed approved source, destination conflict,
missing indexes, unexplained counts, financial drift or broken signup/messaging.
Keep/reinstate the reviewed write fence and maintenance first; record the stop point.

- Use run-specific journals to identify projections actually created by the run.
  A safe withdrawal deletes only those derived records whose current hash still
  matches the committed projection. Keep sources, Auth, studio files, financial
  data and audit/journal evidence intact. Reruns skip completed withdrawals.
- If a view was edited after migration, **do not delete/overwrite it automatically**.
  Keep maintenance and obtain a record-specific review. This PR's emulator rollback
  reports the conflict. An absent view can be recorded as withdrawn; sources remain.
- After withdrawal, clients can have empty history under private rules. This is
  safer than restoring permissive original reads. Do not roll back to an old
  frontend/policy pair that exposes internal notes. Retain the reviewed compatible
  frontend/privacy policy or an approved maintenance release until repaired.
- Resume an interrupted unchanged run only after re-verifying every source,
  projection, reviewer and manifest. Do not change its manifest in place. A rolled
  back run is terminal: a new reviewed run is required for republishing.
- Restore whole data backups only for independently confirmed corruption/disaster,
  under a separate recovery approval that accounts for post-backup writes. Never
  restore/delete Auth accounts, rewrite payments or erase original messages as a
  routine rollback. Do not replay emails/payments to make derived state match.

## Remaining risks requiring owner resolution

Live project/policy/data populations, backups/restore, index readiness, external
writers/Storage permissions, provider settings, and real financial/ownership
semantics were not inspected. The maintenance fence and production adapter are
unimplemented blockers. Human review can miss sensitive free text; keyword checks
are incomplete and may over-withhold. Prior disclosures/caches cannot be undone.
Admin SDK operators can bypass rules/journals; restrict and monitor operational
privileges. Studio account linking, legacy duplicate review/migration and correcting
reviewed associations remain separately controlled work. This phase establishes
rehearsal evidence only, not production readiness signoff.

Phase 4A applies the above sequence within the retained backend only: no Auth transfer, project rebinding, password migration or Storage move. Gate numbering in the [current readiness plan](in-place-production-readiness.md) is authoritative for the new approval record. Historic validations are not current production signoff.
