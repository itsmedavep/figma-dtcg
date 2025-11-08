## Implementation Tasks
- [ ] Audit the current GitHub export destination picker and identify where folder lists are populated and validated.
- [ ] Refactor the UI so the path text field handles both new and existing folder selections, and remove the broken "Create new folder" modal button.
- [ ] Extend plugin-side export logic to create missing folder segments within the target branch before uploading token files.
- [ ] Handle error cases where the desired path collides with an existing file or cannot be created, surfacing clear UI feedback.
- [ ] Ensure commit payloads still bundle token files deterministically and cover new folders in the tree update.
- [ ] Run `npm run typecheck` and document manual verification steps for exporting to both existing and new folders.
