param (
  [string]$account,
  [string]$region,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$extraArgs
)

if (!$account -or !$region) {
    Write-Error "❌ Provide account and region as first two args."
    Write-Host "   Example: .\cdk-deploy-to.ps1 123456789012 us-east-1"
    exit 1
}

$env:CDK_DEPLOY_ACCOUNT = $account
$env:CDK_DEPLOY_REGION = $region

Write-Host "🚀 Deploying to account $account in region $region..."
npx cdk deploy @extraArgs
exit $LASTEXITCODE