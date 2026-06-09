/**
 * CORS utility functions for Lambda responses
 */

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // In production, replace with specific domain
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
}

/**
 * Add CORS headers to a Lambda response
 */
export const addCorsHeaders = (response: any) => {
  return {
    ...response,
    headers: {
      ...response.headers,
      ...CORS_HEADERS,
    },
  }
}

/**
 * Create a CORS preflight response for OPTIONS requests
 */
export const createOptionsResponse = () => {
  return addCorsHeaders({
    statusCode: 200,
    body: '',
  })
}

/**
 * Create an error response with CORS headers
 */
export const createErrorResponse = (statusCode: number, message: string) => {
  return addCorsHeaders({
    statusCode,
    body: JSON.stringify({
      error: message,
      timestamp: new Date().toISOString(),
    }),
  })
}

/**
 * Create a success response with CORS headers
 */
export const createSuccessResponse = (data: any, statusCode = 200) => {
  return addCorsHeaders({
    statusCode,
    body: JSON.stringify(data),
  })
}