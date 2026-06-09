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

        echo -e "${BLUE}📋 Beta Environment Ready!${NC}"
        echo "================================================"
        echo "🌐 Frontend URL: ${FRONTEND_URL}"
        echo "🔗 API URL: ${API_URL}"
        echo "🪣 S3 Bucket: ${BUCKET_NAME}"
        echo "👤 User Pool: ${USER_POOL_ID}"
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
VITE_S3_BUCKET_NAME=${BUCKET_NAME}

# Beta Features
VITE_BETA_MODE=true
VITE_SHOW_BETA_BANNER=true
VITE_ENABLE_FEEDBACK=true
VITE_MAX_SESSIONS=50
EOF

        echo -e "${GREEN}✅ Environment file created: ../fluxury-app/.env.beta${NC}"
        echo ""
        echo -e "${YELLOW}📝 Next Steps:${NC}"
        echo "1. 🏗️ Build and deploy frontend:"
        echo "   cd ../fluxury-app"
        echo "   npm run build -- --mode beta"
        echo ""
        echo "2. 🌐 Upload to Squarespace subdirectory:"
        echo "   Upload dist/ contents to juantheengineer.com/fluxury"
        echo ""
        echo "3. 🔗 Configure API subdomain (optional):"
        echo "   Point api.juantheengineer.com to: ${API_URL}"
        echo ""
        echo "4. 🧪 Test your beta app:"
        echo "   Open: ${FRONTEND_URL}"
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