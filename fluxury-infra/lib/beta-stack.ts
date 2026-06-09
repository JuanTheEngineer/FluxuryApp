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
import { Bucket, BucketAccessControl } from 'aws-cdk-lib/aws-s3'
import { UserPool, UserPoolClient, VerificationEmailStyle, AccountRecovery } from 'aws-cdk-lib/aws-cognito'

export interface BetaStackProps extends StackProps {
  environment: string
  domainName?: string
}

export class BetaStack extends Stack {
  public readonly apiUrl: string
  public readonly userPoolId: string
  public readonly userPoolClientId: string
  public readonly bucketName: string

  constructor(scope: Construct, id: string, props: BetaStackProps) {
    super(scope, id, props)

    // Cognito User Pool for Authentication
    const userPool = new UserPool(this, 'FluxuryBetaUserPool', {
      userPoolName: 'fluxury-beta-users',
      selfSignUpEnabled: true,
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
    })

    // Cognito Authorizer
    const authorizer = new CognitoUserPoolsAuthorizer(this, 'FluxuryBetaAuthorizer', {
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
    })

    // DynamoDB Table for Sessions
    const sessionsTable = new Table(this, 'FluxuryBetaSessions', {
      tableName: `fluxury-beta-sessions-${props.environment}`,
      partitionKey: { name: 'id', type: AttributeType.STRING },
      sortKey: { name: 'userId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: false, // Cost optimization for beta
      removalPolicy: RemovalPolicy.DESTROY, // For beta only
      timeToLiveAttribute: 'ttl', // Auto-cleanup old sessions
    })

    // Add GSI for user queries
    sessionsTable.addGlobalSecondaryIndex({
      indexName: 'UserIndex',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'created', type: AttributeType.STRING },
    })

    // S3 Bucket for File Storage
    const filesBucket = new Bucket(this, 'FluxuryBetaFiles', {
      bucketName: `fluxury-beta-files-${this.account}-${this.region}`,
      versioned: false, // Cost optimization for beta
      accessControl: BucketAccessControl.PRIVATE,
      removalPolicy: RemovalPolicy.DESTROY, // For beta only
      autoDeleteObjects: true, // For beta only
      lifecycleRules: [{
        id: 'beta-cleanup',
        enabled: true,
        expiration: Duration.days(30), // Auto-delete after 30 days
      }],
    })

    // REST API Gateway
    const api = new RestApi(this, 'FluxuryBetaAPI', {
      restApiName: 'FluxuryApp Beta API',
      description: 'FluxuryApp Beta Environment API',
      defaultCorsPreflightOptions: {
        allowOrigins: [
          'http://localhost:5173', // Local development
          'http://localhost:3000', // Alternative local
          'https://juantheengineer.com', // Your domain
          'https://www.juantheengineer.com', // Your domain with www
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
      BUCKET_NAME: filesBucket.bucketName,
      USER_POOL_ID: userPool.userPoolId,
      CORS_ORIGIN: 'https://juantheengineer.com',
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

    // Grant permissions
    sessionsTable.grantReadWriteData(sessionsLambda)
    sessionsTable.grantReadWriteData(beatsLambda)
    filesBucket.grantReadWrite(sessionsLambda)
    filesBucket.grantReadWrite(beatsLambda)

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

    // Store important values
    this.apiUrl = api.url
    this.userPoolId = userPool.userPoolId
    this.userPoolClientId = userPoolClient.userPoolClientId
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

    new CfnOutput(this, 'S3BucketName', {
      value: this.bucketName,
      description: 'S3 Bucket for file storage',
      exportName: `${id}-s3-bucket`,
    })

    new CfnOutput(this, 'FrontendURL', {
      value: 'https://juantheengineer.com/fluxury',
      description: 'Frontend URL (configure after deployment)',
      exportName: `${id}-frontend-url`,
    })
  }
}