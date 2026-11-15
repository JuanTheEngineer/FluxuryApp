#!/bin/bash
#
# Post-deploy smoke check for the live Fluxury beta.
# Read-only: sends only OPTIONS preflights and GETs, needs no AWS credentials or login.
#
# Usage:  ./scripts/verify-deployment.sh
# Exit code 0 = all checks passed, 1 = at least one failed.
#
# Why: on 2026-11-14 the files bucket's CORS rule only allowed GET from
# juantheengineer.com, so the browser's PUT of lyrics was blocked and
# nothing ever saved. Unit tests can't see CORS; only a real preflight can.

set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUTS="$ROOT_DIR/fluxury-infra/cdk-outputs-beta.json"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# Origins the app is served from. Keep in sync with
# fluxury-infra/lib/beta-stack.ts and fluxury-infra/test/beta-stack.cors.test.ts
APP_ORIGINS=(
  "https://www.fluxury.app"
  "https://fluxury.app"
  "https://dh6p364plnqad.cloudfront.net"
  "http://localhost:5173"
)

output() {
  python3 -c "import json,sys; print(json.load(open('$OUTPUTS'))['FluxuryBeta'][sys.argv[1]])" "$1" 2>/dev/null
}

if [[ ! -f "$OUTPUTS" ]]; then
  echo -e "${RED}Missing $OUTPUTS. Run ./deploy.sh infra once to generate it.${NC}"
  exit 1
fi

BUCKET="$(output S3BucketName)"
API_URL="$(output APIGatewayURL)"
API_URL="${API_URL%/}"
BUCKET_URL="https://${BUCKET}.s3.us-east-1.amazonaws.com"

FAILS=0
pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; FAILS=$((FAILS + 1)); }

# preflight <url> <origin> <method> -> prints response headers (lowercased)
preflight() {
  curl -s -o /dev/null -D - -X OPTIONS "$1" \
    -H "Origin: $2" \
    -H "Access-Control-Request-Method: $3" \
    -H "Access-Control-Request-Headers: content-type" \
    --max-time 10 | tr -d '\r' | tr '[:upper:]' '[:lower:]'
}

check_preflight() { # <label> <url> <origin> <method>
  local headers allow_origin allow_methods origin_lc
  headers="$(preflight "$2" "$3" "$4")"
  origin_lc="$(echo "$3" | tr '[:upper:]' '[:lower:]')"
  allow_origin="$(echo "$headers" | sed -n 's/^access-control-allow-origin: //p')"
  allow_methods="$(echo "$headers" | sed -n 's/^access-control-allow-methods: //p')"
  if [[ "$allow_origin" != "$origin_lc" && "$allow_origin" != "*" ]]; then
    fail "$1: $4 from $3 blocked (allow-origin: '${allow_origin:-none}')"
  elif [[ "$allow_methods" != *"$(echo "$4" | tr '[:upper:]' '[:lower:]')"* ]]; then
    fail "$1: $4 from $3 not in allow-methods ('${allow_methods:-none}')"
  else
    pass "$1: $4 from $3"
  fi
}

echo -e "${YELLOW}Verifying Fluxury beta deployment${NC}"
echo "  bucket: $BUCKET"
echo "  api:    $API_URL"
echo ""

echo "S3 files bucket CORS (lyrics save + load):"
for origin in "${APP_ORIGINS[@]}"; do
  check_preflight "S3" "$BUCKET_URL/sessions/verify/script.json" "$origin" "PUT"
  check_preflight "S3" "$BUCKET_URL/sessions/verify/script.json" "$origin" "GET"
done
echo ""

echo "API Gateway CORS (sessions):"
check_preflight "API" "$API_URL/sessions/verify" "https://www.fluxury.app" "PUT"
echo ""

echo "Frontend reachable:"
for url in "https://www.fluxury.app" "$(output CloudFrontURL)"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url")"
  if [[ "$code" == "200" ]]; then pass "$url ($code)"; else fail "$url returned $code"; fi
done
echo ""

if [[ $FAILS -eq 0 ]]; then
  echo -e "${GREEN}All checks passed.${NC}"
  exit 0
else
  echo -e "${RED}$FAILS check(s) failed.${NC}"
  exit 1
fi
