# /plan — Design an implementation plan and save it to a file

Given a GitHub issue number (e.g., `/plan #45`) or a feature description, produce a complete implementation plan and save it to `.claude/plans/` for a future `/implement` session.

## Input

- `#<number>` — fetch the GitHub issue with `gh issue view <number>`
- Free text — treat as a feature description

## Steps

1. **Gather context**
   - If an issue number is provided, fetch it with `gh issue view <number>` to get the full description
   - Read CLAUDE.md session logs to identify established patterns relevant to this feature
   - Identify any related ADR documents or prior work

2. **Explore the codebase**
   - Use Glob, Grep, and Read to understand every file that will be affected
   - Identify existing patterns to follow (check session logs)
   - Identify shared code that can be reused or extracted
   - Check installed dependencies — prefer zero new ones

3. **Design the approach**
   - If there are multiple valid approaches (different UI layouts, data structures, patterns), present 2-4 options using AskUserQuestion with pros/cons and a recommendation
   - After the user chooses (or if there's only one clear approach), write the full plan

4. **Save the plan** to `.claude/plans/issue-<number>.md` (or `.claude/plans/<slug>.md` if no issue number) with this structure:

```markdown
# Plan: <title> (#<issue>)

## Context
What exists today and why we're changing it (1-2 sentences).

## Approach
The strategy in plain language — what pattern we're following and why.

## Steps

### 1. <Step title>
**File:** `path/to/file.ts`
- What to change and why
- Specific details (new imports, function signatures, etc.)

### 2. <Step title>
...

## Files changed
| File | Change |
|---|---|
| `path/to/file.ts` | Description of change |

## Verification
1. `npx tsc --noEmit` — zero errors
2. Visual test steps (what to click, what to see)
3. Edge cases to check
```

5. **Confirm** — Tell the user the plan is saved and they can run `/implement` to execute it

## Rules

- Follow established patterns from CLAUDE.md session logs
- Prefer editing existing files over creating new ones
- Prefer extracting shared code over duplicating
- Prefer zero new dependencies
- If more than 8-10 files, suggest splitting into smaller deliverables
- The plan must be specific enough to implement without asking questions
- Explain the "why" behind decisions, not just the "what"
- UI text in Portuguese (pt-BR), code/comments in English
- Do NOT write any code — only produce the plan
