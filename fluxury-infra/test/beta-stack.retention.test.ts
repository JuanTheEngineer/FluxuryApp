import { describe, it, expect } from '@jest/globals'
import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { BetaStack } from '../lib/beta-stack'

/**
 * User data must survive `cdk destroy`, a stack replacement, or a resource
 * replacement. PITR and S3 versioning live INSIDE these resources, so they
 * don't help if the resource itself is deleted.
 *
 * Rebuildable things (the frontend bucket, Lambdas, the API) may still be
 * destroyed with the stack.
 */
function template(): Template {
  const app = new cdk.App()
  const stack = new BetaStack(app, 'TestBeta', {
    env: { account: '123456789012', region: 'us-east-1' },
    environment: 'beta',
  } as any)
  return Template.fromStack(stack)
}

function resource(t: Template, type: string, logicalIdPrefix: string): [string, any] {
  const match = Object.entries(t.findResources(type)).find(([id]) => id.startsWith(logicalIdPrefix))
  if (!match) throw new Error(`${logicalIdPrefix} (${type}) not found in stack`)
  return match
}

const DATA_RESOURCES: Array<[string, string, string]> = [
  ['sessions table (session records)', 'AWS::DynamoDB::Table', 'FluxuryBetaSessionsV2'],
  ['beats table (beat records)', 'AWS::DynamoDB::Table', 'FluxuryBetaBeats'],
  ['files bucket (lyrics, beat audio, artwork)', 'AWS::S3::Bucket', 'FluxuryBetaFiles'],
  ['user pool (accounts)', 'AWS::Cognito::UserPool', 'FluxuryBetaUserPool'],
]

describe('User data survives stack deletion and replacement', () => {
  const t = template()

  it.each(DATA_RESOURCES)('%s is retained', (_label, type, prefix) => {
    const [, r] = resource(t, type, prefix)
    expect(r.DeletionPolicy).toBe('Retain')
    expect(r.UpdateReplacePolicy).toBe('Retain')
  })

  it('nothing in the stack can empty the files bucket', () => {
    const [bucketId, bucket] = resource(t, 'AWS::S3::Bucket', 'FluxuryBetaFiles')

    // CDK's auto-delete handler only empties buckets carrying this tag, and
    // when it runs it deletes every object VERSION, so versioning won't help.
    const tags: Array<{ Key: string }> = bucket.Properties.Tags ?? []
    expect(tags.map((tag) => tag.Key)).not.toContain('aws-cdk:auto-delete-objects')

    const autoDeleters = Object.values(t.findResources('Custom::S3AutoDeleteObjects'))
    const targetsFiles = autoDeleters.some((cr: any) => cr.Properties?.BucketName?.Ref === bucketId)
    expect(targetsFiles).toBe(false)
  })
})

/**
 * Retain only protects against CloudFormation. Deletion protection also blocks
 * a delete from the console, the CLI or a script. User accounts have no backup
 * at all (see RESTORE_RUNBOOK.md section 5), so the pool matters most.
 */
describe('Deletion protection outside CloudFormation', () => {
  const t = template()

  it('user pool (accounts) has deletion protection', () => {
    const [, pool] = resource(t, 'AWS::Cognito::UserPool', 'FluxuryBetaUserPool')
    expect(pool.Properties.DeletionProtection).toBe('ACTIVE')
  })

  it.each([
    ['sessions table', 'FluxuryBetaSessionsV2'],
    ['beats table', 'FluxuryBetaBeats'],
  ])('%s has deletion protection', (_label, prefix) => {
    const [, table] = resource(t, 'AWS::DynamoDB::Table', prefix)
    expect(table.Properties.DeletionProtectionEnabled).toBe(true)
  })
})
