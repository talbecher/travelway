Plan: Rebuild and redeploy the preview without code changes

1. Verify current project state
   - Confirm no pending edits are needed and the codebase is in the state from the last successful build attempt.
   - Check that the previous failure was only the S3 `ServiceUnavailable` upload step, not a TypeScript/build error.

2. Trigger a fresh rebuild
   - Restart the Vite dev server / preview build pipeline to force a new artifact upload.
   - No source files will be modified.

3. Validate the new preview
   - Wait for the build+upload to complete.
   - Confirm the preview URL serves the updated version (map split view, draggable divider, day map, recs map, coordinate parsing, etc.).

4. If the S3 error recurs
   - Report back immediately.
   - Recommend waiting or escalating as a Lovable infrastructure issue rather than changing project code.

No code changes are part of this plan.