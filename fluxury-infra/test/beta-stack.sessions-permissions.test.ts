import { describe, it, expect } from '@jest/globals'
import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { BetaStack } from '../lib/beta-stack'

/**
 * Deleting a session lists and deletes its files under sessions/<id>/. Without
 * these permissions the cleanup fails silently (it is logged, not surfaced).
 */
function sessionsLambdaS3Actions(): string[] {
  const app = new cdk.App()
  const stack = new BetaStack(app, 'TestBeta', {
    env: { account: '123456789012', region: 'us-east-1' },
    environment: 'beta',
  } as any)
  const t = Template.fromStack(stack)

  const fn = Object.entries(t.findResources('AWS::Lambda::Function'))
    .find(([id]) => id.startsWith('SessionsFunction'))
  if (!fn) throw new Error('SessionsFunction not found')
  const roleId = (fn[1] as any).Properties.Role['Fn::GetAtt'][0]

  return Object.values(t.findResources('AWS::IAM::Policy'))
    .filter((p: any) => p.Properties.Roles?.some((r: any) => r.Ref === roleId))
    .flatMap((p: any) => p.Properties.PolicyDocument.Statement)
    .flatMap((s: any) => (Array.isArray(s.Action) ? s.Action : [s.Action]))
    .filter((a: string) => a.startsWith('s3:'))
}

const allows = (actions: string[], wanted: string) =>
  actions.some((a) => a === wanted || (a.endsWith('*') && wanted.startsWith(a.slice(0, -1))))

describe('Sessions Lambda S3 permissions (session delete cleanup)', () => {
  const actions = sessionsLambdaS3Actions()

  it.each(['s3:ListBucket', 's3:DeleteObject'])('allows %s', (action) => {
    expect(allows(actions, action)).toBe(true)
  })
})
