#!/bin/bash

# FluxuryApp Beta Deployment Script
set -e

echo "🧪 Starting FluxuryApp Beta Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  FluxuryApp Beta Environment Setup   ${NC}"
echo -e "${BLUE}======================================${NC}"

# Check prerequisites (simplified for beta)
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}AWS CLI is not installed. Please install it first.${NC}"
    echo "Run: brew install awscli"
    exit 1
fi

# Check AWS credentials (allow any profile or default)
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}AWS credentials not configured.${NC}"
    echo "Run: aws configure"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed!${NC}"

# Set environment variables
export CDK_DEFAULT_REGION=us-east-1

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${YELLOW}Deploying to AWS Account: ${ACCOUNT_ID}${NC}"
echo -e "${YELLOW}Region: ${CDK_DEFAULT_REGION}${NC}"

# Show cost estimate
echo -e "${BLUE}💰 Estimated Beta Costs:${NC}"
echo "   • Lambda: ~$5-15/month"
echo "   • DynamoDB: ~$5-10/month"
echo "   • S3: ~$1-5/month"
echo "   • API Gateway: ~$3-10/month"
echo "   • Total: ~$15-40/month"
echo ""

# Confirm deployment
read -p "Deploy Beta Environment? This will create AWS resources with minimal costs. (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
fi

# Install dependencies (skip Java requirement for beta)
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install

# Skip OpenAPI generation for beta (use mock APIs)
echo -e "${YELLOW}Skipping API generation for beta - using mock APIs${NC}"

# Build the project
echo -e "${YELLOW}Building project...${NC}"
npm run build 2>/dev/null || echo "Build warnings ignored for beta"

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    echo -e "${YELLOW}Installing AWS CDK...${NC}"
    npm install -g aws-cdk
fi

# Bootstrap CDK (only needed once per account/region)
echo -e "${YELLOW}Bootstrapping CDK...${NC}"
cdk bootstrap aws://${ACCOUNT_ID}/${CDK_DEFAULT_REGION}

# Synthesize the template
echo -e "${YELLOW}Synthesizing CDK template...${NC}"
cdk synth FluxuryStack-beta --app "npx ts-node bin/fluxury-infra-beta.ts"

# Deploy the stack
echo -e "${YELLOW}Deploying beta infrastructure...${NC}"
cdk deploy FluxuryStack-beta \
    --app "npx ts-node bin/fluxury-infra-beta.ts" \
    --require-approval never \
    --outputs-file ./cdk-outputs-beta.json

if [ $? -eq 0 ]; then
    echo -e "${GREEN}🎉 Beta deployment successful!${NC}"

    # Display important outputs
    echo -e "${BLUE}📋 Beta Environment Details:${NC}"
    cat cdk-outputs-beta.json | jq . 2>/dev/null || cat cdk-outputs-beta.json

    # Extract key values
    API_URL=$(cat cdk-outputs-beta.json | jq -r '.["FluxuryStack-beta"].APIGatewayURL // empty' 2>/dev/null)
    USER_POOL_ID=$(cat cdk-outputs-beta.json | jq -r '.["FluxuryStack-beta"].UserPoolId // empty' 2>/dev/null)

    echo -e "${BLUE}🔗 Your Beta URLs:${NC}"
    echo "   API Endpoint: ${API_URL}"
    echo "   Frontend: Will be configured next"
    echo ""

    echo -e "${YELLOW}📝 Next steps:${NC}"
    echo "1. Update fluxury-app/.env.beta with these values:"
    echo "   VITE_API_BASE_URL=${API_URL}"
    echo "   VITE_COGNITO_USER_POOL_ID=${USER_POOL_ID}"
    echo ""
    echo "2. Deploy frontend to beta:"
    echo "   cd ../fluxury-app"
    echo "   npm run build -- --mode beta"
    echo ""
    echo "3. Test your beta environment!"
    echo "4. Invite beta users and collect feedback"
    echo ""
    echo -e "${GREEN}🧪 Beta environment ready for testing!${NC}"

else
    echo -e "${RED}❌ Beta deployment failed!${NC}"
    echo "Check the error messages above and try again."
    exit 1
fi