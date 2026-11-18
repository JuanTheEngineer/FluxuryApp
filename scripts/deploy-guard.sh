#!/bin/bash
#
# Refuses a deploy unless what's about to ship is exactly what's on origin/main.
# Run by deploy.sh before anything is built. Usage: deploy-guard.sh [repo-dir]
#
# Why: local files, git and the live site drifted apart before (2026-10-04:
# the live app was built from local files 12 commits behind origin), and a
# deploy from uncommitted code can't be reproduced or rolled back from git.
#
# Emergency override (prints a warning, still shows what's wrong):
#   FLUXURY_DEPLOY_UNSAFE=1 ./deploy.sh ...

set -u

REPO="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'

# Paths whose contents end up in a deploy. Untracked files elsewhere (notes,
# local tool settings) can't change what ships.
DEPLOYED_PATHS=(fluxury-app fluxury-infra/lib fluxury-infra/bin deploy.sh scripts)

problems=()
g() { git -C "$REPO" "$@"; }

branch="$(g rev-parse --abbrev-ref HEAD 2>/dev/null)"
[[ "$branch" == "main" ]] || problems+=("on branch '$branch', not main")

changed="$(g status --porcelain --untracked-files=no)"
[[ -z "$changed" ]] || problems+=("uncommitted changes:
$(echo "$changed" | sed 's/^/      /')")

untracked="$(g ls-files --others --exclude-standard -- "${DEPLOYED_PATHS[@]}")"
[[ -z "$untracked" ]] || problems+=("untracked files that would be deployed:
$(echo "$untracked" | sed 's/^/      /')")

# Mode-specific local env files override the committed .env.beta at build time.
[[ ! -e "$REPO/fluxury-app/.env.beta.local" ]] || problems+=("fluxury-app/.env.beta.local exists and would override the committed .env.beta")

if g fetch --quiet origin main 2>/dev/null; then
  ahead="$(g rev-list --count origin/main..HEAD 2>/dev/null || echo '?')"
  behind="$(g rev-list --count HEAD..origin/main 2>/dev/null || echo '?')"
  [[ "$ahead" == "0" ]] || problems+=("$ahead commit(s) not pushed: run git push origin main")
  [[ "$behind" == "0" ]] || problems+=("$behind commit(s) on origin/main you don't have: run git pull")
else
  problems+=("couldn't reach origin to check what's pushed")
fi

sha="$(g rev-parse --short HEAD 2>/dev/null)"

if [[ ${#problems[@]} -eq 0 ]]; then
  echo -e "${GREEN}✓ Deploy guard: shipping ${sha} (= origin/main, clean tree)${NC}"
  exit 0
fi

echo -e "${RED}✗ Deploy guard: refusing to deploy ${sha}:${NC}"
for p in "${problems[@]}"; do echo -e "  - $p"; done

if [[ "${FLUXURY_DEPLOY_UNSAFE:-}" == "1" ]]; then
  echo -e "${YELLOW}⚠ FLUXURY_DEPLOY_UNSAFE=1: deploying anyway. The live site won't match git.${NC}"
  exit 0
fi
echo "  (Emergency only: FLUXURY_DEPLOY_UNSAFE=1 ./deploy.sh ...)"
exit 1
