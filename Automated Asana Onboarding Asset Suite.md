# Automated Asana Onboarding Asset Suite

This package provides a **five-minute narrated onboarding video script** and a **Python browser-automation runner** for producing a matching screenshot-based PDF guide. It uses Asana as a representative project-management SaaS and follows a new-user activation journey: orient in the workspace, create a project, organize it into stages, add a first task, and open the project-sharing interface.

> **Important:** Use a dedicated Asana test organization, fictitious project names, and test users. The runner saves its browser session locally in `.asana_auth.json`; keep that file private and delete it when it is no longer needed. The supplied workflow opens the sharing dialog but deliberately does **not** submit an invitation.

| File | Purpose |
|---|---|
| `asana_onboarding_video_script.md` | Production-ready 5:00 video script with narration, screen direction, and sound cues. |
| `asana_guide_generator.py` | Config-driven browser runner that records high-resolution PNG screens, overlays pointer arrows and labels, and assembles a PDF. |
| `workflow.json` | Asana journey, selector fallbacks, screenshot instructions, labels, variables, and output options. |
| `requirements.txt` | Python dependencies required by the runner. |
| `output/` | Created on a successful run; contains annotated PNGs and the PDF guide. |

## Journey and design assumptions

The guide is based on Asana’s documented new-user model. Home surfaces assigned work and recent activity; the left sidebar includes Inbox, My tasks, and projects. New tasks can be created from the Create control, and a project’s **Share** button opens access and permission choices.[1]

| Step | Purpose | Captured guide moment |
|---:|---|---|
| 1 | Orientation | Home, My tasks, Inbox, and Create |
| 2 | Project creation | Create menu and blank-project setup |
| 3 | Shared context | Name and privacy review |
| 4 | Readable structure | Plan, Build, and Launch sections |
| 5 | Actionable work | First task detail and accountability fields |
| 6 | Collaboration | Share dialog and permission choice |
| 7 | Recap | Completed starter-project view |

## Setup

The runner uses Python 3.10+ and Chromium. Run the following commands from this folder in a virtual environment if your team’s policy requires one. The browser binary installation is a separate step after installing the Python packages.

```bash
cd saas_onboarding_suite
python -m pip install -r requirements.txt
python -m playwright install chromium
```

To make a reliable recording, reset or create a dedicated test workspace before each production run. Seed it with the fictitious teammate specified in `ASSIGNEE_NAME` if you intend to expand the workflow to populate assignees. Keep browser zoom at 100%, set the window to the standard 1920 × 1080 capture resolution, and suppress desktop notifications.

## Run the guide generator

### 1. Save a local, authenticated session

Run the auth step once in a visible browser. Complete password entry, MFA, and any SSO flow yourself. When the authenticated Asana workspace is visible, return to the terminal and press **Enter**. The runner will validate the page and save an encrypted-browser-session JSON file locally; it never asks for or records credentials.

```bash
python asana_guide_generator.py --record-auth --auth-only --headed
```

### 2. Capture screenshots and create the PDF

Use a visible browser for the first production pass. It makes selector adjustments and unexpected onboarding prompts easier to diagnose.

```bash
python asana_guide_generator.py --headed --slow-mo 120
```

On success, the main deliverables will be created at:

```text
output/screenshots/01_workspace_orientation.png
output/screenshots/02_create_menu.png
...
output/asana_first_project_user_guide.pdf
```

For a faster repeat pass, omit `--headed`. The output images are 1920 × 1080 by default; each is annotated with a high-contrast focus ring, arrow, and concise teaching label. The PDF uses one annotated screenshot per landscape-A4 page.

```bash
python asana_guide_generator.py
```

### 3. Optional project-name override

Use the command-line switch rather than editing the JSON for one-off project names.

```bash
python asana_guide_generator.py --headed --project-name "Q4 Launch Planning"
```

## Safe operation and invitation behavior

The shipped `workflow.json` stops after taking a screenshot of the **Share** dialog. It never enters an email address or clicks an invitation submission control. This protects against sending unintended access invitations while capturing a guide.

If your team wants a controlled invitation test, first set a non-production address in `COLLABORATOR_EMAIL`, add a final `invite` step to `workflow.json`, and run with `--allow-external-invites`. That flag is deliberately required as an explicit confirmation. Use only a test recipient in a test organization.

| Run mode | What it does | Risk profile |
|---|---|---|
| `--record-auth --auth-only --headed` | Lets you sign in yourself and saves a local browser session. | Does not create or modify Asana work. |
| Default capture run | Creates a demonstration project, sections, and one task; captures the Share dialog. | Changes only the selected test workspace. |
| Run with a custom `invite` step and `--allow-external-invites` | Submits an invitation to the configured test recipient. | Sends a real email/access invitation; use only with authorization. |

## Adjusting to a UI update

SaaS interfaces evolve. The generator avoids opaque coordinate-click automation; each instruction uses an ordered set of semantic selector fallbacks in `workflow.json`. If a run stops, inspect the error, open the browser with `--headed --slow-mo 250`, and update only the relevant selector list.

For example, if the Create control changes its label, amend the selector array in the `Open Create menu` step:

```json
"selectors": [
  "button:has-text('Create')",
  "[aria-label*='Create']",
  "button[title*='Create']",
  "YOUR_NEW_STABLE_SELECTOR"
]
```

Prefer accessibility labels, durable data attributes, or role-based selectors supplied by your organization over long CSS paths. The annotation follows the live bounding box of its target, so it stays aligned even if responsive layout shifts the control.

## Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| “No valid saved Asana session was found.” | The session file is missing or expired. | Repeat the auth-only command with `--record-auth --headed`. |
| The runner stops at a selector error. | Asana’s current UI differs from the fallback labels. | Run headed with slow motion, then edit that step’s selectors in `workflow.json`. |
| An arrow is missing but capture continues. | The target was not visible at screenshot time. | Confirm the surrounding UI state and add a stable selector to that annotation. |
| The PDF is absent. | A preceding workflow step failed, so no complete capture set exists. | Correct the failing selector and rerun from a reset test workspace. |
| A workflow test affects the wrong workspace. | The saved session points to a personal or production organization. | Stop immediately, delete `.asana_auth.json`, sign in to the designated test organization, and recapture auth. |

## References

[1]: https://help.asana.com/s/article/you-ve-been-invited-to-asana-now-what "Asana Help Center — You’ve been invited to Asana; now what?"
[2]: https://help.asana.com/s/article/team-basics?language=en_US "Asana Help Center — Team basics"

---

**Prepared by Manus AI.**


## Automated onboarding-flow verification

The package also includes a **Playwright test suite** at `tests/asana-onboarding.spec.ts`. It verifies the representative activation journey in a dedicated test organization: navigation availability, blank-project creation, section structure, first-task creation, task-clarity controls, and the Share dialog. It does **not** enter an email address, choose a permission, or send an invitation.

Install the test dependency and Chromium once:

```bash
npm install
npx playwright install chromium
```

Create `.env` from `.env.example`, then set `ASANA_STORAGE_STATE` to the local session file created through the preceding manual-authentication command. Shell environments do not automatically load `.env`; export the variables or provide them inline. The following example runs in a test workspace using the saved session produced by the guide generator.

```bash
export ASANA_STORAGE_STATE=.asana_auth.json
export ASANA_TEST_WORKSPACE_URL=https://app.asana.com/0/home
export ASANA_TEST_PROJECT_PREFIX="E2E Onboarding"
npm run test:onboarding
```

Use a visible browser while initially validating selectors:

```bash
npm run test:onboarding:headed
```

A failing test creates an HTML report, failure screenshot, and where relevant a trace or video in `playwright-report/` and `test-results/`. Open the report with:

```bash
npm run report:onboarding
```

> The tests create a timestamped project and a single timestamped task. They do not delete test data automatically, because archive/delete controls vary by Asana tenant. Remove the resulting `E2E Onboarding …` project manually from the dedicated test organization after review.

For the complete coverage matrix, preconditions, and maintenance strategy, see [`ONBOARDING_TEST_PLAN.md`](ONBOARDING_TEST_PLAN.md).


### Session-health setup project

`playwright.config.ts` now defines two dependency-aware projects. The `session-setup` project runs `tests/session-health.setup.ts` first. It checks that `ASANA_STORAGE_STATE` is present, that the injected JSON file exists, that the test workspace does not redirect to sign-in or SSO, and that the authenticated UI exposes the Create control. The `chromium-onboarding` project depends on `session-setup`; therefore no onboarding test creates project data if the session is missing, expired, or rejected.

```text
session-setup (auth-state presence + signed-in UI check)
        │
        └── success required
                 │
                 ▼
chromium-onboarding (six onboarding-flow checks)
```

The configuration omits a missing state file from Playwright’s browser context deliberately. This lets the setup test produce an explicit, fail-closed authentication error instead of a lower-level context initialization failure. It does not attempt to renew credentials, complete MFA, or generate OTP codes during the test run.
