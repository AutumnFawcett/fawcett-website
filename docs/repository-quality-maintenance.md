# Repository baseline quality

This maintenance increment starts from `main` at
`ac6420e8e58dcd7e907f120936e63ef5167d8d1e`, independently of financial PRs #59–70.
It corrects the search-test expectation for existing substring autocomplete and
escapes a JSX apostrophe without changing rendered copy or payment behavior.

## Universal pull-request check

`.github/workflows/repository-quality.yml` runs for pull requests targeting `main`,
including drafts, without changed-path filters or conditional job skips. The
stable job/check name is `repository-quality` in workflow `Repository quality`.
It uses Node 22, npm caching and `npm ci`, followed by full `npm test`, repository
`npm run lint` and `npm run build`. Build Firebase configuration is explicitly
synthetic and public. No Firebase/Square credentials, Production secrets, cloud
writes, deployments or repository-settings changes are part of this workflow.
The checkout token has contents-read permission and is not persisted to git.

The existing financial emulator workflow is outside this main-based change and
is not modified or copied from the feature stack. Its intentionally scoped checks
remain a separate integration requirement. Registering this new check as required
is a future owner-controlled repository-settings action; this PR does not do it.

## Deferred homepage image warnings

Repository lint intentionally continues to report these three existing
`@next/next/no-img-element` warnings in `app/page.js`:

| Existing line | Image | Deferred assessment |
| --- | --- | --- |
| 187 | Studio hero (`/hero-studio.jpg`) | Review dimensions, responsive sizing and LCP before considering Next Image. |
| 252 | Artist cards (`artist.image`) | Preserve card crops/heights and evaluate source dimensions. |
| 308 | Gallery (`item.image`) | Preserve featured-grid sizes, object-cover crops and hover behavior. |

These performance warnings are not lint errors. They remain visible; no ESLint
rule is disabled, no warnings-as-errors threshold is introduced, and homepage
markup/design is unchanged. Any conversion needs a separately scoped visual and
performance review rather than broadening this baseline maintenance task.

## Verification

```
node --test tests/studio-schedule/clientSearch.test.mjs
npm test
npm run lint
npm run build
```

Build locally with the same synthetic public Firebase configuration listed in the
workflow. Do not pull Production secrets to perform this check. Search coverage
continues to include case folding, accents, email, phone, stable keys, result
limits and empty-search protection. The search implementation is unchanged.
