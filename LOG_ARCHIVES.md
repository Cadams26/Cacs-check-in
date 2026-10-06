# Owner log archives

Alpha 0.17 replaces individual log deletion with **Create dated backup**, then **Email & clear completed logs**. The CSV includes name, role, status, destination, intent, key use, checkout note, record ID and timestamps.

The backend requires the existing owner user ID `a9rnjyz6g54spr1`. Role labels and the UI PIN grant no archive permission. SMTP credentials stay in PocketBase settings. The sender and two recipients are private server configuration in `/pb_data/archive-settings.json`, outside the public repository and webroot. Format: `{"sender":"sender@example.com","recipients":["administrator@example.com","principal@example.com"]}`. Protect this file with mode 0600.

## Durable backups

Files are saved under PocketBase's persistent data directory at `log_archives/cacs-logs-<UTC timestamp>-<random suffix>.csv` and `.json`. On this Unraid server the directory is `/mnt/user/appdata/rfe-app/pb_data/log_archives`, outside the frontend webroot. Files are owner-readable only. CSV is spreadsheet-safe; JSON includes original record IDs and all exported fields for recovery. SHA-256 checks and file readback must pass before sending or clearing.

Only records whose status is `Checked Out` enter a batch. Active sessions and records created later are untouched. Changes to any backed-up record stop the operation. Deletion rechecks all rows inside a single transaction; failure rolls back deletion. The original snapshot remains available in Admin after clearing.

Each email must be accepted by the configured SMTP server before clearing. SMTP acceptance does not prove inbox delivery. Successfully sent recipients are recorded so ordinary retries skip them. A crash between mail acceptance and saving that receipt can produce a duplicate email on retry; SMTP cannot provide exactly-once delivery.

## Operation and recovery

One pending archive is reused until completed. All archive routes require owner authentication; downloads use an Authorization header, never a token in the URL. A filesystem lock rejects overlapping prepare/finish operations. After a process crash, an operator must inspect the archive state and remove only the stale `operation.lock` directory before retrying. Never remove a lock while a request is running.

If a backed-up row is edited after preparation, keep the pending backup for review. An operator can retain the CSV and JSON outside the archive directory, then move that pending batch out of the active archive directory to allow a fresh snapshot. Do not change its hashes to force clearing.

Recovery is manual: download the JSON recovery backup, inspect `records`, then restore missing records through a PocketBase administrator using the original collection fields and IDs. Never overwrite existing records blindly. The UI does not automatically import backups.

## Deployment

These hooks target PocketBase **0.19.2**. Mount `pb_hooks` at `/pb_hooks` or pass `--hooksDir=/pb_data/pb_hooks` when starting PocketBase. Restart only the RFE backend after installing the hooks; no schema migration is needed. For the existing container a `/pb_hooks` symlink to `/pb_data/pb_hooks` works across stop/start and power cycles. If the container is recreated or its image updated, restore that mount or flag; the symlink is part of its writable container layer.

Lock the `logs` collection's ordinary delete rule to administrator-only (`null`), so app users cannot bypass the archive workflow with individual API deletions. Hook deletion uses the owner-checked server DAO. Existing list/create/update rules are unchanged by this feature.

Run `node verify-archives.cjs` for failure-path tests. Live testing must not confirm **Email & clear** on real data without the user's at-action confirmation. Creating a backup alone sends no email and deletes nothing.
