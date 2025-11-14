## ADDED Requirements
### Requirement: Organization repositories remain available for GitHub imports
The GitHub import controls MUST rely on the same repository picker used by exports and therefore MUST expose all repositories the authenticated token can reach, including organization-owned repos. Selecting an organization repo MUST allow users to specify branches and token file paths exactly as they would for personal repos, with the UI keeping the owner/repo label visible throughout the import status messaging.

#### Scenario: Importing from an organization repository
- **GIVEN** a user belongs to the `design-systems` organization and has access to `design-systems/tokens`
- **WHEN** they select `design-systems/tokens` plus a branch and file path on the GitHub tab
- **THEN** the Import action fetches that repository's file content and applies the DTCG validation/import process without additional auth prompts

#### Scenario: Organization repositories unavailable due to token scopes
- **GIVEN** the plugin receives a `403` when attempting to list organization repositories with the current token
- **WHEN** the user opens the import controls
- **THEN** the UI informs them that organization repositories could not be loaded and instructs them to update the token scopes before attempting another import

#### Scenario: SSO authorization required before importing
- **GIVEN** GitHub responds with `saml_required` because the selected organization enforces SSO for API access
- **WHEN** the user attempts to list repositories for import
- **THEN** the UI surfaces guidance explaining that they must authorize their personal access token through the organization's SSO settings before imports can proceed
