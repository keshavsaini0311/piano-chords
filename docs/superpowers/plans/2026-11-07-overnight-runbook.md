# Overnight run: the five roadmap features

> **For agentic workers:** this is the entry point. Read it fully, then execute the plans below in
> order with superpowers:subagent-driven-development (or superpowers:executing-plans). Each plan
> has its own tasks with checkbox steps. Do not ask questions: every decision is made in the
> plans, the spec, and this file. When something truly blocks, follow **§5 Stop and skip rules**.

**Spec:** [docs/ROADMAP-DESIGN.md](../../ROADMAP-DESIGN.md) (decided 7 Nov 2026).
**How the app works today:** [docs/ARCHITECTURE.md](../../ARCHITECTURE.md) · rules: [CLAUDE.md](../../../CLAUDE.md) ·
looks and copy: [docs/DESIGN-SYSTEM.md](../../DESIGN-SYSTEM.md).
**Proven reference code for the two models:** [spikes/](spikes/) (ran on this Mac on 7 Nov 2026).

## 1. Order

| # | Plan | Depends on | Size |
|---|---|---|---|
| 1 | [Wait-for-me](2026-11-07-1-wait-for-me.md) | nothing | 3 tasks |
| 2 | [Section loops](2026-11-07-2-section-loops.md) | nothing | 2 tasks |
| 3 | [Chord mastery](2026-11-07-3-chord-mastery.md) | nothing | 2 tasks |
| 4 | [Stems](2026-11-07-4-stems.md) | nothing | 3 tasks |
| 5 | [Word-level lyric timing](2026-11-07-5-word-timing.md) | plan 4, tasks 1–2 (`update_song`, `after_import`, `run_later`, backfill script) | 3 tasks |

**Minimum change is a requirement, not a style.** Each plan names exactly the files to touch. Don't
add modules, abstractions, options or refactors beyond what a task names; if a task seems to need
more, re-read the plan's Architecture line before writing anything extra.

Plans 1–3 are browser-only. Plans 4–5 touch the server.

## 2. Global constraints (every task in every plan)

- Everything in `CLAUDE.md` applies: layers, original-key storage, pure edits, wire format, TDD,
  no real lyrics in fixtures, conventional commits, one task per commit.
- **Design:** use the tokens and components in `docs/DESIGN-SYSTEM.md`. A new colour is a new token
  in **both** the light and dark blocks of `web/src/theme.css`; no raw hex in `app.css`. Every
  animation gets a `prefers-reduced-motion` override. Toggles use `aria-pressed`; live status uses
  `aria-live="polite"`. Every new shortcut is registered in `features/studio/useShortcuts.ts` and
  shown in its control's `title`.
- **Copy:** plain words, sentence case, second person. Use the exact strings the plans give.
- **New dependencies, exactly these and nothing else:** server `demucs==4.1.0` (plan 4),
  `ctc-forced-aligner==1.0.2` and `unidecode>=1.3` (plan 5). Never `torchaudio`. No new web dependencies.
- **Models are already on disk; don't move them:** Demucs `htdemucs` in `~/.cache/huggingface`,
  aligner at `~/.cache/piano-chords/ctc-aligner.onnx`.
- **Never write to `server/data/`.** Real-audio smoke checks copy one song folder into
  `PC_DATA_DIR=$(mktemp -d)`. **Any `npm run dev` check runs with `PC_DATA_DIR=<temp copy>`**
  (copy 1–2 song folders and `settings.json` in), because the app autosaves edits.
- **Never push, open PRs, merge to `main`, or rewrite history.** Work only on the branch from §3.
- Server code that imports `demucs`, `torch` or `ctc_forced_aligner` imports them **inside the
  function that needs them**, so `create_app` and the test suite stay fast and model-free.

## 3. Preflight (do once, before plan 1)

- [ ] **Branch.** `main` is missing PR #4 (practice scoring, beat fix), which sits on
  `origin/chore/root-dev-script`. Start from both:

```bash
git fetch origin
git checkout -b overnight/roadmap origin/main
git merge --no-edit origin/chore/root-dev-script
git merge-base --is-ancestor 1deccd3 HEAD && echo "has PR #4"
```
Expected: `has PR #4`. (If `main` already contains `1deccd3`, the merge is a no-op.)

- [ ] **Bring in the planning files** (they were written on `main`'s working tree and may be
  uncommitted there): `CLAUDE.md`, `TODO.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN-SYSTEM.md`,
  `docs/ROADMAP-DESIGN.md`, `docs/superpowers/plans/2026-11-07-*`, `docs/superpowers/plans/spikes/`.
  If `git status` shows them untracked, they came along with the checkout. Commit them:

```bash
printf '.DS_Store\n' >> .gitignore
git add .gitignore CLAUDE.md TODO.md docs/ARCHITECTURE.md docs/DESIGN-SYSTEM.md docs/ROADMAP-DESIGN.md docs/superpowers/plans
git commit -m "docs: architecture, design system, agent guide and overnight plans"
```

- [ ] **One command that checks everything.** Add to the root `package.json` `scripts`:

```json
"check": "npm --prefix web test && npm --prefix web run lint && npm --prefix web run build && cd server && uv run pytest -q"
```
Run `npm install && npm --prefix web install && (cd server && uv sync)`, then `npm run check`.
Expected: web tests pass (92 or more), lint has no errors, build succeeds, server tests pass (59 or more).
Commit: `chore: npm run check runs every test, lint and build`.

## 4. Per-task loop

1. Read the task, its **Interfaces** block, and the spec section the plan points to.
2. Follow the steps exactly: failing test → see it fail → code → see it pass.
3. Run the task's verification, then `npm run check`. Both must pass before committing.
4. Commit with the message the task gives.
5. Tick the step boxes in the plan file and include that change in the commit.

At the end of each plan: update `docs/ARCHITECTURE.md` (the plan's last task says what), tick the
item in `TODO.md` ("✅ done on overnight/roadmap"), commit.

## 5. Stop and skip rules

- A task fails its verification after **3 honest attempts**: `git restore` / `git clean` that
  task's uncommitted changes, write down what failed (command, output tail, your best guess) in
  the report, and **skip the rest of that plan**. Move to the next plan (plan 5 is skipped too if
  plan 4's Tasks 1–2 didn't land; plan 5's Task 1 is browser-only and may still be done).
- `npm run check` breaks in code you didn't touch: fix only if the cause is clearly your change;
  otherwise stop that plan and report.
- Never weaken or delete an existing test to get green. Never mark a step done that you didn't run.
- Network or model download needed unexpectedly: don't work around it; report it and skip that task.

## 6. Morning report

Write `docs/superpowers/plans/2026-11-07-overnight-report.md` and commit it last:

```markdown
# Overnight report (overnight/roadmap)
| Plan | Status | Commits | Notes |
| 1 Wait-for-me | done / partial (task N) / skipped | <short shas> | … |
…
## Checks
- npm run check: <pass/fail>, web <n> tests, server <n> tests
- Real-audio smoke checks: stems <result>, alignment <result> (from plans 4 and 5)
## Needs a human
- <each "by eye / by ear" check listed in the plans' Review Focus and final tasks>
## Skipped or failed
- <task, command, output tail, guess>
```

## 7. Prompt for the overnight session

> Execute `docs/superpowers/plans/2026-11-07-overnight-runbook.md` from §3 to §6 without asking
> questions. Use superpowers:subagent-driven-development for the five plans in order. Follow the
> stop and skip rules. Finish by committing the morning report.
