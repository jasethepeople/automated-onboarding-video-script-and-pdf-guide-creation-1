# Slack and Email Notifications for Artifact Pruning

The pruning workflow now supports optional notifications when it **deletes one or more allowlisted artifacts** or when a pruning step **fails**. Notifications contain only aggregate operational metadata: repository, mode, scanned count, deletion count, planned size metadata, error summary, and a link to the GitHub Actions run. They never contain artifact names, browser state, cookies, secrets, logs, traces, or deletion-manifest contents.

## Delivery choices

| Approach | Tradeoffs | Cost | Setup complexity |
|---|---|---:|---:|
| **Slack incoming webhook — recommended for operations** | Fast team visibility in a fixed channel. A webhook is channel-specific and must be treated as a secret. | Usually included with Slack workspace/app policy. | Low |
| **Resend transactional email** | Reaches on-call or email-only recipients; requires a verified sending identity and API key. | Depends on Resend plan. | Moderate |
| GitHub Actions summary and manifest only | No external secret or setup. Team members must visit the workflow run. | None beyond existing GitHub Actions usage. | Lowest |

The workflow supports the first two paths concurrently. If no notification credentials are configured, pruning still runs normally and safely records `slack-not-configured` and `email-not-configured` in the job summary.

> The currently available Manus-side Slack, Gmail, and Resend integrations are disabled. The workflow does **not** use or require those integrations; it uses GitHub repository secrets directly, which is the correct credential boundary for an automated GitHub Actions workflow.

## Notification triggers

| Event | Slack | Email | Message content |
|---|---:|---:|---|
| Manual dry run | No | No | Review the GitHub job summary and manifest locally; no notification is sent. |
| Scheduled/manual delete run with zero candidates | No | No | No action occurred. |
| Scheduled/manual delete run with planned candidates and successful deletion | Yes, if configured | Yes, if configured | Aggregate deletion confirmation and run URL. |
| Artifact retrieval, plan, deletion, or workflow error | Yes, if configured | Yes, if configured | Aggregate failure alert and run URL. |
| Notification transport failure | Attempted channel reports an error in the job summary | Same | It does not mask the original pruning outcome. |

## Configure Slack

Create or reuse a Slack app, enable **Incoming Webhooks**, add a workspace webhook for the operations channel, and authorize it. Slack documents that an incoming webhook accepts a JSON POST payload and that its URL is a secret that must not be committed or shared.[1]

In GitHub repository settings, open **Secrets and variables → Actions → Secrets** and create:

```text
SLACK_PRUNE_WEBHOOK_URL
```

Set its value to the channel-specific Slack incoming webhook URL. Do not place the URL in a repository variable, workflow YAML, issue, artifact, or log.

The workflow posts a concise text payload through the configured webhook. Slack incoming webhooks post to the channel configured for the webhook; the workflow does not attempt to override the destination.

## Configure email through Resend

Create these GitHub Actions values:

| Location | Name | Value |
|---|---|---|
| **Secret** | `RESEND_API_KEY` | Resend API key. |
| **Variable** | `PRUNE_NOTIFICATION_EMAIL_FROM` | Authorized sender, such as `CI Operations <ci@example.com>`. |
| **Variable** | `PRUNE_NOTIFICATION_EMAIL_TO` | One or more comma-separated recipients. |

Resend’s send-email API requires a `from` sender, recipient `to` address or list, and `subject`; it accepts a plain-text message and Bearer API authentication.[2] The workflow sends only the aggregate message described above.

If any one of the three email values is present but the set is incomplete, the notifier records a clear configuration error in the job summary and does not attempt a malformed delivery. Configure all three together.

## Verify safely

1. Run **Prune Playwright performance artifacts** manually with **dry-run** first. Confirm that no notification is sent.
2. To test a success notification without deleting valuable production artifacts, run a reviewed delete operation only after the generated manifest contains a safe, expendable candidate. The success notifier runs only after a delete-mode plan has eligible IDs.
3. To test failure alerts, use a temporary controlled configuration error in a separate branch or a dedicated test repository; do not intentionally break the production cleanup workflow.
4. Check the job’s **Artifact-pruning notification delivery** summary section. It shows only channel outcome labels, never secret values.

## Security boundary

The Slack webhook URL and Resend key are injected only into the two notification steps. Both notification steps use `continue-on-error: true`, so a delivery outage does not turn a successful pruning run into a failed cleanup, and it cannot obscure an already-failed prune. Rotate a Slack webhook immediately if it is exposed; Slack may revoke leaked webhooks.[1]

## References

[1]: https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks "Slack Developer Docs — Sending messages using incoming webhooks"
[2]: https://resend.com/docs/api-reference/emails/send-email "Resend Docs — Send Email"

---

**Prepared by Manus AI.**
