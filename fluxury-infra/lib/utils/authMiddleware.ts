import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

const region = 'us-east-1'
const userPoolId = 'us-east-1_fwsCeebLa' // <- replace with your real pool ID
const clientId = '3iu3p4skol810aivmds285uj10' // <- replace with your real client ID

const client = jwksClient({
  jwksUri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
})

function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, function (err, key: any) {
    const signingKey = key.getPublicKey()
    callback(null, signingKey)
  })
}

export const verifyToken = async (event: any) => {
  const token = event.headers.Authorization || event.headers.authorization
  if (!token) throw new Error('No auth token')

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        audience: clientId,
        issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
        algorithms: ['RS256'],
      },
      (err, decoded) => {
        if (err) reject(err)
        else resolve(decoded)
      }
    )
  })
}

// ✅ Reusable wrapper
export const withAuth = (
  handler: (event: APIGatewayProxyEvent, user: any) => Promise<APIGatewayProxyResult>
) => {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      const user = await verifyToken(event)
      return await handler(event, user)
    } catch (err) {
      console.error('❌ Unauthorized:', err)
      return {
        statusCode: 401,
        body: 'Unauthorized',
      }
    }
  }
}
