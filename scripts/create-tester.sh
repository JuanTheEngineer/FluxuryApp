#!/bin/bash
#
# Create a Fluxury beta account for a tester (accounts are admin-created
# during the beta; there's no sign-up). Prints a generated password for you to
# send them privately. Cognito sends no email.
#
# Usage:  ./scripts/create-tester.sh <username> <email>
#   e.g.  ./scripts/create-tester.sh marcus marcus@example.com
#
# They sign in with the username or the email. They can't change the password
# in the app yet (see BACKLOG); to reset it, run:
#   aws cognito-idp admin-set-user-password --user-pool-id <pool> --username <u> --password <new> --permanent

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUTS="$ROOT_DIR/fluxury-infra/cdk-outputs-beta.json"
REGION="${AWS_REGION:-us-east-1}"

die() { echo "✗ $*" >&2; exit 1; }

[[ $# -eq 2 ]] || die "usage: $0 <username> <email>"
USERNAME="$1"
EMAIL="$(echo "$2" | tr '[:upper:]' '[:lower:]')"

[[ "$USERNAME" =~ ^[a-zA-Z0-9._-]{3,32}$ ]] || die "username must be 3-32 characters: letters, numbers, . _ -"
[[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "that doesn't look like an email address: $EMAIL"

[[ -f "$OUTPUTS" ]] || die "missing $OUTPUTS (run ./deploy.sh infra once)"
POOL="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['FluxuryBeta']['UserPoolId'])" "$OUTPUTS")"

# Never overwrite an existing account's password
if aws cognito-idp admin-get-user --region "$REGION" --user-pool-id "$POOL" --username "$USERNAME" >/dev/null 2>&1; then
  die "an account named '$USERNAME' already exists"
fi
existing="$(aws cognito-idp list-users --region "$REGION" --user-pool-id "$POOL" \
  --filter "email = \"$EMAIL\"" --query 'Users[].Username' --output text)"
[[ -z "$existing" || "$existing" == "None" ]] || die "$EMAIL already belongs to account '$existing'"

# 4 groups of 4 from an unambiguous alphabet (no 0/o, 1/l/i), at least one
# digit and one letter: meets the pool policy (8+, lowercase, number).
PASSWORD="$(python3 - <<'EOF'
import secrets
letters, digits = 'abcdefghjkmnpqrstuvwxyz', '23456789'
while True:
    chars = [secrets.choice(letters + digits) for _ in range(16)]
    if any(c in digits for c in chars) and any(c in letters for c in chars):
        break
print('-'.join(''.join(chars[i:i + 4]) for i in range(0, 16, 4)))
EOF
)"

aws cognito-idp admin-create-user --region "$REGION" --user-pool-id "$POOL" \
  --username "$USERNAME" --message-action SUPPRESS \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true >/dev/null
aws cognito-idp admin-set-user-password --region "$REGION" --user-pool-id "$POOL" \
  --username "$USERNAME" --password "$PASSWORD" --permanent >/dev/null

cat <<EOF
✓ Created a Fluxury beta account.

Send this to them privately (a DM, not a group chat):

  Fluxury beta: https://www.fluxury.app
  Username: $USERNAME   (or sign in with $EMAIL)
  Password: $PASSWORD
EOF
