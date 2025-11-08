## Implementation Tasks
- [x] Audit the current GitHub export destination picker and identify where folder lists are populated and validated.
- [x] Refactor the UI so the path text field handles both new and existing folder selections, and remove the broken "Create new folder" modal button.
- [x] Extend plugin-side export logic to create missing folder segments within the target branch before uploading token files.
- [x] Handle error cases where the desired path collides with an existing file or cannot be created, surfacing clear UI feedback.
- [x] Ensure commit payloads still bundle token files deterministically and cover new folders in the tree update.
- [x] Run `npm run typecheck` and document manual verification steps for exporting to both existing and new folders.
