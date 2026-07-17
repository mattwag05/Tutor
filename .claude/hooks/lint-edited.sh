#!/usr/bin/env bash
# Claude Code PostToolUse nudge on Edit|Write|MultiEdit — lints/typechecks the edited file so issues
# surface at edit time instead of on push. NON-BLOCKING: always exits 0, findings go to stderr.
# Repo-agnostic: copy into <repo>/.claude/hooks/ and wire it in .claude/settings.json. Requires jq.
#
# Language detection walks up from the edited file to the nearest project root, so it works in flat
# repos and monorepos alike (per-package venvs / package.json are picked up automatically).
set -eu

payload="$(cat)"
file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')"
[ -n "$file" ] && [ -f "$file" ] || exit 0

# Walk up from $1 looking for the nearest dir containing marker file $2; echo it, or nothing.
nearest() {
  d="$(cd "$(dirname "$1")" && pwd)"
  while [ -n "$d" ] && [ "$d" != "/" ]; do
    [ -e "$d/$2" ] && { printf '%s' "$d"; return 0; }
    d="$(dirname "$d")"
  done
  return 1
}

case "$file" in
  *.py)
    # Prefer the owning project's venv ruff (Homebrew python is externally managed), else ruff on PATH.
    proj="$(nearest "$file" pyproject.toml || true)"
    if [ -n "${proj:-}" ] && [ -x "$proj/.venv/bin/ruff" ]; then
      "$proj/.venv/bin/ruff" check "$file" >&2 2>&1 || true
    elif command -v ruff >/dev/null 2>&1; then
      ruff check "$file" >&2 2>&1 || true
    fi
    ;;
  *.ts|*.tsx)
    # tsc needs the project, not one file — run the nearest package's `typecheck` script if it has one.
    pkg="$(nearest "$file" package.json || true)"
    if [ -n "${pkg:-}" ] && grep -q '"typecheck"' "$pkg/package.json" 2>/dev/null; then
      npm --prefix "$pkg" run --silent typecheck >&2 2>&1 || true
    fi
    ;;
esac
exit 0
