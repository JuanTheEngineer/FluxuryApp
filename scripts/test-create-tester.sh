#!/bin/bash
#
# Tests for create-tester.sh with a fake `aws` command (no real accounts).
# Run: ./scripts/test-create-tester.sh

set -u
SRC="$(cd "$(dirname "$0")" && pwd)/create-tester.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Throwaway layout: scripts/create-tester.sh + fluxury-infra/cdk-outputs-beta.json
mkdir -p "$WORK/repo/scripts" "$WORK/repo/fluxury-infra" "$WORK/bin"
cp "$SRC" "$WORK/repo/scripts/"
echo '{"FluxuryBeta":{"UserPoolId":"us-east-1_TESTPOOL"}}' > "$WORK/repo/fluxury-infra/cdk-outputs-beta.json"

# Fake aws: records each call; STUB_EXISTING_USER / STUB_EXISTING_EMAIL simulate taken accounts
cat > "$WORK/bin/aws" <<'EOF'
#!/bin/bash
echo "$*" >> "$AWS_LOG"
case "$2" in
  admin-get-user) [[ -n "${STUB_EXISTING_USER:-}" ]] && { echo '{}'; exit 0; } || { echo "UserNotFoundException" >&2; exit 254; } ;;
  list-users) [[ -n "${STUB_EXISTING_EMAIL:-}" ]] && echo "someone" || echo "" ;;
  *) echo '{}' ;;
esac
EOF
chmod +x "$WORK/bin/aws"

pass=0; fail=0
run() { # <expected exit> <description> <args...>; sets OUT and LOG
  local want="$1" name="$2"; shift 2
  export AWS_LOG="$WORK/aws.log"; : > "$AWS_LOG"
  OUT="$(PATH="$WORK/bin:$PATH" "$WORK/repo/scripts/create-tester.sh" "$@" 2>&1)"; local code=$?
  LOG="$(cat "$AWS_LOG")"
  if [[ "$code" == "$want" ]]; then return 0; fi
  echo "  ✗ $name (exit $code, wanted $want)"; echo "$OUT" | sed 's/^/      /'; fail=$((fail + 1)); return 1
}
ok() { echo "  ✓ $1"; pass=$((pass + 1)); }
bad() { echo "  ✗ $1"; echo "$OUT" | sed 's/^/      /'; echo "$LOG" | sed 's/^/      aws /'; fail=$((fail + 1)); }

echo "create-tester.sh"

if run 0 "creates an account" marcus Marcus@Example.com; then
  pw="$(echo "$OUT" | sed -n 's/^  Password: //p')"
  create="$(grep admin-create-user <<<"$LOG")"; setpw="$(grep admin-set-user-password <<<"$LOG")"
  [[ "$create" == *"--user-pool-id us-east-1_TESTPOOL"* && "$create" == *"--username marcus"* && "$create" == *"--message-action SUPPRESS"* \
     && "$create" == *"Name=email,Value=marcus@example.com"* && "$create" == *"Name=email_verified,Value=true"* ]] \
    && ok "creates it in the pool from cdk-outputs, no Cognito email, email lowercased and verified" || bad "admin-create-user call"
  [[ "$setpw" == *"--password $pw --permanent"* ]] && ok "sets the printed password as permanent" || bad "admin-set-user-password call"
  [[ "$pw" =~ ^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$ && "$pw" =~ [2-9] && "$pw" =~ [a-z] && ! "$pw" =~ [01oli] ]] \
    && ok "password meets the pool policy and avoids look-alike characters ($pw)" || bad "password format: $pw"
  grep -q "https://www.fluxury.app" <<<"$OUT" && ok "prints a message ready to send" || bad "message"
fi

run 0 "second account" marcus m@x.co >/dev/null && pw2="$(echo "$OUT" | sed -n 's/^  Password: //p')"
[[ -n "${pw:-}" && "$pw" != "${pw2:-}" ]] && ok "generates a different password each time" || bad "passwords repeat"

if STUB_EXISTING_USER=1 run 1 "existing username" marcus marcus@example.com; then
  grep -q "already exists" <<<"$OUT" && ! grep -q "admin-set-user-password" <<<"$LOG" \
    && ok "refuses an existing username without touching its password" || bad "existing username"
fi
if STUB_EXISTING_EMAIL=1 run 1 "existing email" newname taken@example.com; then
  grep -q "already belongs" <<<"$OUT" && ! grep -q "admin-create-user" <<<"$LOG" \
    && ok "refuses an email that already has an account" || bad "existing email"
fi
run 1 "bad username" "has space" a@b.co && [[ -z "$LOG" ]] && ok "rejects an invalid username before calling AWS" || true
run 1 "bad email" marcus not-an-email && [[ -z "$LOG" ]] && ok "rejects an invalid email before calling AWS" || true
run 1 "no args" && grep -q usage <<<"$OUT" && ok "shows usage without arguments" || true

echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
