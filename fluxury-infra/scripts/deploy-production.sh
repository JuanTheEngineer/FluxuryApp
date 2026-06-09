#!/bin/bash

# FluxuryApp Production Deployment Script
set -e

echo "🚀 Starting FluxuryApp Production Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}AWS CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Check CDK CLI
if ! command -v cdk &> /dev/null; then
    echo -e "${RED}AWS CDK is not installed. Please install it first.${NC}"
    echo "Run: npm install -g aws-cdk"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity --profile fluxury-production &> /dev/null; then
    echo -e "${RED}AWS credentials not configured for production profile.${NC}"
    echo "Please run: aws configure --profile fluxury-production"
    exit 1
fi

# Check if Java is installed (for OpenAPI generation)
if ! command -v java &> /dev/null; then
    echo -e "${YELLOW}Java not found. Installing OpenJDK...${NC}"
    if command -v brew &> /dev/null; then
        brew install openjdk@11
    else
        echo -e "${RED}Please install Java manually: https://adoptopenjdk.net/${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}Prerequisites check passed!${NC}"

# Set environment variables
export AWS_PROFILE=fluxury-production
export CDK_DEFAULT_REGION=us-east-1

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${YELLOW}Deploying to AWS Account: ${ACCOUNT_ID}${NC}"

# Confirm deployment
read -p "Deploy to PRODUCTION? This will create real AWS resources and incur costs. (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
fi

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install

# Build the project
echo -e "${YELLOW}Building project...${NC}"
npm run build

# Bootstrap CDK (only needed once per account/region)
echo -e "${YELLOW}Bootstrapping CDK...${NC}"
cdk bootstrap aws://${ACCOUNT_ID}/us-east-1 --profile fluxury-production

# Synthesize the template
echo -e "${YELLOW}Synthesizing CDK template...${NC}"
cdk synth FluxuryStack-production --profile fluxury-production

# Deploy the stack
echo -e "${YELLOW}Deploying infrastructure...${NC}"
cdk deploy FluxuryStack-production \
    --profile fluxury-production \
    --require-approval never \
    --context environment=production \
    --outputs-file ./cdk-outputs.json

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"

    # Display important outputs
    echo -e "${YELLOW}Important outputs:${NC}"
    cat cdk-outputs.json | jq .

    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Update your frontend environment variables with the API Gateway URL"
    echo "2. Configure your domain name DNS settings"
    echo "3. Test the deployed application"
    echo "4. Set up monitoring and alerts"

else
    echo -e "${RED}❌ Deployment failed!${NC}"
    exit 1
fi