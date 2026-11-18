#!/bin/bash
#
# Tests for deploy-guard.sh against throwaway git repos (never the real one).
# Run: ./scripts/test-deploy-guard.sh

set -u
GUARD="$(cd "$(dirname "$0")" && pwd)/deploy-guard.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0; fail=0

# A fresh clone of a bare "origin", in sync on main, with the deployed folders.
fresh_repo() {
  rm -rf "$WORK/origin.git" "$WORK/repo"
  git init --quiet --bare --initial-branch=main "$WORK/origin.git"
  git clone --quiet "$WORK/origin.git" "$WORK/repo" 2>/dev/null
  cd "$WORK/repo" || exit 1
  git config user.email t@t && git config user.name t
  mkdir -p fluxury-app/src fluxury-infra/lib scripts
  echo a > fluxury-app/src/app.ts && echo b > fluxury-infra/lib/stack.ts && echo c > deploy.sh
  echo '.env.local' > fluxury-app/.gitignore
  git add -A && git commit --quiet -m init && git push --quiet origin main 2>/dev/null
}

expect() { # <name> <0|1 expected exit> [grep pattern in output]
  local name="$1" want="$2" pattern="${3:-}" out code
  out="$("$GUARD" "$WORK/repo" 2>&1)"; code=$?
  if [[ "$code" == "$want" ]] && { [[ -z "$pattern" ]] || grep -q -- "$pattern" <<<"$out"; }; then
    echo "  ✓ $name"; pass=$((pass + 1))
  else
    echo "  ✗ $name (exit $code, wanted $want${pattern:+, output containing '$pattern'})"; echo "$out" | sed 's/^/      /'
    fail=$((fail + 1))
  fi
}

echo "deploy-guard.sh"

fresh_repo
expect "clean main = origin/main: allowed" 0 "shipping"

fresh_repo; echo changed >> fluxury-app/src/app.ts
expect "uncommitted change: refused" 1 "uncommitted changes"

fresh_repo; echo x > fluxury-app/src/new.ts; git add fluxury-app/src/new.ts
expect "staged but uncommitted file: refused" 1 "uncommitted changes"

fresh_repo; echo x > fluxury-app/src/forgotten.ts
expect "untracked file in a deployed folder: refused" 1 "fluxury-app/src/forgotten.ts"

fresh_repo; echo notes > NOTES.txt; echo x > fluxury-app/.env.local
expect "untracked notes / gitignored .env.local: allowed" 0 "shipping"

fresh_repo; echo y >> deploy.sh; git commit --quiet -am wip
expect "commit not pushed: refused" 1 "not pushed"

fresh_repo
git clone --quiet "$WORK/origin.git" "$WORK/other" 2>/dev/null
( cd "$WORK/other" && git config user.email t@t && git config user.name t && echo z >> deploy.sh && git commit --quiet -am other && git push --quiet origin main 2>/dev/null )
rm -rf "$WORK/other"
expect "origin has commits you don't: refused" 1 "git pull"

fresh_repo; git checkout --quiet -b feature
expect "not on main: refused" 1 "not main"

fresh_repo; echo VITE_DEMO_MODE=true > fluxury-app/.env.beta.local
expect ".env.beta.local overriding the beta config: refused" 1 ".env.beta.local"

fresh_repo; echo changed >> fluxury-app/src/app.ts
out="$(FLUXURY_DEPLOY_UNSAFE=1 "$GUARD" "$WORK/repo" 2>&1)"; code=$?
if [[ $code == 0 ]] && grep -q "deploying anyway" <<<"$out" && grep -q "uncommitted changes" <<<"$out"; then
  echo "  ✓ FLUXURY_DEPLOY_UNSAFE=1: allowed, with the warning and the problems shown"; pass=$((pass + 1))
else
  echo "  ✗ FLUXURY_DEPLOY_UNSAFE=1 (exit $code)"; fail=$((fail + 1))
fi

echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
