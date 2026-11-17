import { describe, it, expect } from '@jest/globals'
import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { BetaStack } from '../lib/beta-stack'

/**
 * Lyrics must be recoverable: an overwrite (e.g. autosave writing an empty
 * document) or a deleted session should never be permanent.
 */
function template(): Template {
  const app = new cdk.App()
  const stack = new BetaStack(app, 'TestBeta', {
    env: { account: '123456789012', region: 'us-east-1' },
    environment: 'beta',
  } as any)
  return Template.fromStack(stack)
}

function resource(t: Template, type: string, logicalIdPrefix: string): any {
  const match = Object.entries(t.findResources(type)).find(([id]) => id.startsWith(logicalIdPrefix))
  if (!match) throw new Error(`${logicalIdPrefix} (${type}) not found in stack`)
  return match[1]
}

describe('Files bucket versioning', () => {
  const t = template()

  it('files bucket keeps previous versions of every object', () => {
    const bucket = resource(t, 'AWS::S3::Bucket', 'FluxuryBetaFiles')
    expect(bucket.Properties.VersioningConfiguration?.Status).toBe('Enabled')
  })

  it('files bucket expires old versions so storage stays bounded', () => {
    const bucket = resource(t, 'AWS::S3::Bucket', 'FluxuryBetaFiles')
    const rules: any[] = bucket.Properties.LifecycleConfiguration?.Rules ?? []
    const rule = rules.find((r) => r.Status === 'Enabled' && r.NoncurrentVersionExpiration)
    expect(rule).toBeDefined()
    expect(rule.NoncurrentVersionExpiration.NoncurrentDays).toBeGreaterThanOrEqual(30)
  })
})
