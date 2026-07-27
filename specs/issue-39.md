# Spec: strix.yml: fail soft when oMLX is unreachable instead of crashing the default branch (issue #39)

## Request
## Problem

`.forgejo/workflows/strix.yml` in this repo crashes the default branch when the oMLX
server is not answering. It should skip the scan and say so, not go red.

Verified 2026-07-27 (weekly SDLC health report). All three scheduled Strix scans
(agentic-crm, recall, Tutor) failed the same way:

```
LLM CONNECTION FAILED
Could not establish connection to the language model.
Error: Request timed out.
```
`⚙️ [runner]: RUN exit status 1` → job failed → default branch red.

Root cause: the requests never reached oMLX. The oMLX server log on the Mac
(`~/.omlx/logs/server.log`) has **zero entries between 00:46 and 08:28 local**, and
`pmset -g log` shows the host in a continuous battery Sleep/DarkWake cycle across that
window. This repo's cron is "0 10 * * 1"  (Mon 10:00 UTC = 06:00 ET) — inside it. Tailscale's TCPKeepAlive keeps the
node appearing reachable, so the connection is accepted and then nothing answers, which is
why it surfaces as a timeout rather than a refused connection.

**The crons are staying where they are** (deliberate — the 2026-07-23 stagger that placed
them overnight is what keeps concurrent scans off oMLX). So the practical effect of this
change is that a Monday scan will *skip* cleanly instead of crashing red. That is the
intent: an unreachable-LLM skip must be visible and distinguishable, not a red main that
looks like a code regression. Making it loud is the whole point of the change.

## Scope

Only two things. Do **not** touch the `schedule:` block.

### 1. Preflight reachability probe (fail soft)

Add a step immediately after `Guard — require LLM key` (before `Checkout`) that probes the
LLM endpoint and, when it does not answer, ends the job **without failing** and emits a
distinct alert.

- Probe `${{ vars.LLM_API_BASE }}/models` with `Authorization: Bearer ${{ secrets.STRIX_LLM_KEY }}`
  and a short `--max-time` (the existing `Reset LLM engine` step at line ~40 already uses
  `curl --max-time 30` against `vars.LLM_API_BASE` — reuse that shape).
- A `401` counts as **reachable** — oMLX answers `401 API key required` on
  `/v1/models` before auth is applied, and that response proves the host is awake. Treat
  connect-failure / empty response / timeout (curl exit non-zero, or HTTP `000`) as
  unreachable. Do not treat any answered HTTP status as unreachable.
- Forgejo Actions has no native "neutral" job result. Implement the skip by setting a step
  output (e.g. `llm_up=false`) and gating `Checkout`, `Reset LLM engine`, `Scan`, and the
  existing alert/summary steps on it with `if:`. The job must end **green**.
- Emit one ntfy message to `pironman-alerts` with wording clearly distinct from the two
  existing messages (`Strix crashed - <repo>` / `Strix findings - <repo>`) — e.g.
  `Strix skipped - matthewwagner/Tutor` with a body saying the LLM host was unreachable and the
  scan did not run. Reuse the ntfy invocation already in this workflow (same auth pattern,
  `NTFY_URL` var).

### 2. Verification

One green default-branch run via `workflow_dispatch` after the change.

## Acceptance criteria

- [ ] Preflight step present, runs before `Checkout`, and treats an answered `401` as reachable.
- [ ] When the endpoint does not answer: job ends **green**, `Scan` does not run, and a
      `Strix skipped` ntfy alert (distinct from `crashed`/`findings`) is published.
- [ ] When the endpoint answers: behavior is byte-for-byte unchanged — in particular the
      `rc != 2` crash path and the HIGH/CRITICAL severity gate from ROADMAP item 11 still work.
- [ ] `schedule:` block untouched.
- [ ] One green `workflow_dispatch` run on the default branch recorded on this issue.

## Notes for the implementer

- CI workflow templates in `shared-workflows` are **`scaffold`** mode in sync-manifest
  (copy-once) — editing the template does **not** propagate to this repo. Edit this repo's
  `.forgejo/workflows/strix.yml` directly. Sibling issues are filed on the other two repos.
- A bare `pull_request:` (null event body) makes the Forgejo parser silently skip the whole
  workflow. Every event key in `on:` must keep a body.
- Separate, already-tracked issue: scans that *do* reach oMLX can still die on the ~50.7 GB
  memory guard. Out of scope here — do not try to fix that in this change.


## Approved plan

🤖 **Proposed plan** (local model):


The issue is fully specified with explicit gate logic, step ordering, and acceptance criteria. Iris's round-1 answer locks in Option A (leave `Reset LLM engine` byte-for-byte unchanged, just gate it). No further questions.

**File:** `.forgejo/workflows/strix.yml` (edit directly — scaffold mode, no propagation)

**Approach — 3 structural changes:**

1. **Add a `Preflight — LLM reachability probe` step** immediately after `Guard — require LLM key`, before `Checkout`. Use `curl -s -o /dev/null -w %{http_code}` with `--max-time 10`, auth header `Bearer ${{ secrets.STRIX_LLM_KEY }}` against `${{ vars.LLM_API_BASE }}/models`. Any answered HTTP status (including 401) = reachable; curl non-zero exit or HTTP 000 = unreachable. Set step output `llm_up=true|false` accordingly.

2. **Gate downstream steps** with `if: steps.preflight.outputs.llm_up == 'true'` on: `Checkout`, `Reset LLM engine`, `Scan`, `Alert on findings`, `Alert on scan crash`, `Advisory PR comment on LOW/MEDIUM findings`. Add `&& steps.preflight.outputs.llm_up == 'true'` to the existing conditions on the alert steps. Leave `Free LLM engine after scan` (if: always()) untouched.

3. **Add a `Alert on LLM-unreachable skip` step** with `if: steps.preflight.outputs.llm_up == 'false'` between Preflight and the gated block. Reuse the existing ntfy invocation shape (auth + ntfy URL) with title `Strix skipped - ${{ github.repository }}`.

**Untouched:** `schedule:` block, `on:` event keys, any existing behavior when the LLM answers.

_Apply `agent:approved` to have me implement this, or refine the issue and re-apply `agent:ready`._
