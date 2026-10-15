# Studio payment bridge validation

Base: `codex/fawcett-current-work` at `1bccb40` (merged #42).
Branch: `codex/square-studio-client-payment-bridge`.

Final `npm test` exited 0: **393 passed, zero failed/skipped/cancelled**.

| Suite | Passed |
| --- | ---: |
| Environment/client model/configuration | 18 |
| Existing payments/Founder regressions | 102 |
| Firestore authorization/privacy | 79 |
| Existing admin/client integration | 10 |
| Migration rehearsal | 28 |
| Notifications | 34 |
| Email verification | 20 |
| Write fence/publication safety | 34 |
| Migration operator | 46 |
| Studio payment bridge | 22 |

New coverage includes no-account manual studio clients; private notes/audits;
concurrent retries; receipt/request conflicts; optional verified UID evidence;
missing/changed/cross-client project evidence; forged fields/amount/currency;
anonymous, inactive and non-admin requests; direct browser denials including
browser admins for private records/evidence; disabled checkout; missing fence;
provider ambiguity and attachment interruption; malformed checkout responses;
real signature verification with synthetic keys; trusted charge/refund/dispute
identity propagation; webhook identity injection; and changed stored-order ownership.
The configuration tests cover both independent switches and validated fixed return
origins. No tests call Square. Auth/Firestore integration uses only fixed loopback
`demo-fawcett-dev` emulators with fictional records.

`npm run lint` exited 0: no errors, only the three pre-existing `app/page.js`
image warnings. `npm run build` exited 0 with optimized Next.js build and new admin
API/static return route. `git diff --check` passed. Expected toolchain logging
includes mixed-module warnings, CLI remote-config warnings, emulator notices and
metadata lookup 403 warnings; these did not fail the checks.

No browser visual acceptance or real Square/provider end-to-end exercise was
performed. The September #20 Sandbox report remains historical evidence, not proof
of this new studio flow against the provider. See [operating procedures and launch
gates](studio-client-payments.md). Existing legacy payments remain readable/editable
by admins; their creation form is replaced by the private studio workflow.

Checked-in Firestore rules, production operator factory, deployed settings and
original client/financial records are unchanged. The pre-existing untracked
`CLAUDE.md` is outside this change. Neither payment switch nor email delivery was
activated. No merge, production access, migration, deployment or real email occurred.
