# /ship - Post-implementation shipping workflow
1. Run `npx tsc --noEmit` to verify zero TypeScript errors
2. Kill any dev server on port 3000, restart with `npm run dev`, verify no runtime errors
3. Stage all changes and create a conventional commit with descriptive message
4. Push to the current branch
5. Update relevant docs (CLAUDE.md project status, changelog)
6. Close the related GitHub issue with a summary comment
7. Ask user if they want to begin planning the next ADR
