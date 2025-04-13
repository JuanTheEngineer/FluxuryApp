import {RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as path from 'path'
import {
    RestApi,
    LambdaIntegration,
    AuthorizationType,
    CognitoUserPoolsAuthorizer
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
            signInAliases: { email: true }
        })

        const userPoolClient = new UserPoolClient(this, 'FluxuryUserClient', {
            userPool,
            generateSecret: false
        })

        const authorizer = new CognitoUserPoolsAuthorizer(this, 'FluxuryAuthorizer', {
            cognitoUserPools: [userPool]
        })

        // DynamoDB Table
        const table = new Table(this, 'SessionTable', {
            partitionKey: { name: 'id', type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST
        })

        // S3 Bucket
        const bucket = new Bucket(this, 'SessionBucket', {
            bucketName: 'fluxury-session-files',
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        })

        // REST API
        const api = new RestApi(this, 'FluxuryAPI', {
            restApiName: 'Fluxury Session API'
        })

        const lambdaNames = [
            'createSession',
            'getSessions',
            'getSessionById',
            'saveSessionMetadata',
            'saveSessionScript',
            'getSessionScript'
        ]

        for (const name of lambdaNames) {
            const fn = new NodejsFunction(this, name, {
                entry: path.join(__dirname, `../../lambdas/${name}.ts`),
                handler: 'handler',
                runtime: Runtime.NODEJS_18_X,
                environment: {
                    TABLE_NAME: table.tableName,
                    BUCKET_NAME: bucket.bucketName
                }
            })

            table.grantReadWriteData(fn)
            bucket.grantReadWrite(fn)

            // Add route: /sessions/{name}
            const sessionResource = api.root
                .addResource('sessions')
                .addResource(name)

            sessionResource.addMethod('POST', new LambdaIntegration(fn), {
                authorizer,
                authorizationType: AuthorizationType.COGNITO
            })
        }
    }
}