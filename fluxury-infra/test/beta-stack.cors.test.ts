import { describe, it, expect } from '@jest/globals'
import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { BetaStack } from '../lib/beta-stack'

/**
 * Guards the browser -> S3 upload path for session lyrics.
 *
 * The frontend PUTs sessions/<id>/script.json straight to the files bucket
 * with Cognito Identity Pool credentials, so the bucket's CORS rule must allow
 * PUT from every origin the app is served from. On 2026-11-14 it only allowed
 * GET from juantheengineer.com, and lyrics silently never saved.
 */
const APP_ORIGINS = [
  'https://www.fluxury.app',
  'https://fluxury.app',
  'https://dh6p364plnqad.cloudfront.net',
  'http://localhost:5173',
]

function filesBucketCorsRules(): any[] {
  const app = new cdk.App()
  const stack = new BetaStack(app, 'TestBeta', {
    env: { account: '123456789012', region: 'us-east-1' },
    environment: 'beta',
  } as any)
  const buckets = Template.fromStack(stack).findResources('AWS::S3::Bucket')
  const filesBucket = Object.entries(buckets).find(([logicalId]) =>
    logicalId.startsWith('FluxuryBetaFiles'),
  )
  if (!filesBucket) throw new Error('FluxuryBetaFiles bucket not found in stack')
  return (filesBucket[1] as any).Properties.CorsConfiguration?.CorsRules ?? []
}

describe('Files bucket CORS (lyrics upload path)', () => {
  const rules = filesBucketCorsRules()

  it.each(APP_ORIGINS)('allows GET and PUT from %s', (origin) => {
    const rule = rules.find((r) => r.AllowedOrigins?.includes(origin))
    expect(rule).toBeDefined()
    expect(rule.AllowedMethods).toEqual(expect.arrayContaining(['GET', 'PUT']))
  })
})
