# 🎤 Fluxury App – Developer Setup

Fluxury is a creative workspace for writing rap lyrics with precision beat playback and session management. This repo contains:

- `fluxury-app/`: Vue 3 frontend
- `fluxury-infra/`: AWS CDK backend infrastructure
- `lambdas/`: Serverless functions (Node.js)

---

## 📦 Requirements

- Node.js 18+
- AWS CLI
- AWS CDK (`npm install -g aws-cdk`)
- An AWS account

---

## 🛠️ Setup Instructions

### 1. 🔑 Configure AWS CLI

If you haven't yet:

```bash
aws configure
```

# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
