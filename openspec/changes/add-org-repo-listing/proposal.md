## Change: add-org-repo-listing

## Why
The GitHub tab currently pulls only personal repositories from the authenticated account. Designers who rely on organization-owned repositories (the majority of our customers) cannot select those repos for import or export, forcing them to create forks under their personal namespace or move token files manually after every sync. This gap blocks teams that centralize design tokens inside organization repos and contradicts the promise that the plugin mirrors GitHub access.

## What Changes
- Extend the GitHub repository picker so it aggregates repositories the user can access across both personal and organization memberships.
- Surface organization context (e.g., `org/repo`) in the UI list so users can distinguish similarly named repos.
- Handle pagination + affiliation filters when calling the GitHub REST API so collaborator and organization member repos appear alongside personal ones.
- Detect when an organization enforces SSO on repositories and surface a targeted prompt instructing the user to authorize their token for that org before retrying.
- Ensure downstream flows (branch selection, folder picker, import/export actions) work seamlessly when an organization repo is selected.

## Success Criteria
- After authenticating, the repository dropdown shows organization-owned repositories for which the user has read/write access alongside personal repos.
- Selecting an organization repo enables both import and export flows without additional authentication steps.
- When an SSO-enforced organization blocks access, the UI relays a clear message explaining that the user must complete SSO authorization for their token before the repo list can load.
- If the token lacks scopes to read organization repos, the UI surfaces a descriptive error rather than silently omitting them.

## Non-Goals
- Changing how branches are listed or introducing repository search/filter UI beyond basic labeling.
- Managing GitHub organization memberships or approvals from within the plugin.
- Supporting GitHub Apps or enterprise SSO flows beyond the existing personal access token authentication.

## Risks & Mitigations
- **Large organization counts** could create performance issues → use pagination and incremental loading, and limit the UI to the first N results while enabling fetch-more behavior if needed.
- **Missing scopes** might still block certain repos → detect `403` responses and instruct users to update their personal access token scopes.
- **SSO enforcement** on certain organizations can produce `403` errors even with valid scopes → inspect the API error payload for `saml_required`/`sso_required` codes and guide users to authorize the token against that organization via GitHub settings.
- **Ambiguous repo names** when different organizations share the same repo name → display repositories as `owner/repo` to avoid confusion.
