# /implement — Execute a saved plan from .claude/plans/

Read a plan file produced by `/plan` and implement it step by step. After implementation, run verification but do NOT commit or push (use `/ship` for that).

## Input

- `#<number>` — looks for `.claude/plans/issue-<number>.md`
- `<filename>` — looks for `.claude/plans/<filename>.md`
- No argument — lists available plans in `.claude/plans/` and asks which one to implement

## Steps

1. **Load the plan**
   - Read the plan file from `.claude/plans/`
   - If the file doesn't exist, list available plans and ask the user which one

2. **Implement each step** in the order listed in the plan
   - Before each step, briefly explain what you're about to do (per CLAUDE.md tutor instructions)
   - After each step, confirm what was done in plain language
   - If a step is unclear or something unexpected comes up, ask the user before proceeding

3. **Run verification** from the plan's Verification section
   - Always run `npx tsc --noEmit` — fix any errors before proceeding
   - List the visual test steps for the user to verify manually

4. **Summarize** what was implemented:
   - Files modified/created with a brief description of each change
   - Any deviations from the plan and why
   - Remind the user to run `/ship` when they're satisfied

## Rules

- Follow the plan as written — do not add features, refactor, or "improve" beyond what the plan specifies
- If the plan references patterns from CLAUDE.md, follow them exactly
- If you discover the plan has a gap or error, stop and ask the user rather than improvising
- Do NOT commit, push, or close issues — that's `/ship`'s job
- Do NOT start planning the next feature — stay focused on this implementation
