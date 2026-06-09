#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SessionStack } from '../lib/session-stack';

const app = new cdk.App();

// Get environment from context or default to development
const environment = app.node.tryGetContext('environment') || 'development';
const config = app.node.tryGetContext('config') || {};

// Production configuration
const productionConfig = {
  domainName: 'YOUR_DOMAIN_HERE', // Update this with your purchased domain
  apiDomainName: 'api.YOUR_DOMAIN_HERE', // e.g., api.fluxury.com
  certificateArn: '', // Will be created automatically
  enableWAF: true,
  enableCloudTrail: true,
  backupRetention: 30, // days
  logRetention: 90, // days
  environment: 'production'
};

// Development configuration
const developmentConfig = {
  domainName: 'dev.fluxury.com',
  apiDomainName: 'api-dev.fluxury.com',
  enableWAF: false,
  enableCloudTrail: false,
  backupRetention: 7,
  logRetention: 30,
  environment: 'development'
};

const envConfig = environment === 'production' ? productionConfig : developmentConfig;

new SessionStack(app, `FluxuryStack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: `FluxuryApp ${environment} infrastructure stack`,
  tags: {
    Environment: environment,
    Project: 'FluxuryApp',
    Owner: 'FluxuryTeam'
  },
  ...envConfig
});