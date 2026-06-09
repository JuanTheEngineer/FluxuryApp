import { ResourcesConfig } from "@aws-amplify/core";

const awsExports: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || 'us-east-1_fwsCeebLa',
      userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID || '3iu3p4skol810aivmds285uj10',
    }
  }
}

export default awsExports