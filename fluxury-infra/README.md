# 🏗️ FluxuryApp Infrastructure

AWS CDK infrastructure for the FluxuryApp rap writing platform. Supports both beta and production deployments with cost-optimized configurations.

## 🚀 Quick Start - Beta Deployment

Deploy your beta environment in one command:

```bash
./scripts/deploy-beta-code.sh
```

**What you get:**
- Cost-optimized AWS infrastructure (~$22-60/month)
- Sessions API with full CRUD operations
- Beats upload and management
- AWS Cognito authentication
- S3 file storage with auto-cleanup
- Configured for `juantheengineer.com/fluxury`

## 📁 Project Structure

```
fluxury-infra/
├── lib/
│   ├── beta-stack.ts          # Cost-optimized beta infrastructure
│   ├── session-stack.ts       # Legacy production stack
│   ├── domain-config.ts       # Domain configuration
│   └── lambdas/
│       ├── sessions.ts        # Sessions CRUD API
│       └── beats.ts           # Beats upload/management
├── bin/
│   ├── fluxury-infra-beta.ts  # Beta deployment entry point
│   └── fluxury-infra-prod.ts  # Production deployment entry point
├── scripts/
│   └── deploy-beta-code.sh    # One-click beta deployment
└── cdk.json                   # CDK configuration
```

## 🎯 Deployment Options

### **Beta Environment** (Recommended)
Perfect for testing and user feedback:

```bash
# One-click deployment
./scripts/deploy-beta-code.sh

# Manual deployment
cdk deploy FluxuryBeta
```

**Features:**
- Cost-optimized settings
- 90-day auto-cleanup (TTL)
- Minimal memory allocation
- CORS configured for your domain
- Auto-generates frontend `.env.beta`

### **Production Environment**
Full production-ready infrastructure:

```bash
cdk deploy FluxuryProduction
```

**Features:**
- High availability
- Advanced monitoring
- Custom domain support
- Enhanced security
- Production-grade scaling

## 🛠️ Prerequisites

1. **AWS CLI configured:**
   ```bash
   aws configure
   ```

2. **Node.js and CDK:**
   ```bash
   npm install -g aws-cdk
   npm install
   ```

3. **Domain ownership:**
   - `juantheengineer.com` (configured in beta-stack.ts)

## 🔧 Configuration

### Beta Environment
The beta stack is pre-configured for:
- Domain: `juantheengineer.com/fluxury`
- Region: `us-east-1` (configurable)
- CORS: Development and production origins
- Cost optimization: Minimal resources

### Environment Variables
After deployment, the script auto-generates:
```bash
# fluxury-app/.env.beta
VITE_API_BASE_URL=https://your-api.amazonaws.com/beta
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXX
VITE_COGNITO_USER_POOL_CLIENT_ID=xxxxxxxxxx
VITE_S3_BUCKET_NAME=fluxury-beta-files-xxxxx
```

## 📊 Infrastructure Components

### **API Gateway**
- RESTful API with CORS
- Cognito JWT authorization
- Rate limiting (100 req/sec for beta)
- Custom error responses

### **Lambda Functions**
- `sessions.ts`: CRUD operations for rap sessions
- `beats.ts`: File upload and beat management
- Node.js 18.x runtime
- 256MB memory (beta), scalable for production

### **DynamoDB**
- Sessions table with GSI for user queries
- Pay-per-request billing (beta)
- TTL for automatic cleanup
- Point-in-time recovery (production only)

### **S3 Storage**
- Beat files and session attachments
- CORS configured for web uploads
- Lifecycle rules for cost optimization
- Versioning (production only)

### **Cognito Authentication**
- User pool with email verification
- Password policy configuration
- JWT token generation
- Self-signup enabled

## 🧪 Testing Your Deployment

1. **Check outputs:**
   ```bash
   cat cdk-outputs-beta.json
   ```

2. **Test API endpoints:**
   ```bash
   curl https://your-api-url/beta/sessions
   ```

3. **Frontend integration:**
   ```bash
   cd ../fluxury-app
   npm run build -- --mode beta
   ```

## 💰 Cost Breakdown

### Beta Environment (~$22-60/month):
- **Lambda**: ~$10-20/month (pay per invocation)
- **DynamoDB**: ~$5-15/month (pay per request)
- **S3**: ~$2-10/month (storage + requests)
- **API Gateway**: ~$5-15/month (pay per request)

### Production Environment (~$100-300/month):
- Enhanced monitoring and security
- Reserved capacity for predictable costs
- Multi-AZ deployment
- Advanced features

## 🚨 Troubleshooting

### Deployment Issues
```bash
# Check CDK diff
cdk diff FluxuryBeta

# View deployment events
cdk deploy FluxuryBeta --progress events

# Check CloudFormation logs
aws cloudformation describe-stack-events --stack-name FluxuryBeta
```

### Common Issues
| Problem | Solution |
|---------|----------|
| `AWS credentials not found` | Run `aws configure` |
| `CDK not bootstrapped` | Run `cdk bootstrap` |
| `Stack already exists` | Run `cdk destroy` first |
| `CORS errors` | Check origin configuration in beta-stack.ts |

### Logs and Monitoring
```bash
# Lambda logs
aws logs tail /aws/lambda/FluxuryBeta-SessionsFunction --follow

# API Gateway logs
aws logs tail API-Gateway-Execution-Logs --follow
```

## 🔄 Updates and Maintenance

### Update Infrastructure
```bash
# Update code and redeploy
git pull
npm run build
cdk deploy FluxuryBeta
```

### Clean Up Resources
```bash
# Destroy beta environment
cdk destroy FluxuryBeta

# Clean up S3 bucket contents (if needed)
aws s3 rm s3://your-bucket-name --recursive
```

## 📚 Additional Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Frontend README](../fluxury-app/README.md)
- [Setup Guide](../SETUP_GUIDE.md)
- [Architecture Overview](../ARCHITECTURE.md)

# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template
