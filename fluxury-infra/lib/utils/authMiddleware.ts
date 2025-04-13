import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

const region = 'us-east-1'
const userPoolId = 'us-east-1_XXXXXXX' // <- replace with your real pool ID
const clientId = 'xxxxxxxxx'           // <- replace with your real client ID

const client = jwksClient({
    jwksUri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`
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
        jwt.verify(token, getKey, {
            audience: clientId,
            issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
            algorithms: ['RS256']
        }, (err, decoded) => {
            if (err) reject(err)
            else resolve(decoded)
        })
    })
}