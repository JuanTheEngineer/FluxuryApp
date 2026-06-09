#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { BetaStack } from '../lib/beta-stack'

const app = new cdk.App()

new BetaStack(app, 'FluxuryBeta', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  environment: 'beta',
  description: 'FluxuryApp Beta Environment - Cost-optimized for testing at juantheengineer.com/fluxury',
  tags: {
    Environment: 'beta',
    Project: 'FluxuryApp',
    Domain: 'juantheengineer.com',
    Owner: 'Juan',
    Purpose: 'beta-testing',
    CostCenter: 'development',
  }
})