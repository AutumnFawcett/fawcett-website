# Stage 2D-8: four signed-ledger review corrections

Based on PR #69 `51f17bae89e7232bde78547fef2ec0d8a7d089a6`; targets
`feature/stage2d-signed-ledger`. No upstream branch is changed. This increment
changes only the existing signed-attendance verifier/ID construction, its emulator
regressions and this document. No routes, ledger products, financial policies,
provider integration or deployed runtime profile are added.

## Issuance versus historical verification

New acceptance requires the configured issuance key and the new deterministic
artifact ID, in addition to the existing registry permission/scope/signature and
active-key checks. Historical replay resolves the original key and issuer from
the independently trusted, publisher-authenticated current registry. It does not
require the old key/issuer to equal today's issuance configuration. The original
protected acceptance anchor and exact artifact hash remain mandatory.

Verification-only keys can verify previously accepted history; they cannot create
new effects or accept an old, previously uncommitted proposal. Revoked keys and
compromised issuers continue to freeze replay for review. Current Firebase actor
and exact client/project authorization remain required, including duplicate
recovery. Rotation never signs again, replaces history or writes a migrated receipt.
Tests rotate to a new configured key (including a new registered issuer) and check
that the anchor/journal remain unchanged and the new signer is never invoked.

## Exact replay journal

The plan must contain exactly one journal write, at the exact account/operation
journal path, with `create` semantics. Entry ID, client, environment and actor
must match the plan. Missing, duplicate, foreign-path and set/update-style journal
writes fail closed. This structural validation applies to new and historical
verification; normalized payload and proposal signatures are still verified.

On replay, the expected journal/hash is derived from this signed write. The
returned actual journal must equal it exactly. The separately stored anchor hash
must match that derived hash; it can never substitute for signed journal evidence.
Tests include a balanced unauthorized replacement with an otherwise valid local
legacy receipt and a matching substituted anchor hash, plus malformed plans
bearing valid disposable mock signatures. All such replays reject without any
additional financial effect.

## Bounded identity

New IDs are `attendance_` plus a SHA-256 digest of versioned operation identity:
resource project/database/environment, client/environment scope and operation ID.
They are 75 characters even when the operation ID is the permitted 128 characters.
They remain stable across retries and key changes; distinct operation IDs or
resource/client scopes produce distinct tested identities. Operation intent
collision checks remain unchanged. Historical verification does not rewrite or
require this new format. A disposable fixture representing the old accepted
prefix format remains readable after rotation; there is no migration API.

## Transaction/concurrency evidence

Tests instrument the actual Firestore SDK callback entry using AsyncLocalStorage,
so custom uncertain-response, rollback and concurrency wrappers cannot bypass the
monitor. Both asynchronous ledger/publisher signing and local ownership signing
assert that they are outside monitored retry callbacks. Firebase ID-token
verification and user-status reads are instrumented as external authentication.
Concurrent independent requests have separate asynchronous contexts, avoiding
false positives when a signer runs outside its own transaction while a different
request has an open transaction.

The previous injected `ABORTED`/nested-publication test is removed. A real emulator
race pauses a posting after its registry read, starts the authenticated publisher
from the independent controller and releases the posting. Firestore must serialize
or retry those transactions: a successful posting retains the earlier registry
revision at its commit, or the changed revision rejects it. A second concurrent
case completes publication before the posting reads and requires rejection. No
publication, authentication or signing is invoked by the posting callback. The
existing concurrent identical/conflicting financial commands continue to test
real emulator contention and one financial effect. Rollback compares every planned
financial/audit/ownership document and anchor with its pre-transaction state.

The tests do not force a specific lock winner or claim a particular number of SDK
retries: emulator scheduling is not a security guarantee. They prove serializable
outcomes or fail-closed rejection without a mocked successful transaction/retry.

## Limits and follow-up

All keys/records are disposable emulator fixtures. Tests deliberately tamper with
those fixtures to model corruption and legacy history; application code performs
no historical migration/re-signing. Existing schema-1 receipts, durable envelopes,
registry custody and process-local anti-rollback/restart limitations remain as
documented in Stage 2D-6. No deployed signing key, KMS, IAM, Firebase rule/config,
Square operation or customer record is accessed or changed. Transferred spending,
cross-lot refunds and live financial routes remain disabled.

The known Jane/Janet substring-search expectation and JSX apostrophe lint error
remain separate maintenance work. Next: independently review these four narrow
corrections, then prepare that maintenance PR and verify required repository checks
and branch protections before requesting any merge approval. The stacked branches,
including #61's merge ancestry and #59's separate Square integration boundary,
must be preserved. Production identity, durable key/registry/audit custody, trusted
provider ingestion, owner recovery/step-up and legal/accounting approvals still
block financial activation.
