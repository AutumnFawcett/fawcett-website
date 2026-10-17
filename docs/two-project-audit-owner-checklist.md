# Owner checklist — two-project read-only audit

**Do not run until the code and this read-only operation have separate approval.**
Neither project is an approved migration destination. No credentials or real records
belong in Codex. This is not a deployment or migration procedure.

1. **Approve the exact commit and scope.** Owner + independent reviewer record both
   identities: `fawcett-website` / `723963949221` and `fawcett-website-sandbox` /
   `625305990122`, each `(default)`, `nam5`. Confirm the default Auth-store scope:
   tenant-scoped/unknown user stores require a reviewed extension before running.
   Keep the existing website untouched.
2. **Approve the existing human identity.** In an authorized Google Cloud Shell,
   use an existing active read-only user. The IAM reviewer must check effective
   permissions on both projects, including inherited/conditional grants. Owner,
   Editor, service-account and impersonated credentials are unsuitable. The tool
   rejects known write privileges but cannot prove the entire IAM policy is safe.
   Do not grant roles, enable APIs, change projects, log in or create keys as part
   of this command. Stop for separate access preparation if prerequisites are missing.
3. **Use a trusted session and reviewed source.** Check out the approved commit;
   use Node 22+. No npm install is needed. Do not use shell/HTTP/Node debugging,
   credential overrides or copied exports. Do not forge Cloud Shell environment
   markers or remove guards to bypass a refusal.
4. **Run once to a new private artifact:**

   ```sh
   umask 077
   audit_directory="$(mktemp -d)"
   node audit/cli.mjs --iam-reviewed-read-only --output "$audit_directory/aggregate.json"
   ```

   The command verifies both project numbers/databases and permissions before data
   reads, emits no client details to console, and creates a mode-0600 report.
5. **Stop on failure.** Nonzero exit, `scanComplete:false`, empty/invalid output,
   unknown namespaces, permission errors, changed scans or interrupted pagination
   are not a usable inventory. Rerun only after diagnosis under the protected
   [owner-only review procedure](two-project-read-only-audit.md#protected-owner-only-follow-up-and-in-place-decision-gates).
   Do not weaken permissions checks, edit the mask or dump failing records.
6. **Review successful aggregates privately.** Compare each project's counts with
   the owner's earlier baseline; explain deltas and every ownership/payment/link
   exception. Matching UIDs/emails/provider references are potential collisions,
   never identical ownership or confirmed payment. All projections still need
   human content review. `upgradeApproved` always remains false.
7. **Keep the next gate separate.** Confirm deployed Auth/Admin/Storage bindings,
   both projects' backup integrity and independent Auth/Storage/config recovery;
   resolve collisions and writers before choosing an in-place or cross-project
   strategy. Preserve both datasets. Any production migration, settings/rules/app
   change, payment/email activation or operator unlocking needs separate approval.

Keep real reports and detailed follow-up in restricted owner evidence storage,
not GitHub/chat/Codex. See the [technical contract and limitations](two-project-read-only-audit.md)
and [fictional example](examples/two-project-audit-fictional.json).
