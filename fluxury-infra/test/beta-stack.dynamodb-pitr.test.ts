import { describe, it, expect } from '@jest/globals'
import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { BetaStack } from '../lib/beta-stack'

/**
 * Session and beat records must be recoverable: an overwrite (e.g. autosave writing an empty
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

describe('DynamoDB point-in-time recovery', () => {
  const t = template()

  it.each(['FluxuryBetaSessionsV2', 'FluxuryBetaBeats'])(
    '%s table has point-in-time recovery enabled',
    (prefix) => {
      const table = resource(t, 'AWS::DynamoDB::Table', prefix)
      expect(
        table.Properties.PointInTimeRecoverySpecification?.PointInTimeRecoveryEnabled,
      ).toBe(true)
    },
  )
})
