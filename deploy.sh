#!/bin/bash

# Fluxury Deploy Script
# Usage:
#   ./deploy.sh          — Deploy frontend only (most common)
#   ./deploy.sh backend  — Deploy backend Lambda code (hotswap)
#   ./deploy.sh all      — Deploy both backend + frontend
#   ./deploy.sh infra    — Full CDK deploy (new resources, table changes)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FRONTEND_BUCKET="fluxury-beta-frontend-728861022483-us-east-1"
CLOUDFRONT_ID="E1CZDYFERF03DM"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

deploy_frontend() {
  echo -e "${YELLOW}🏗️  Building frontend...${NC}"
  cd "$ROOT_DIR/fluxury-app"
  npm run build -- --mode beta

  echo -e "${YELLOW}☁️  Uploading to S3...${NC}"
  aws s3 sync dist/assets/ "s3://$FRONTEND_BUCKET/assets/" --cache-control "max-age=31536000,immutable" --delete --quiet
  aws s3 cp dist/index.html "s3://$FRONTEND_BUCKET/index.html" --cache-control "max-age=300" --quiet
  aws s3 sync dist/ "s3://$FRONTEND_BUCKET/" --exclude "assets/*" --exclude "index.html" --delete --quiet

  echo -e "${YELLOW}🔄 Invalidating CloudFront cache...${NC}"
  aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_ID" --paths "/*" --output text > /dev/null

  echo -e "${GREEN}✅ Frontend deployed! Live in ~60 seconds.${NC}"
}

deploy_backend() {
  echo -e "${YELLOW}⚡ Hotswapping Lambda code...${NC}"
  cd "$ROOT_DIR/fluxury-infra"
  npx cdk deploy FluxuryBeta --app "npx ts-node --prefer-ts-exts bin/fluxury-infra-beta.ts" --require-approval never --hotswap

  echo -e "${GREEN}✅ Backend deployed!${NC}"
}

deploy_infra() {
  echo -e "${YELLOW}🏗️  Full CDK deploy (may take a few minutes)...${NC}"
  cd "$ROOT_DIR/fluxury-infra"
  npx cdk deploy FluxuryBeta --app "npx ts-node --prefer-ts-exts bin/fluxury-infra-beta.ts" --require-approval never --outputs-file ./cdk-outputs-beta.json

  echo -e "${GREEN}✅ Infrastructure deployed!${NC}"
}

case "${1:-frontend}" in
  frontend|fe|f)
    deploy_frontend
    ;;
  backend|be|b)
    deploy_backend
    ;;
  all|a)
    deploy_backend
    deploy_frontend
    ;;
  infra|i)
    deploy_infra
    deploy_frontend
    ;;
  *)
    echo "Usage: ./deploy.sh [frontend|backend|all|infra]"
    echo ""
    echo "  frontend (default) — Build + upload frontend to S3/CloudFront"
    echo "  backend            — Hotswap Lambda code (fast)"
    echo "  all                — Backend + frontend"
    echo "  infra              — Full CDK deploy + frontend (for new resources)"
    exit 1
    ;;
esac

# Post-deploy smoke check (read-only). Frontend changes can take ~60s to
# propagate through CloudFront; CORS and API checks are immediate.
echo ""
"$ROOT_DIR/scripts/verify-deployment.sh"
