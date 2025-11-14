## Implementation Tasks
- [ ] Audit the current GitHub repository fetcher to confirm which REST endpoints/affiliation filters it uses and document the missing organization repos.
- [ ] Update the API integration to request repositories with `affiliation=owner,collaborator,organization_member` (and follow pagination) so organization repos flow into the plugin state.
- [ ] Extend the repository picker data structures + UI so each entry tracks the owner name and renders as `owner/repo`, maintaining sorting + selection behaviors.
- [ ] Verify that downstream flows (branch listing, folder picker, import/export actions) work when an organization repo is active, adding defensive error handling when scopes are insufficient.
- [ ] Add user-facing messaging when org repos cannot be loaded due to missing scopes or API errors so users know how to recover.
- [ ] Detect GitHub `saml_required` / `sso_required` responses and explain how users can authorize their personal access token for that organization before retrying repo loads.
- [ ] Run `npm run typecheck` and document manual validation that shows both personal and organization repos across import/export flows.
