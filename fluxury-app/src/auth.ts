import { ResourcesConfig } from "@aws-amplify/core";

// Every .env.<mode> sets these; main.ts refuses to start in real mode if any
// is missing. No fallback ids: they used to point at the retired April 2025
// prototype pool, which a mis-configured build would have used silently.
const awsExports: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
      userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID ?? '',
      identityPoolId: import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID ?? '',
    }
  }
}

export default awsExports
