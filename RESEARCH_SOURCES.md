# External Reference Findings

## GitHub Actions

GitHub documents that default environment variables are available on every workflow runner, including identifiers and context values used by the metrics exporter (`GITHUB_RUN_ID`, `GITHUB_RUN_NUMBER`, `GITHUB_WORKFLOW`, `GITHUB_REF_NAME`, `GITHUB_EVENT_NAME`, `GITHUB_SERVER_URL`, and `GITHUB_REPOSITORY`). These are non-secret workflow context fields and are used only to construct safe run metadata.

GitHub documents that workflow artifacts can upload files/directories with configurable retention periods. The implementation uses artifacts for individual shard metrics, merged dashboard metrics, diagnostics, and trend-analysis outputs. The documentation also emphasizes least privilege, masking transformed secret values, reviewing secret handling, and granting write permissions only where a job requires them. The trend history publisher limits `contents: write` and `issues: write` to the no-secret merge/trend job; all browser-state materialization remains in the protected E2E shard jobs.

GitHub documents that scheduled workflow notifications are associated with the user who created or last modified the schedule. The session-monitor implementation therefore uses a deduplicated GitHub issue rather than relying solely on a personal scheduled-run notification.

Sources:

- https://docs.github.com/en/actions/reference/workflows-and-actions/variables
- https://docs.github.com/actions/security-guides/using-secrets-in-github-actions
- https://docs.github.com/en/actions/reference/security/secure-use
- https://docs.github.com/en/actions/tutorials/store-and-share-data
- https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs
- https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions

## Playwright

Playwright documents that test sharding uses `--shard=x/y`; separate CI jobs can execute shards in parallel. With `fullyParallel: true`, tests can be balanced at individual-test granularity, whereas without it sharding is file-based. Blob reports are designed for shard report merging, and the JSON reporter produces an object containing test-run information suitable for custom metrics extraction. The implementation preserves the blob reporter for merged HTML reports and adds the JSON reporter for safe counts/retry extraction.

Playwright documents that workers cannot share in-memory state and that parallel tests should be independent, use unique backend data, and avoid relying on other tests’ side effects. The shardable onboarding test file therefore creates uniquely named projects and tasks per test; the original connected narrative remains in a separate serial project.

Sources:

- https://playwright.dev/docs/test-sharding
- https://playwright.dev/docs/test-parallel
- https://playwright.dev/docs/test-reporters

## GitHub Actions job summaries

GitHub documents that workflow steps can write GitHub Flavored Markdown to the file identified by `GITHUB_STEP_SUMMARY`, and GitHub renders that content in the workflow-run summary. The trend extension therefore writes a threshold table plus Unicode sparklines directly to this file. Unicode sparklines avoid an external chart service or image-hosting dependency; the complete interactive visual remains available in the local Shard Observatory dashboard.

Source:

- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

## GitHub Actions artifact pruning

GitHub documents that artifact deletion is irreversible and requires repository write access. Artifact retention can be set at repository, organization, enterprise, or individual-artifact level. The Actions REST API supports repository-wide artifact listing, exposes artifact metadata such as `id`, `name`, `size_in_bytes`, `created_at`, `expires_at`, `expired`, and workflow-run context, and supports deletion by artifact ID through `DELETE /repos/{owner}/{repo}/actions/artifacts/{artifact_id}`.

The scheduled pruning implementation first lists all artifacts, plans only allowlisted prefix matches older than a validated group retention window, writes an audit manifest, and then deletes only manifest IDs when deletion mode is active. All unmatched prefixes are preserved by design.

Sources:

- https://docs.github.com/actions/managing-workflow-runs/removing-workflow-artifacts
- https://docs.github.com/en/rest/actions/artifacts

## Slack and email notifications

Slack documents that incoming webhooks accept a JSON POST payload and are associated with a user-selected channel. A webhook URL is secret material and should not be committed or exposed; Slack may revoke leaked webhook URLs. The pruning workflow injects its Slack URL only as a GitHub Actions secret in the notification steps.

Resend documents a send-email API at `POST https://api.resend.com/emails` using Bearer API authentication. The message requires a sender, recipient list, and subject, with plain text supported. The pruning workflow therefore uses a GitHub Actions secret for the Resend key and non-secret GitHub Actions variables for the approved sender and recipient list.

Sources:

- https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks
- https://resend.com/docs/api-reference/emails/send-email

## GitHub CLI token scopes for all-feature configuration

The all-feature configuration command operates at the **repository and environment** scope. GitHub’s REST documentation states that classic personal access tokens use the `repo` scope for repository Actions secrets and variables. Organization-wide secrets or variables additionally require `admin:org` and, for private repositories, `repo`. The GitHub CLI documentation states that classic tokens supplied to `gh auth login --with-token` require `repo`, `read:org`, and `gist`; it cautions that fine-grained tokens used with `--with-token` can behave confusingly and recommends `GH_TOKEN` for fine-grained-token usage.

Sources:

- https://docs.github.com/en/rest/actions/secrets
- https://docs.github.com/en/rest/actions/variables
- https://cli.github.com/manual/gh_auth_login
