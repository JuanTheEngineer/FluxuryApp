# Restore Runbook (Fluxury beta)

What to do when a writer's lyrics, sessions or account are lost, overwritten or deleted. Every command here is copy-paste; set the variables in **Setup** first.

**Status of each procedure** (see the drill log at the bottom):

| Situation | Section | Drilled? |
|---|---|---|
| Lyrics overwritten or emptied, session still exists | [1](#1-lyrics-overwritten-or-lost) | ✅ 2026-11-17 (read-only) |
| A session was deleted | [2](#2-a-session-was-deleted) | ✅ lyrics 2026-11-17 (read-only); record: PITR restore drilled 2026-11-17, item copy-back not yet |
| The whole sessions table is damaged | [3](#3-the-sessions-table-is-damaged) | ⚠️ PITR restore drilled 2026-11-17; copy-back not yet |
| The stack was destroyed (`cdk destroy`) | [4](#4-the-stack-was-destroyed) | ❌ untested, rehearse on the dev stack |
| A user account was deleted | [5](#5-user-accounts) | Can't be restored: prevention only |

---

## How the data is protected

| Data | Where | Protection | Window |
|---|---|---|---|
| Lyrics (`sessions/<id>/script.json`), artwork, beat audio | S3 `fluxury-beta-files-728861022483-us-east-1` | Versioning: every save and delete keeps the previous version | Old versions kept **30 days**, then expire |
| Session records (name, beat, owner, pointer to lyrics) | DynamoDB `fluxury-beta-sessions-beta` | Point-in-time recovery (PITR) | Any second in the last **35 days** (enabled 2026-11-16 22:51 EST) |
| Beat records | DynamoDB `fluxury-beta-beats-beta` | PITR | 35 days |
| User accounts | Cognito user pool `us-east-1_kuWjspRvn` (`fluxury-beta-users`) | `Retain` on stack delete + deletion protection | **No backup exists** |

All four are `Retain` in CloudFormation: deleting or replacing the stack leaves them in place. The user pool and both tables also have **deletion protection**, which blocks deletes from the console, CLI or scripts; to delete one on purpose, turn its protection off first. A one-off local copy of the files bucket from 2026-11-17 is in `~/fluxury-backups/files-2026-11-17`.

---

## First five minutes

1. **Don't redeploy** and don't run `cdk destroy` or `cdk deploy` while investigating.
2. **Ask the writer to close the session on every device** (phone, laptop, other tabs) before you restore lyrics. An open copy can save over the restored version. Conditional saves make that copy show a conflict instead of overwriting, but closing it is simpler.
3. **Note the time** the problem happened, as precisely as you can. Every restore below picks a version from before that time.

## Setup

Run once per terminal. Uses your default AWS profile (add `--profile <name>` to the commands if you use another).

```bash
export AWS_REGION=us-east-1
B=fluxury-beta-files-728861022483-us-east-1
T=fluxury-beta-sessions-beta
```

**Find the session id.** By name, for a session that still exists:

```bash
aws dynamodb scan --table-name "$T" \
  --filter-expression "#n = :n" --expression-attribute-names '{"#n":"name"}' \
  --expression-attribute-values '{":n":{"S":"First Project"}}' \
  --query 'Items[].[id.S,name.S,modified.S]' --output text
```

For a deleted session (its record is gone), list recently deleted lyrics files, newest first, and pick by time:

```bash
aws s3api list-object-versions --bucket "$B" --prefix sessions/ \
  --query 'DeleteMarkers[?IsLatest].[LastModified,Key]' --output text | sort -r | head
```

Then:

```bash
ID=<session-id>
K="sessions/$ID/script.json"
```

---

## 1. Lyrics overwritten or lost

The session still exists, but its lyrics are wrong or empty.

**1a. Preview every saved version** (newest first) and pick the last good one:

```bash
F=$(mktemp); for V in $(aws s3api list-object-versions --bucket "$B" --prefix "$K" --query 'Versions[].VersionId' --output text); do
  aws s3api get-object --bucket "$B" --key "$K" --version-id "$V" "$F" --query LastModified --output text | tr '\n' ' '
  echo "$V  $(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); d=d.get('delta',d); print(''.join(o.get('insert','') for o in d['ops'] if isinstance(o.get('insert'),str)).strip().replace(chr(10),' / ')[:60])" "$F")"
done; rm -f "$F"
```

Autosave makes many versions (one every few seconds while typing), so expect a long list. Times are UTC.

**1b. Make that version current.** This copies the old version on top: nothing is deleted, and the bad version stays in history in case you picked wrong.

```bash
V=<version-id>
aws s3api copy-object --bucket "$B" --key "$K" --copy-source "$B/$K?versionId=$V" --query 'VersionId' --output text
```

**1c. Verify:** open the session in the app (a fresh browser or private window, so no local draft interferes). The lyrics should match the preview. A copy that was left open somewhere will show "This session was changed in another tab or on another device"; the writer should choose **Use the latest version**.

---

## 2. A session was deleted

Deleting a session removes its DynamoDB record and puts a delete marker on its files in S3. Both are recoverable for 30 days (S3) and 35 days (DynamoDB).

**2a. Restore the lyrics:** do **1a** and **1b** with the deleted session's `K`. Copying the last version over the delete marker makes the file current again.

**2b. Restore the record** from PITR into a temporary table, then copy that one item back. Pick a restore time just *before* the delete (from the `LastModified` of the delete marker in **Setup**).

```bash
R=fluxury-restore-$(date +%Y%m%d%H%M)
aws dynamodb restore-table-to-point-in-time --source-table-name "$T" --target-table-name "$R" \
  --restore-date-time 2026-11-17T20:35:00Z --query 'TableDescription.TableStatus' --output text
aws dynamodb wait table-exists --table-name "$R"   # can take several minutes; rerun if it times out

aws dynamodb get-item --table-name "$R" --key "{\"id\":{\"S\":\"$ID\"}}" --query Item > item.json
cat item.json   # check it's the right session (name, userId)
aws dynamodb put-item --table-name "$T" --item file://item.json --condition-expression "attribute_not_exists(id)"
```

The condition makes `put-item` refuse to overwrite a record that exists. Then delete the temporary table (the guard stops a typo from touching the live table):

```bash
[[ "$R" == fluxury-restore-* ]] && aws dynamodb delete-table --table-name "$R" --query 'TableDescription.TableStatus' --output text
rm item.json
```

**2c. Verify:** the session appears in the writer's session list with its lyrics.

---

## 3. The sessions table is damaged

Many records are wrong or missing (a bad migration, a buggy Lambda). Restore the whole table to a time before the damage into a temporary table (as in **2b**, without `get-item`), then copy every item back:

```bash
aws dynamodb scan --table-name "$R" --query Items --output json > items.json
python3 - <<'EOF'
import json, subprocess
for item in json.load(open('items.json')):
    subprocess.run(['aws', 'dynamodb', 'put-item', '--table-name', 'fluxury-beta-sessions-beta',
                    '--item', json.dumps(item)], check=True)
print('restored', len(json.load(open('items.json'))), 'items')
EOF
```

This **overwrites** live records with their restored copies. Records created after the restore time are left as they are. Then delete the temporary table as in **2b**. Lyrics live in S3, not this table, so they're unaffected; check them with section **1** if needed.

---

## 4. The stack was destroyed

After `cdk destroy`, the four data resources still exist (they're `Retain`), but they're no longer part of any stack.

**Do not run a plain `cdk deploy` / `./deploy.sh infra`.** It would fail on the tables' and bucket's fixed names, and before failing it would create a **second, empty user pool** (pool names aren't unique), leaving it behind on rollback. If the app ever used that pool, every existing account would stop working.

Instead, put the existing resources back under the stack with `cdk import` (supported by the project's CDK CLI 2.143.0):

1. Synthesize a version of the stack containing **only** the four data resources, with the same logical ids (`FluxuryBetaUserPool`, `FluxuryBetaSessionsV2`, `FluxuryBetaBeats`, `FluxuryBetaFiles`). The stack has no switch for this yet (see BACKLOG).
2. `npx cdk import FluxuryBeta` and enter each physical id when asked: user pool `us-east-1_kuWjspRvn`, tables `fluxury-beta-sessions-beta` and `fluxury-beta-beats-beta`, bucket `fluxury-beta-files-728861022483-us-east-1`.
3. Then a normal `./deploy.sh infra` adds everything else (API, Lambdas, identity pool, frontend).

⚠️ **Untested.** Rehearse it on the dev stack (Release 2) before relying on it.

---

## 5. User accounts

Cognito has **no backup or restore** for user pools. A deleted pool, or a deleted user, is gone; exporting users can't include passwords, so everyone would have to reset. Protection is prevention only: the pool is `Retain` on stack deletion and has deletion protection on. Deleting a single user is still possible (deletion protection covers the pool, not users), so treat `admin-delete-user` as irreversible.

---

## Drills

Run a drill every 3 months and after any change to storage or the stack. A backup nobody has restored from isn't proven.

**Record drill (2b without touching live data):** restores the table to a temporary copy, compares item counts, and deletes the copy.

```bash
R=fluxury-drill-$(date +%Y%m%d%H%M)
aws dynamodb restore-table-to-point-in-time --source-table-name "$T" --target-table-name "$R" --use-latest-restorable-time --query 'TableDescription.TableStatus' --output text
aws dynamodb wait table-exists --table-name "$R"
echo "live: $(aws dynamodb scan --table-name "$T" --select COUNT --query Count --output text)  restored: $(aws dynamodb scan --table-name "$R" --select COUNT --query Count --output text)"
[[ "$R" == fluxury-drill-* ]] && aws dynamodb delete-table --table-name "$R" --query 'TableDescription.TableStatus' --output text
```

### Drill log

| Date | What | Result |
|---|---|---|
| 2026-11-17 | Section 1a (read-only): recovered the last saved lyrics of deleted session `9e13aa09…` from S3 version history | ✅ `test bar 1794947687623 more`, correct `{ delta, editTimestamp }` format; live file correctly 404 |
| 2026-11-17 | Setup commands (find by name, list deleted sessions) and the 1a preview loop, run verbatim | ✅ |
| 2026-11-17 | Record drill: PITR restore of `fluxury-beta-sessions-beta` (latest restorable time) into a temporary table, counts compared, temporary table deleted | ✅ live 3 / restored 3; temporary table confirmed gone. Restore took a few minutes |
