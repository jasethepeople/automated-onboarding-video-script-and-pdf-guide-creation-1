# Sharding the Asana Onboarding Suite Across GitHub Actions Runners

The onboarding suite now separates a **serial narrative flow** from **independent shardable checks**. This is necessary because the original tutorial test shares a project URL and created data across sequential steps; dividing that single story across runners would break its assumptions. The new `asana-onboarding-sharded.spec.ts` file gives every test its own uniquely named project and task, allowing Playwright to distribute the checks safely.

> Use the shardable project for normal protected-branch CI speed. Retain the serial project as an optional connected-flow smoke test for release validation or scheduled deep checks.

## Why this design is safe

| Test project | Test style | Can run in multiple shards? | Data strategy |
|---|---|---:|---|
| `session-setup` | Auth prerequisite | Yes; it runs once per shard as a dependency. | Reads state only; creates no SaaS data. |
| `chromium-onboarding` | Original connected tutorial narrative | No | Tests share the one project created by the preceding step. |
| `chromium-onboarding-sharded` | Independent onboarding checks | **Yes** | Each test derives a unique project name from its test ID, shard index, and random suffix. |

Playwright workers cannot share in-memory state, and its guidance recommends keeping tests independent and using unique backend data when tests run in parallel.[2] The sharded suite follows that model: a project made by one test is not read, updated, or expected by another test.

## Two-runner matrix

The updated `.github/workflows/asana-onboarding-e2e.yml` uses this matrix:

```yaml
strategy:
  fail-fast: false
  matrix:
    shardIndex: [1, 2]
    shardTotal: [2]
```

Each GitHub Actions job receives one command:

```bash
npx playwright test \
  --project=chromium-onboarding-sharded \
  --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}
```

With `fullyParallel: true` enabled only for `chromium-onboarding-sharded`, Playwright can split the six independent tests at test level rather than assigning the entire file to one runner.[1] The current distribution is balanced as follows:

| Runner | Session prerequisite | Independent onboarding checks |
|---|---:|---|
| Shard 1/2 | 1 | SHARD-01 through SHARD-03 |
| Shard 2/2 | 1 | SHARD-04 through SHARD-06 |

Each shard uses the same protected test-account session secret but runs in an isolated GitHub-hosted environment. The unique generated project names prevent test-data collision. The workflow retains `fail-fast: false`, so a first-shard failure does not cancel the other shard and erase useful diagnostics.

## Adjusting shard count

For the current six independent checks, use **two shards** as the default. Move to three shards when the test suite grows or each test becomes materially slower. Four or more shards are usually inefficient until the test count and runtime are substantially larger, because every runner repeats dependency installation, browser installation, and the session-health prerequisite.

| Shard count | Appropriate when | Trade-off |
|---:|---|---|
| 1 | Local debugging, serial test story, or lowest CI cost | No cross-runner speedup. |
| 2 | Current six-test onboarding suite | Best practical balance of setup cost and wall-clock reduction. |
| 3–4 | Expanded independent suite or long-running browser tests | More parallelism, but each runner repeats setup and consumes more CI capacity. |

To move from two to three shards, make the paired changes below:

```yaml
matrix:
  shardIndex: [1, 2, 3]
  shardTotal: [3]
```

No code change is required in the shardable test file. Do not shard the serial `chromium-onboarding` project unless it is refactored so every test creates all its own prerequisites.

## Merged report and diagnostics

Under CI, `playwright.config.ts` emits a blob report in `blob-report/` for every runner. Each shard uploads it with a unique artifact name. The `merge-reports` job downloads the two artifacts and executes:

```bash
npx playwright merge-reports --reporter html all-blob-reports
```

The resulting HTML report is uploaded for 14 days. This follows Playwright’s documented pattern for blob reporters, matrix shards, and post-shard HTML report merging.[1] Failure diagnostics remain shard-specific and exclude all browser storage-state files.

## Commands for local verification

Listing the tests assigned to each shard does not require an authenticated SaaS session:

```bash
npx playwright test --project=chromium-onboarding-sharded --shard=1/2 --list
npx playwright test --project=chromium-onboarding-sharded --shard=2/2 --list
```

A live local test run still requires the approved session state:

```bash
export ASANA_STORAGE_STATE=.asana_auth.json
export ASANA_TEST_WORKSPACE_URL=https://app.asana.com/0/home
export PLAYWRIGHT_SHARD_INDEX=1
npx playwright test --project=chromium-onboarding-sharded --shard=1/2
```

## Operational safeguards

The matrix retains the existing protected-environment design. The browser session secret is unavailable to pull requests and is materialized independently on each protected `main` shard. The existing session-setup dependency runs before the shard’s tests; if it fails, that shard creates no project data. The merge-report job does not receive a session secret.

Do not use shared fixed project names, shared tasks, shared output paths, or module-level created-resource URLs in shardable tests. Any test that depends on another test’s side effect belongs in the serial project until it is refactored for isolation.

## References

[1]: https://playwright.dev/docs/test-sharding "Playwright Docs — Sharding"
[2]: https://playwright.dev/docs/test-parallel "Playwright Docs — Parallelism"

---

**Prepared by Manus AI.**
