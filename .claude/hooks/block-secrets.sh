#!/usr/bin/env bash
# Claude Code PreToolUse guard on Edit|Write|MultiEdit — blocks writing secret/PII-shaped literals
# into source (even fake ones). Catches at EDIT time what the global git pre-commit hook
# (~/.config/git/hooks/pre-commit) catches at COMMIT time — same patterns, earlier feedback.
# Repo-agnostic: copy verbatim into <repo>/.claude/hooks/ and wire it in .claude/settings.json.
#
# Blocks by exiting 2 with the reason on stderr (Claude reads it). Reads the hook payload JSON on stdin.
# Requires jq.
set -eu

payload="$(cat)"
text="$(printf '%s' "$payload" | jq -r '
  [ .tool_input.new_string?, .tool_input.content?,
    ( .tool_input.edits?[]?.new_string ) ] | map(select(. != null)) | join("\n")
')"
[ -n "$text" ] || exit 0

hit=""
check() {  # $1=label  $2=ERE
  if printf '%s\n' "$text" | grep -IniqE -e "$2"; then hit="${hit:+$hit; }$1"; fi
}
# Keep in sync with ~/.config/git/hooks/pre-commit. pragma tags keep this file itself committable.
check "private key block"         '-----BEGIN[A-Z ]*PRIVATE KEY-----'                                        # pragma: allowlist secret
check "AWS access key id"         'AKIA[0-9A-Z]{16}'                                                          # pragma: allowlist secret
check "GitHub token"              'gh[pousr]_[0-9A-Za-z]{36,}'                                                # pragma: allowlist secret
check "Slack token"               'xox[baprs]-[0-9A-Za-z-]{10,}'                                              # pragma: allowlist secret
check "Google API key"            'AIza[0-9A-Za-z_-]{35}'                                                     # pragma: allowlist secret
check "generic secret assignment" '(password|passwd|secret|token|api[_-]?key|apikey|access[_-]?token|client[_-]?secret)["'\'' ]*[:=][ ]*["'\''][^"'\'' ]{8,}'  # pragma: allowlist secret
check "US SSN (PII)"              '[0-9]{3}-[0-9]{2}-[0-9]{4}'                                                 # pragma: allowlist secret

if [ -n "$hit" ]; then
  printf 'Blocked: secret/PII-shaped literal in this edit (%s).\n' "$hit" >&2
  printf 'No hardcoded secrets, even fake ones — assemble PII fixtures from parts, e.g.\n' >&2
  printf '  ssn = "-".join(("123", "45", "6789"))\nso no contiguous literal lives in source.\n' >&2
  exit 2
fi
exit 0
