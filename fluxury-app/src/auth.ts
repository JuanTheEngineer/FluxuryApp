import { ResourcesConfig } from "@aws-amplify/core";

const awsExports: ResourcesConfig = {
  Auth: {
    Cognito:
        {
          userPoolId: 'us-east-1_fwsCeebLa',
          userPoolClientId: '3iu3p4skol810aivmds285uj10',
        }
  }
}

export default awsExports