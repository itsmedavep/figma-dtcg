## ADDED Requirements
### Requirement: Show organization repositories in the export picker
The GitHub export tab MUST populate its repository selector with every repository accessible to the authenticated user, including organization-owned repositories where the user is a member or collaborator. Entries MUST display as `owner/repo` (using the organization or user owner) so similarly named repositories remain distinguishable, and the selection MUST drive the existing branch + folder pickers without additional confirmation steps.

#### Scenario: Organization repository can be selected for export
- **GIVEN** a user authenticated with a token that can read an organization-owned repository such as `design-systems/tokens`
- **WHEN** they open the GitHub tab repository picker
- **THEN** `design-systems/tokens` appears alongside personal repositories and can be selected
- **AND** the branch/folder pickers refresh using that organization repository without extra setup

#### Scenario: Missing scopes surface actionable errors
- **GIVEN** a token lacks the scopes required to list organization repositories
- **WHEN** the picker load fails with a `403` from GitHub
- **THEN** the UI withholds organization repositories and surfaces an inline error explaining that updated organization read access is required before exporting

#### Scenario: SSO-enforced organization prompts for authorization
- **GIVEN** a repository belongs to an organization that enforces SSO for API access
- **WHEN** GitHub responds with `saml_required` (or equivalent) while loading repositories
- **THEN** the UI explains that the user must authorize their personal access token for that organization via GitHub SSO before the repository can be selected for export
