## Implementation Tasks

-   [x] Audit the GitHub tab export UI and locate where the export path and commit message inputs are handled.
-   [x] Add a filename input control that mirrors existing styling, wiring it into the plugin message payload.
-   [x] Update plugin-side export logic to honor the provided filename when preparing file trees and commit payloads.
-   [x] Validate filenames for illegal characters or conflicting extensions, surfacing inline errors before running the export.
-   [x] Adjust the export summary so it shows the final folder and filename that will be written to the branch.
-   [x] Run `npm run typecheck` and document manual verification covering exports with default and custom filenames.
