#!/bin/bash

# FluxuryApp Beta Deployment - Pure Code Approach
# No Java, No OpenAPI generation, Pure TypeScript CDK

set -e

echo "🚀 FluxuryApp Beta - Code-First Deployment"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check prerequisites
echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI is not installed${NC}"
    echo "Install with: brew install awscli"
    exit 1
fi

# Check jq
if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ jq is not installed${NC}"
    echo "Install with: brew install jq"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    echo "Run: aws configure"
    exit 1
fi

# Get AWS account info
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo "us-east-1")

echo -e "${GREEN}✅ Prerequisites passed${NC}"
echo -e "${BLUE}📊 Deployment Info:${NC}"
echo "   Account: ${ACCOUNT_ID}"
echo "   Region: ${REGION}"
echo "   Domain: juantheengineer.com/fluxury"
echo ""

# Confirm deployment
echo -e "${YELLOW}💰 Beta Environment Costs:${NC}"
echo "   • Lambda: ~$10-20/month"
echo "   • DynamoDB: ~$5-15/month"
echo "   • S3: ~$2-10/month"
echo "   • API Gateway: ~$5-15/month"
echo "   • Total: ~$22-60/month"
echo ""

read -p "🚀 Deploy FluxuryApp Beta Environment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
fi

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install

# Install CDK if needed
if ! command -v cdk &> /dev/null; then
    echo -e "${YELLOW}🔧 Installing AWS CDK...${NC}"
    npm install -g aws-cdk
fi

# Build TypeScript
echo -e "${YELLOW}🔨 Building TypeScript...${NC}"
npm run build

# Bootstrap CDK
echo -e "${YELLOW}🏗️ Bootstrapping CDK...${NC}"
cdk bootstrap aws://${ACCOUNT_ID}/${REGION}

# Update CDK config to use the correct entry point
cat > cdk.json << 'EOF'
{
  "app": "npx ts-node --prefer-ts-exts bin/fluxury-infra-beta.ts",
  "watch": {
    "include": ["**"],
    "exclude": ["README.md", "cdk*.json", "**/*.d.ts", "**/*.js", "tsconfig.json", "package*.json", "yarn.lock", "node_modules", "test"]
  },
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true,
    "@aws-cdk/core:target-partitions": ["aws", "aws-cn"],
    "@aws-cdk/aws-lambda-nodejs:useLatestRuntimeVersion": true
  }
}
EOF

# Synthesize stack
echo -e "${YELLOW}🔍 Synthesizing CDK stack...${NC}"
cdk synth FluxuryBeta

# Deploy stack
echo -e "${YELLOW}🚀 Deploying beta infrastructure...${NC}"
echo "This will take 5-10 minutes..."

cdk deploy FluxuryBeta \
    --require-approval never \
    --outputs-file ./cdk-outputs-beta.json \
    --progress events

if [ $? -eq 0 ]; then
    echo -e "${GREEN}🎉 Beta deployment successful!${NC}"
    echo ""

    # Parse outputs
    if [ -f cdk-outputs-beta.json ]; then
        API_URL=$(cat cdk-outputs-beta.json | jq -r '.FluxuryBeta.APIGatewayURL // empty' 2>/dev/null)
        USER_POOL_ID=$(cat cdk-outputs-beta.json | jq -r '.FluxuryBeta.UserPoolId // empty' 2>/dev/null)
        CLIENT_ID=$(cat cdk-outputs-beta.json | jq -r '.FluxuryBeta.UserPoolClientId // empty' 2>/dev/null)
        BUCKET_NAME=$(cat cdk-outputs-beta.json | jq -r '.FluxuryBeta.S3BucketName // empty' 2>/dev/null)
        FRONTEND_URL=$(cat cdk-outputs-beta.json | jq -r '.FluxuryBeta.FrontendURL // empty' 2>/dev/null)
        IDENTITY_POOL_ID=$(cat cdk-outputs-beta.json | jq -r '.FluxuryBeta.IdentityPoolId // empty' 2>/dev/null)
        CLOUDFRONT_URL=$(cat cdk-outputs-beta.json | jq -r '.FluxuryBeta.CloudFrontURL // empty' 2>/dev/null)
        FRONTEND_BUCKET=$(cat cdk-outputs-beta.json | jq -r '.FluxuryBeta.FrontendBucketName // empty' 2>/dev/null)
        CF_DIST_ID=$(cat cdk-outputs-beta.json | jq -r '.FluxuryBeta.CloudFrontDistributionId // empty' 2>/dev/null)

        echo -e "${BLUE}📋 Beta Environment Ready!${NC}"
        echo "================================================"
        echo "🌐 Frontend URL: ${CLOUDFRONT_URL:-${FRONTEND_URL}}"
        echo "🔗 API URL: ${API_URL}"
        echo "🪣 S3 Bucket: ${BUCKET_NAME}"
        echo "🪣 Frontend Bucket: ${FRONTEND_BUCKET}"
        echo "👤 User Pool: ${USER_POOL_ID}"
        echo "🆔 Identity Pool: ${IDENTITY_POOL_ID}"
        echo "☁️ CloudFront Distribution: ${CF_DIST_ID}"
        echo ""

        # Create environment file for frontend
        cat > ../fluxury-app/.env.beta << EOF
# FluxuryApp Beta Environment - Auto-generated
VITE_DEMO_MODE=false
VITE_USE_MOCK_API=false
VITE_ENVIRONMENT=beta

# API Configuration
VITE_API_BASE_URL=${API_URL}
VITE_BEATS_API_BASE_URL=${API_URL}

# AWS Configuration
VITE_AWS_REGION=${REGION}
VITE_COGNITO_USER_POOL_ID=${USER_POOL_ID}
VITE_COGNITO_USER_POOL_CLIENT_ID=${CLIENT_ID}
VITE_COGNITO_IDENTITY_POOL_ID=${IDENTITY_POOL_ID}
VITE_S3_BUCKET_NAME=${BUCKET_NAME}

# Beta Features
VITE_BETA_MODE=true
VITE_SHOW_BETA_BANNER=true
VITE_ENABLE_FEEDBACK=true
VITE_MAX_SESSIONS=50
EOF

        echo -e "${GREEN}✅ Environment file created: ../fluxury-app/.env.beta${NC}"

        # Create Cognito user
        echo ""
        echo -e "${YELLOW}👤 Creating developer Cognito user...${NC}"

        # Get credentials from env vars or prompt
        DEV_EMAIL="${FLUXURY_DEV_EMAIL:-}"
        DEV_PASSWORD="${FLUXURY_DEV_PASSWORD:-}"

        if [ -z "$DEV_EMAIL" ]; then
            read -p "Enter your email for login: " DEV_EMAIL
        fi
        if [ -z "$DEV_PASSWORD" ]; then
            read -sp "Enter password (min 8 chars, 1 lowercase, 1 digit): " DEV_PASSWORD
            echo
        fi

        # Create user (suppress welcome email)
        echo "Creating user: $DEV_EMAIL"
        aws cognito-idp admin-create-user \
            --user-pool-id "$USER_POOL_ID" \
            --username "$DEV_EMAIL" \
            --user-attributes Name=email,Value="$DEV_EMAIL" Name=email_verified,Value=true \
            --message-action SUPPRESS \
            2>/dev/null || echo -e "${YELLOW}⚠️ User may already exist (continuing)${NC}"

        # Set permanent password (bypass force-change-password state)
        aws cognito-idp admin-set-user-password \
            --user-pool-id "$USER_POOL_ID" \
            --username "$DEV_EMAIL" \
            --password "$DEV_PASSWORD" \
            --permanent \
            2>/dev/null && echo -e "${GREEN}✅ User created and password set${NC}" \
            || echo -e "${RED}❌ Failed to set password. You may need to set it manually.${NC}"

        # Frontend deployment (optional)
        echo ""
        read -p "🌐 Build and deploy frontend now? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}🏗️ Building frontend with beta configuration...${NC}"
            cd ../fluxury-app
            npm run build -- --mode beta

            echo -e "${YELLOW}🚀 Uploading to S3...${NC}"
            # Upload hashed assets with long cache
            aws s3 sync dist/assets/ "s3://${FRONTEND_BUCKET}/assets/" \
                --cache-control "max-age=31536000,immutable" \
                --delete

            # Upload index.html with short cache
            aws s3 cp dist/index.html "s3://${FRONTEND_BUCKET}/index.html" \
                --cache-control "max-age=300"

            # Upload other root files
            aws s3 sync dist/ "s3://${FRONTEND_BUCKET}/" \
                --exclude "assets/*" \
                --exclude "index.html" \
                --delete

            echo -e "${YELLOW}🔄 Invalidating CloudFront cache...${NC}"
            aws cloudfront create-invalidation \
                --distribution-id "${CF_DIST_ID}" \
                --paths "/*" > /dev/null 2>&1

            echo -e "${GREEN}✅ Frontend deployed!${NC}"
            echo -e "Open: ${CLOUDFRONT_URL}"

            cd ../fluxury-infra
        fi

        echo ""
        echo -e "${YELLOW}📝 Next Steps:${NC}"
        echo "1. 🏗️ Build and deploy frontend:"
        echo "   cd ../fluxury-app"
        echo "   npm run build -- --mode beta"
        echo ""
        echo "2. 🌐 Upload frontend to S3:"
        echo "   aws s3 sync dist/ s3://${FRONTEND_BUCKET} --delete"
        echo ""
        echo "3. 🔄 Invalidate CloudFront cache:"
        echo "   aws cloudfront create-invalidation --distribution-id ${CF_DIST_ID} --paths '/*'"
        echo ""
        echo "4. 🧪 Test your beta app:"
        echo "   Open: ${CLOUDFRONT_URL:-${FRONTEND_URL}}"
        echo ""
        echo "5. 🎯 Start beta testing!"

    else
        echo -e "${YELLOW}⚠️ Outputs file not found, but deployment succeeded${NC}"
    fi

else
    echo -e "${RED}❌ Deployment failed!${NC}"
    echo "Check the error messages above."
    exit 1
fi