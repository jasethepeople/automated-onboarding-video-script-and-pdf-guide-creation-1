# Automated Onboarding Flow Test Plan

This test plan adds browser-level verification to the Asana onboarding suite. It targets a **dedicated test workspace**, uses a pre-authenticated Playwright storage-state file, creates only clearly tagged test data, and never sends collaboration invitations. The purpose is to confirm that a new user can move through the core activation journey without broken navigation or unavailable creation controls.

> **Test boundary:** The test validates the interface flow, not password, SSO, MFA, payment, account provisioning, or email delivery. Sign in manually once to create the local session state. Use only a workspace you are authorized to modify.

| Test ID | User outcome verified | Expected assertion | Data created |
|---|---|---|---|
| ONB-01 | The user can orient in the workspace. | Home, My tasks, Inbox, and Create are visible. | None |
| ONB-02 | The user can start a blank project. | Create menu and Blank project path are reachable. | One tagged project |
| ONB-03 | The user can give the project a readable structure. | Plan, Build, and Launch sections are visible. | Three sections |
| ONB-04 | The user can capture a first actionable task. | The task title appears in the Plan section and is opened. | One tagged task |
| ONB-05 | The user can access task-clarity fields. | Assignee, due date, description/comment entry controls render. | No assignment or date change by default |
| ONB-06 | The user can reach project-sharing controls. | Share dialog opens and presents an invite field and permission control. | No invitations |

## Required test environment

| Setting | Purpose | Example |
|---|---|---|
| `ASANA_STORAGE_STATE` | Local browser session created through a manual login. | `.asana_auth.json` |
| `ASANA_TEST_WORKSPACE_URL` | A known landing URL in the dedicated test organization. | `https://app.asana.com/0/home` |
| `ASANA_TEST_PROJECT_PREFIX` | Prefix for data created by the suite. | `E2E Onboarding` |
| `ASANA_CLEANUP_AFTER` | Optional cleanup request. Off by default because archived/deleted-state controls vary by tenant. | `false` |

The generated project name contains a UTC timestamp and random suffix, allowing parallel or repeated runs without collisions. Tests deliberately use the UI to create the project because the goal is to verify the onboarding experience, rather than merely verify backend APIs.

## Test design decisions

The suite uses semantic, ordered locator fallbacks such as accessible names, role-based controls, and short text labels. It avoids pixel-coordinate clicks. When an expected selector is unavailable, Playwright saves a trace, video, screenshot, and HTML report to help maintain the suite as the UI changes.

The Happy Path is organized as a serial test file because each test builds on the project created by the previous verification. This produces clearer failure localization for onboarding QA. The suite can be run in parallel with other, independent test files because every run makes a uniquely named project.

## Out of scope

| Not tested | Reason |
|---|---|
| Sign-up, SSO, MFA, or password reset | These flows require identity-provider and test-account controls not supplied in this suite. |
| Email invitations and permission changes | Sending invitations has external effects. The test only verifies that access controls render. |
| Paid, enterprise, or AI-only controls | Availability varies by plan and organization configuration. |
| Exact pixel-level screenshots | The suite checks the functional flow; the existing guide generator handles annotated capture assets. |
