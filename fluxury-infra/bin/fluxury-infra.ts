#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { SessionStack } from '../lib/session-stack'

const app = new cdk.App()

// Ensure these environment variables are defined in your shell
const account = process.env.CDK_DEFAULT_ACCOUNT
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1'

if (!account) {
  throw new Error('CDK_DEFAULT_ACCOUNT not set. Run "aws configure" or export it manually.')
}

new SessionStack(app, 'SessionStack', {
  env: { account, region },
})
