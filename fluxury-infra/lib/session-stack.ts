import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as path from 'path'
import {
  RestApi,
  LambdaIntegration,
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  MethodOptions,
} from 'aws-cdk-lib/aws-apigateway'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb'
import { Bucket } from 'aws-cdk-lib/aws-s3'
import { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito'

export class SessionStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    // Cognito User Pool setup
    const userPool = new UserPool(this, 'FluxuryUserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
    })

    const userPoolClient = new UserPoolClient(this, 'FluxuryUserClient', {
      userPool,
      generateSecret: false,
    })

    const authorizer = new CognitoUserPoolsAuthorizer(this, 'FluxuryAuthorizer', {
      cognitoUserPools: [userPool],
    })

    // DynamoDB Table
    const table = new Table(this, 'SessionTable', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    })

    // S3 Bucket
    const bucket = new Bucket(this, 'SessionBucket', {
      bucketName: 'fluxury-session-files',
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    // REST API with CORS configuration
    const api = new RestApi(this, 'FluxuryAPI', {
      restApiName: 'Fluxury Session API',
      description: 'API for Fluxury rap session management',
      defaultCorsPreflightOptions: {
        allowOrigins: [
          'http://localhost:5173', // Development
          'http://localhost:3000', // Alternative dev port
          'https://*.amplifyapp.com', // Amplify hosting
          'https://fluxury.com', // Production domain (update as needed)
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
    })

    const lambdaNames = [
      'createSession',
      'getSessions',
      'getSessionById',
      'saveSessionMetadata',
      'saveSessionScript',
      'getSessionScript',
    ]

    // Add route: /sessions/{name}
    const sessionsResource = api.root.addResource('sessions')

    for (const name of lambdaNames) {
      console.log(path.join(__dirname, `/lambdas/${name}.ts`))
      const fn = new NodejsFunction(this, name, {
        entry: path.join(__dirname, `/lambdas/${name}.ts`),
        handler: 'handler',
        runtime: Runtime.NODEJS_18_X,
        environment: {
          TABLE_NAME: table.tableName,
          BUCKET_NAME: bucket.bucketName,
        },
      })

      table.grantReadWriteData(fn)
      bucket.grantReadWrite(fn)

      // Configure method options with proper CORS and auth
      const methodOptions: MethodOptions = {
        authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }

      // Use the existing /sessions path, and make each one a sub-resource
      const methodResource = sessionsResource.addResource(name)
      methodResource.addMethod('POST', new LambdaIntegration(fn), methodOptions)

      // Add OPTIONS method for CORS preflight
      methodResource.addMethod('OPTIONS', new LambdaIntegration(fn), {
        authorizationType: AuthorizationType.NONE, // OPTIONS requests don't need auth
      })
    }
  }
}
