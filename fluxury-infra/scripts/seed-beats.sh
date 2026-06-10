#!/bin/bash

# Seed beats into Fluxury Beta environment
# Uploads .wav files from fluxury-app/public/beats/ to S3 and registers them via the API

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🎵 Seeding beats into Fluxury Beta..."

# Read configuration from CDK outputs
OUTPUTS_FILE="./cdk-outputs-beta.json"
if [ ! -f "$OUTPUTS_FILE" ]; then
    echo -e "${RED}❌ cdk-outputs-beta.json not found. Run deploy-beta-code.sh first.${NC}"
    exit 1
fi

API_URL=$(jq -r '.FluxuryBeta.APIGatewayURL // empty' "$OUTPUTS_FILE")
BUCKET_NAME=$(jq -r '.FluxuryBeta.S3BucketName // empty' "$OUTPUTS_FILE")
USER_POOL_ID=$(jq -r '.FluxuryBeta.UserPoolId // empty' "$OUTPUTS_FILE")
CLIENT_ID=$(jq -r '.FluxuryBeta.UserPoolClientId // empty' "$OUTPUTS_FILE")

if [ -z "$API_URL" ] || [ -z "$BUCKET_NAME" ]; then
    echo -e "${RED}❌ Missing API_URL or BUCKET_NAME in cdk-outputs-beta.json.${NC}"
    exit 1
fi

if [ -z "$USER_POOL_ID" ] || [ -z "$CLIENT_ID" ]; then
    echo -e "${RED}❌ Missing UserPoolId or UserPoolClientId in cdk-outputs-beta.json.${NC}"
    exit 1
fi

echo "  API: ${API_URL}"
echo "  Bucket: ${BUCKET_NAME}"

# Authenticate to get a JWT token
echo -e "${YELLOW}🔐 Authenticating...${NC}"

DEV_EMAIL="${FLUXURY_DEV_EMAIL:-}"
DEV_PASSWORD="${FLUXURY_DEV_PASSWORD:-}"

if [ -z "$DEV_EMAIL" ]; then
    read -p "Email: " DEV_EMAIL
fi
if [ -z "$DEV_PASSWORD" ]; then
    read -sp "Password: " DEV_PASSWORD
    echo
fi

AUTH_RESULT=$(aws cognito-idp admin-initiate-auth \
    --user-pool-id "$USER_POOL_ID" \
    --client-id "$CLIENT_ID" \
    --auth-flow ADMIN_USER_PASSWORD_AUTH \
    --auth-parameters "USERNAME=$DEV_EMAIL,PASSWORD=$DEV_PASSWORD" \
    2>/dev/null)

TOKEN=$(echo "$AUTH_RESULT" | jq -r '.AuthenticationResult.IdToken // empty')

if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ Authentication failed. Check your credentials.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Authenticated${NC}"

# Fetch existing beats from API
echo -e "${YELLOW}📋 Fetching existing beats...${NC}"
EXISTING_BEATS=$(curl -s -H "Authorization: Bearer $TOKEN" "${API_URL}beats" || echo "{}")
EXISTING_IDS=$(echo "$EXISTING_BEATS" | jq -r '.beats[]?.id // empty' 2>/dev/null || echo "")

# Seed each .wav file
BEATS_DIR="../fluxury-app/public/beats"
SEEDED=0
SKIPPED=0

if [ ! -d "$BEATS_DIR" ]; then
    echo -e "${RED}❌ Beats directory not found: ${BEATS_DIR}${NC}"
    exit 1
fi

for beat_file in "$BEATS_DIR"/*.wav; do
    [ -f "$beat_file" ] || continue

    filename=$(basename "$beat_file")
    slug=$(echo "${filename%.*}" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')
    beat_id="beat-${slug}"

    # Check if already exists
    if echo "$EXISTING_IDS" | grep -q "^${beat_id}$"; then
        echo -e "  ⏭️  Skipping ${filename} (already exists)"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    echo -e "  📤 Uploading ${filename}..."

    # Upload .wav to S3
    aws s3 cp "$beat_file" "s3://${BUCKET_NAME}/beats/${beat_id}/audio.wav" \
        --content-type "audio/wav" \
        --quiet

    # Register metadata via POST /beats
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}beats" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"id\":\"${beat_id}\",\"name\":\"${filename%.*}\",\"fileName\":\"${filename}\"}")

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)

    if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
        echo -e "  ${GREEN}✅ ${filename} → ${beat_id}${NC}"
        SEEDED=$((SEEDED + 1))
    else
        echo -e "  ${RED}❌ Failed to register ${filename} (HTTP ${HTTP_CODE})${NC}"
    fi
done

echo ""
echo -e "${GREEN}🎉 Beat seeding complete!${NC}"
echo "  Seeded: ${SEEDED}"
echo "  Skipped: ${SKIPPED}"
echo "  Total: $((SEEDED + SKIPPED))"
