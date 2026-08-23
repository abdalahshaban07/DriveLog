#!/usr/bin/env bash
# DriveLog PRs must run as the personal GitHub owner (not the company CLI account).
set -euo pipefail

PERSONAL=abdalahshaban07
COMPANY=abdullah-shaaban-se
REPO=abdalahshaban07/DriveLog

if ! command -v gh >/dev/null; then
  echo "gh CLI not found" >&2
  exit 1
fi

if ! gh auth status -h github.com 2>&1 | grep -q "account ${PERSONAL}"; then
  echo "Personal account ${PERSONAL} is not logged into gh." >&2
  echo "Run once:  gh auth login -h github.com -p https -w" >&2
  echo "Log in as ${PERSONAL}, then re-run this script." >&2
  exit 1
fi

prev=$(gh api user --jq .login 2>/dev/null || true)
gh auth switch -u "$PERSONAL" >/dev/null
trap 'gh auth switch -u "${prev:-$COMPANY}" >/dev/null 2>&1 || true' EXIT

who=$(gh api user --jq .login)
if [[ "$who" != "$PERSONAL" ]]; then
  echo "Expected active user ${PERSONAL}, got ${who}" >&2
  exit 1
fi

cmd=${1:-}
shift || true

case "$cmd" in
  create)
    gh pr create --repo "$REPO" "$@"
    ;;
  merge)
    gh pr merge --repo "$REPO" "$@"
    ;;
  switch)
    # Leave personal active (trap skipped for explicit switch)
    trap - EXIT
    echo "Active GitHub CLI user: $(gh api user --jq .login)"
    ;;
  status)
    gh auth status -h github.com
    gh api user --jq '{login:.login}'
    ;;
  *)
    echo "Usage: $0 {create|merge|switch|status} [gh args...]" >&2
    echo "  create  → gh pr create as ${PERSONAL}" >&2
    echo "  merge   → gh pr merge as ${PERSONAL}" >&2
    echo "  switch  → leave CLI on ${PERSONAL}" >&2
    echo "  status  → show accounts + active login" >&2
    exit 1
    ;;
esac
