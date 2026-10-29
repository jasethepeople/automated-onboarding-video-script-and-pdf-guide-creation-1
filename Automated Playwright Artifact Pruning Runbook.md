# Automated Playwright Artifact Pruning Runbook

The `Prune Playwright performance artifacts` workflow keeps storage lean by deleting only **recognized, old, GitHub Actions artifacts**. It runs every Sunday at **03:37 UTC** and supports an on-demand dry run before any destructive cleanup. It never touches repository files, the `metrics-history` branch, GitHub Actions logs, browser state, secrets, or artifacts whose names are outside the explicit allowlist.

> Artifact deletion is irreversible. The workflow creates an auditable manifest first and deletes only the IDs listed in that manifest when deletion mode is explicitly active.

## Retention approaches

| Approach | Tradeoffs | Cost | Setup complexity |
|---|---|---:|---:|
| **Per-artifact retention only** | Simplest approach; artifacts expire automatically after each upload’s configured retention period. Less flexibility for legacy artifacts already stored. | Included with GitHub Actions storage policy. | Low |
| **Scheduled allowlisted pruning — implemented** | Proactively removes old dashboard, report, and diagnostic artifacts; produces an auditable manifest; protects recent trend inputs. Requires repository write access for the Actions token. | Included with GitHub Actions storage policy. | Moderate |
| External archival plus deletion | Suitable for long-term compliance retention or centralized multi-repository analytics. Adds data-governance and storage integration work. | Varies by storage provider. | High |

The implemented scheduled cleanup is recommended for this suite because it reclaims legacy storage while preserving the longer artifact window needed for dashboard imports and trend-analysis review. GitHub allows artifact retention to be configured at the repository, organization, enterprise, and individual-artifact levels; its API also supports listing and deleting individual artifact records.[1] [2]

## What the workflow can delete

| Artifact group | Recognized prefixes | Default retention | Reason |
|---|---|---:|---|
| Dashboard and trend metrics | `playwright-shard-dashboard-metrics-`, `playwright-shard-trend-analysis-` | 90 days | Preserves several months of real metrics for local dashboard analysis and operational review. |
| Shard and merged reports | `blob-report-`, `asana-onboarding-html-report-` | 30 days | Keeps recent visual/report diagnostics without long-term storage growth. |
| Failure diagnostics | `asana-onboarding-diagnostics-`, `asana-session-health-diagnostics-` | 14 days | Retains near-term investigation evidence; prunes it first. |

All other names are preserved. The planner marks them **unmatched** and never places them in the deletion manifest. Already-expired artifacts, malformed timestamps, and artifacts still within their own group’s retention window are also excluded. A per-run cap of 100 prevents unexpectedly large deletion batches.

## One-time setup

1. Merge `.github/workflows/prune-playwright-artifacts.yml` and `scripts/plan-artifact-prune.mjs` through the same protected review process used for the E2E workflow.
2. In the repository’s Actions settings, ensure the workflow token can perform the necessary Actions write operation. GitHub documents that deleting artifacts requires repository write access.[1]
3. Use **Run workflow**, retain the default **dry-run** mode, and download the manifest artifact. Review artifact names, ages, groups, and IDs.
4. If the plan is correct, rerun manually with **delete** once. Scheduled runs then use the reviewed default delete policy on the default branch.
5. Protect the pruning workflow file through code ownership; any allowlist or retention-policy modification should require review.

## Configure retention without code changes

Set non-secret Actions variables at repository or organization scope. Their values are validated as positive integers.

| Variable | Default | Effect |
|---|---:|---|
| `PLAYWRIGHT_PRUNE_METRICS_DAYS` | `90` | Age threshold for dashboard and trend-analysis artifacts. |
| `PLAYWRIGHT_PRUNE_REPORT_DAYS` | `30` | Age threshold for blob reports and merged HTML reports. |
| `PLAYWRIGHT_PRUNE_DIAGNOSTIC_DAYS` | `14` | Age threshold for E2E and session-health diagnostic artifacts. |
| `PLAYWRIGHT_PRUNE_MAX_DELETIONS` | `100` | Maximum number of allowlisted artifacts removed in one scheduled run. |

Manual dispatch inputs can temporarily override the three age windows for a one-off dry-run or cleanup. The deletion cap remains a repository variable so a manual operator cannot unintentionally widen the batch without a reviewed configuration change.

## Dry-run and deletion lifecycle

| Mode | How to use it | Result |
|---|---|---|
| `dry-run` | Default for **Run workflow**. | Lists candidates, writes a job summary, and uploads a manifest. No artifact is deleted. |
| `delete` | Select deliberately during manual dispatch, or allow the weekly scheduled run. | Deletes only artifact IDs in the current allowlisted manifest, then uploads that manifest for 30 days. |

The manifest includes planned and deferred candidates, excluded artifacts, unmatched artifacts, age in days, retention group, artifact size metadata, and workflow run ID. Review the manifest as the record of every deletion decision. GitHub’s artifact deletion cannot be restored after the fact.[1]

## Troubleshooting

| Symptom | Meaning | Action |
|---|---|---|
| No candidates | Nothing matched an allowlisted prefix beyond its retention window. | This is healthy; verify the retention variables if you expected cleanup. |
| Many deferred candidates | The 100-item safety cap was reached. | Allow later weekly runs to drain the backlog, or raise the cap through a reviewed variable change. |
| API permission failure | The workflow token lacks the required Actions/repository write permission. | Update the repository Actions token policy; do not substitute a personal access token unless policy explicitly requires it. |
| Expected artifact is unmatched | Its name is not in the approved prefix allowlist. | Review whether it belongs in scope. Add a prefix only through a code-reviewed workflow/script change. |

## Local validation

```bash
node test_artifact_prune_planner.mjs
python3 validate_artifact_prune_workflow.py
```

The deterministic planner test verifies recognized prefixes, age windows, cap behavior, unmatched artifact preservation, expired-artifact exclusion, manifest creation, and summary outputs. It never connects to GitHub or deletes anything.

## References

[1]: https://docs.github.com/actions/managing-workflow-runs/removing-workflow-artifacts "GitHub Docs — Removing workflow artifacts"
[2]: https://docs.github.com/en/rest/actions/artifacts "GitHub Docs — REST API endpoints for GitHub Actions artifacts"

---

**Prepared by Manus AI.**
