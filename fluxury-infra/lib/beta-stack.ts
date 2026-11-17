import { RemovalPolicy, Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as path from 'path'
import {
  RestApi,
  LambdaIntegration,
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  MethodOptions,
  Deployment,
  Stage,
} from 'aws-cdk-lib/aws-apigateway'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb'
import { Bucket, BucketAccessControl, HttpMethods } from 'aws-cdk-lib/aws-s3'
import { UserPool, UserPoolClient, VerificationEmailStyle, AccountRecovery, CfnIdentityPool, CfnIdentityPoolRoleAttachment } from 'aws-cdk-lib/aws-cognito'
import { Role, FederatedPrincipal, PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam'
import { Distribution, ViewerProtocolPolicy, OriginAccessIdentity } from 'aws-cdk-lib/aws-cloudfront'
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins'

export interface BetaStackProps extends StackProps {
  environment: string
  domainName?: string
}

export class BetaStack extends Stack {
  public readonly apiUrl: string
  public readonly userPoolId: string
  public readonly userPoolClientId: string
  public readonly identityPoolId: string
  public readonly bucketName: string

  constructor(scope: Construct, id: string, props: BetaStackProps) {
    super(scope, id, props)

    const allowedOrigin = this.node.tryGetContext('allowedOrigin') || 'https://juantheengineer.com'

    // Cognito User Pool for Authentication
    const userPool = new UserPool(this, 'FluxuryBetaUserPool', {
      userPoolName: 'fluxury-beta-users',
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
        username: true
      },
      autoVerify: { email: true },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: false,
          mutable: true,
        },
      },
      userVerification: {
        emailStyle: VerificationEmailStyle.CODE,
        emailSubject: 'Welcome to FluxuryApp Beta!',
        emailBody: 'Thank you for joining FluxuryApp Beta! Your verification code is {####}',
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY, // For beta only
    })

    const userPoolClient = new UserPoolClient(this, 'FluxuryBetaUserClient', {
      userPool,
      userPoolClientName: 'fluxury-beta-client',
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
        adminUserPassword: true,
      },
      preventUserExistenceErrors: true,
      refreshTokenValidity: Duration.days(7),
    })

    // Cognito Authorizer
    const authorizer = new CognitoUserPoolsAuthorizer(this, 'FluxuryBetaAuthorizer', {
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
    })

    // DynamoDB Table for Sessions (PK-only, simple lookups)
    const sessionsTable = new Table(this, 'FluxuryBetaSessionsV2', {
      tableName: `fluxury-beta-sessions-${props.environment}`,
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      // Restore to any second in the last 35 days (accidental delete/overwrite)
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    // GSI: List sessions by owner, sorted by modified date
    sessionsTable.addGlobalSecondaryIndex({
      indexName: 'OwnerIndex',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'modified', type: AttributeType.STRING },
    })

    // DynamoDB Table for Beats (PK-only, simple lookups)
    const beatsTable = new Table(this, 'FluxuryBetaBeats', {
      tableName: `fluxury-beta-beats-${props.environment}`,
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    // S3 Bucket for File Storage
    const bucketExpirationDays = this.node.tryGetContext('bucketExpirationDays')

    const filesBucket = new Bucket(this, 'FluxuryBetaFiles', {
      bucketName: `fluxury-beta-files-${this.account}-${this.region}`,
      versioned: false, // Cost optimization for beta
      accessControl: BucketAccessControl.PRIVATE,
      removalPolicy: RemovalPolicy.DESTROY, // For beta only
      autoDeleteObjects: true, // For beta only
      ...(bucketExpirationDays ? {
        lifecycleRules: [{
          id: 'beta-cleanup',
          enabled: true,
          expiration: Duration.days(bucketExpirationDays),
        }],
      } : {}),
      // Browser uploads session scripts directly (PutObject via Cognito Identity
      // Pool creds), so PUT must be allowed for every origin the app is served from.
      // Keep in sync with the API Gateway allowOrigins below.
      cors: [{
        allowedMethods: [HttpMethods.GET, HttpMethods.PUT, HttpMethods.HEAD],
        allowedOrigins: [
          'http://localhost:5173',
          allowedOrigin,
          'https://www.fluxury.app',
          'https://fluxury.app',
          'https://dh6p364plnqad.cloudfront.net',
        ],
        allowedHeaders: ['*'],
        exposedHeaders: ['ETag'],
      }],
    })

    // Cognito Identity Pool for direct S3 access from browser
    const identityPool = new CfnIdentityPool(this, 'FluxuryBetaIdentityPool', {
      identityPoolName: 'fluxury_beta_identity_pool',
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [{
        clientId: userPoolClient.userPoolClientId,
        providerName: userPool.userPoolProviderName,
      }],
    })

    // Authenticated role for Identity Pool
    const authenticatedRole = new Role(this, 'FluxuryBetaAuthRole', {
      assumedBy: new FederatedPrincipal('cognito-identity.amazonaws.com', {
        'StringEquals': { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
        'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
      }, 'sts:AssumeRoleWithWebIdentity'),
    })

    // Grant S3 access to authenticated users
    authenticatedRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:PutObject', 's3:GetObject', 's3:ListBucket'],
      resources: [
        filesBucket.bucketArn,
        `${filesBucket.bucketArn}/*`,
      ],
    }))

    // Attach role to Identity Pool
    new CfnIdentityPoolRoleAttachment(this, 'FluxuryBetaIdentityPoolRoles', {
      identityPoolId: identityPool.ref,
      roles: {
        'authenticated': authenticatedRole.roleArn,
      },
    })

    // Frontend Hosting - S3 + CloudFront
    const frontendBucket = new Bucket(this, 'FluxuryBetaFrontend', {
      bucketName: `fluxury-beta-frontend-${this.account}-${this.region}`,
      accessControl: BucketAccessControl.PRIVATE,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    const oai = new OriginAccessIdentity(this, 'FluxuryBetaOAI', {
      comment: 'OAI for FluxuryApp Beta frontend',
    })
    frontendBucket.grantRead(oai)

    const distribution = new Distribution(this, 'FluxuryBetaDistribution', {
      defaultBehavior: {
        origin: new S3Origin(frontendBucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
      ],
    })

    // REST API Gateway
    const api = new RestApi(this, 'FluxuryBetaAPI', {
      restApiName: 'FluxuryApp Beta API',
      description: 'FluxuryApp Beta Environment API',
      defaultCorsPreflightOptions: {
        allowOrigins: [
          'http://localhost:5173',
          allowedOrigin,
          'https://www.fluxury.app',
          'https://fluxury.app',
        ],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
        ],
        allowCredentials: true,
      },
      deployOptions: {
        stageName: 'beta',
        throttlingRateLimit: 100, // Limit for beta
        throttlingBurstLimit: 200,
      },
    })

    // Lambda Functions
    const lambdaEnvironment = {
      TABLE_NAME: sessionsTable.tableName,
      BEATS_TABLE_NAME: beatsTable.tableName,
      BUCKET_NAME: filesBucket.bucketName,
      USER_POOL_ID: userPool.userPoolId,
      CORS_ORIGIN: allowedOrigin,
      ENVIRONMENT: props.environment,
    }

    // Sessions API Lambda
    const sessionsLambda = new NodejsFunction(this, 'SessionsFunction', {
      entry: path.join(__dirname, 'lambdas/sessions.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      timeout: Duration.seconds(30),
      memorySize: 256, // Minimal for beta
      environment: lambdaEnvironment,
      bundling: {
        externalModules: ['aws-sdk'], // Use AWS SDK v3 in Lambda runtime
      },
    })

    // Beats API Lambda
    const beatsLambda = new NodejsFunction(this, 'BeatsFunction', {
      entry: path.join(__dirname, 'lambdas/beats.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: lambdaEnvironment,
      bundling: {
        externalModules: ['aws-sdk'],
      },
    })

    // YouTube Metadata Lambda (fetches video info without downloading)
    const youtubeMetadataLambda = new NodejsFunction(this, 'YouTubeMetadataFunction', {
      entry: path.join(__dirname, 'lambdas/youtube-metadata.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment: lambdaEnvironment,
      bundling: {
        externalModules: ['@aws-sdk/*'], // AWS SDK v3 is available in Node 18 runtime
      },
    })

    // YouTube Download Lambda (pure JS — downloads audio from YouTube to S3)
    const youtubeDownloadLambda = new NodejsFunction(this, 'YouTubeDownloadFunction', {
      entry: path.join(__dirname, 'lambdas/youtube-download.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.minutes(5),
      memorySize: 512,
      environment: {
        BEATS_TABLE_NAME: beatsTable.tableName,
        BUCKET_NAME: filesBucket.bucketName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    })

    // Grant permissions
    sessionsTable.grantReadWriteData(sessionsLambda)
    beatsTable.grantReadWriteData(beatsLambda)
    beatsTable.grantReadWriteData(youtubeMetadataLambda)
    beatsTable.grantReadWriteData(youtubeDownloadLambda)
    filesBucket.grantReadWrite(sessionsLambda)
    filesBucket.grantReadWrite(beatsLambda)
    filesBucket.grantReadWrite(youtubeDownloadLambda)

    // Allow metadata Lambda to invoke the download Lambda
    youtubeDownloadLambda.grantInvoke(youtubeMetadataLambda)

    // Pass download function name to metadata Lambda
    youtubeMetadataLambda.addEnvironment('DOWNLOAD_FUNCTION_NAME', youtubeDownloadLambda.functionName)

    // API Routes
    const sessionsResource = api.root.addResource('sessions')
    const beatsResource = api.root.addResource('beats')

    // Sessions endpoints
    sessionsResource.addMethod('GET', new LambdaIntegration(sessionsLambda), {
      authorizer,
      authorizationType: AuthorizationType.COGNITO,
    })

    sessionsResource.addMethod('POST', new LambdaIntegration(sessionsLambda), {
      authorizer,
      authorizationType: AuthorizationType.COGNITO,
    })

    const sessionResource = sessionsResource.addResource('{id}')
    sessionResource.addMethod('GET', new LambdaIntegration(sessionsLambda), {
      authorizer,
      authorizationType: AuthorizationType.COGNITO,
    })

    sessionResource.addMethod('PUT', new LambdaIntegration(sessionsLambda), {
      authorizer,
      authorizationType: AuthorizationType.COGNITO,
    })

    sessionResource.addMethod('DELETE', new LambdaIntegration(sessionsLambda), {
      authorizer,
      authorizationType: AuthorizationType.COGNITO,
    })

    // Beats endpoints
    beatsResource.addMethod('GET', new LambdaIntegration(beatsLambda))
    beatsResource.addMethod('POST', new LambdaIntegration(beatsLambda), {
      authorizer,
      authorizationType: AuthorizationType.COGNITO,
    })

    // YouTube beat import endpoint
    const beatsFromUrlResource = beatsResource.addResource('from-url')
    beatsFromUrlResource.addMethod('POST', new LambdaIntegration(youtubeMetadataLambda), {
      authorizer,
      authorizationType: AuthorizationType.COGNITO,
    })

    // Public endpoints (no auth required — guest/read-only access)
    const publicResource = api.root.addResource('public')
    const publicSessionsResource = publicResource.addResource('sessions')
    publicSessionsResource.addMethod('GET', new LambdaIntegration(sessionsLambda), {
      authorizationType: AuthorizationType.NONE,
    })
    const publicSessionResource = publicSessionsResource.addResource('{id}')
    publicSessionResource.addMethod('GET', new LambdaIntegration(sessionsLambda), {
      authorizationType: AuthorizationType.NONE,
    })

    // Store important values
    this.apiUrl = api.url
    this.userPoolId = userPool.userPoolId
    this.userPoolClientId = userPoolClient.userPoolClientId
    this.identityPoolId = identityPool.ref
    this.bucketName = filesBucket.bucketName

    // Outputs for easy access
    new CfnOutput(this, 'APIGatewayURL', {
      value: this.apiUrl,
      description: 'API Gateway URL for FluxuryApp Beta',
      exportName: `${id}-api-url`,
    })

    new CfnOutput(this, 'UserPoolId', {
      value: this.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${id}-user-pool-id`,
    })

    new CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `${id}-user-pool-client-id`,
    })

    new CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPoolId,
      description: 'Cognito Identity Pool ID',
      exportName: `${id}-identity-pool-id`,
    })

    new CfnOutput(this, 'S3BucketName', {
      value: this.bucketName,
      description: 'S3 Bucket for file storage',
      exportName: `${id}-s3-bucket`,
    })

    new CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
      exportName: `${id}-cloudfront-url`,
    })

    new CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 bucket for frontend assets',
      exportName: `${id}-frontend-bucket`,
    })

    new CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID (for cache invalidation)',
      exportName: `${id}-cloudfront-dist-id`,
    })
  }
}