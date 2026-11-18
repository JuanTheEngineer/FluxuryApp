import { describe, it, expect } from '@jest/globals'
import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { BetaStack } from '../lib/beta-stack'

/**
 * How long someone stays signed in without opening the app. After this, the
 * refresh token is rejected (400 "Invalid Refresh Token") and they must sign
 * in again. 14 days chosen 2026-11-17: a writer who's away a week or two
 * shouldn't be signed out, without leaving a lost phone signed in for a month.
 */
const STAY_SIGNED_IN_DAYS = 14

describe('Sign-in duration', () => {
  const app = new cdk.App()
  const stack = new BetaStack(app, 'TestBeta', {
    env: { account: '123456789012', region: 'us-east-1' },
    environment: 'beta',
  } as any)
  const clients = Object.values(Template.fromStack(stack).findResources('AWS::Cognito::UserPoolClient'))

  it(`refresh tokens last ${STAY_SIGNED_IN_DAYS} days`, () => {
    expect(clients).toHaveLength(1)
    const { RefreshTokenValidity, TokenValidityUnits } = (clients[0] as any).Properties
    const minutesPerUnit: Record<string, number> = { minutes: 1, hours: 60, days: 1440 }
    const unit = TokenValidityUnits?.RefreshToken ?? 'days' // CloudFormation's default unit
    expect(RefreshTokenValidity * minutesPerUnit[unit]).toBe(STAY_SIGNED_IN_DAYS * 1440)
  })
})
