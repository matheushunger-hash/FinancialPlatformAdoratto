# /ship — Post-implementation shipping workflow

Ship the current implementation: type-check, commit, push, update docs, close the issue.

## Input

- `#<number>` — the GitHub issue number to close (optional, will ask if not provided)

## Steps

1. Run `npx tsc --noEmit` to verify zero TypeScript errors
2. Run `git status` and `git diff` to review all changes
3. Stage relevant files and create a conventional commit (`feat:`, `fix:`, `docs:`, `chore:`) with a descriptive message referencing the issue number
4. Push to the current branch
5. If on a feature branch, create a PR targeting `main`. If on `main`, push directly
6. Update CLAUDE.md session log with a new entry covering:
   - What went well
   - Mistakes caught (if any)
   - Patterns established
7. Commit and push the CLAUDE.md update (`docs: add session log — <description>`)
8. Close the related GitHub issue with a summary comment
9. If a plan file exists in `.claude/plans/` for this issue, ask the user if they want to keep or delete it
10. Do NOT start planning the next feature — just confirm completion
