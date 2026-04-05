# Desktop Platform Smoke Checklist

Sentinel should not be treated as platform-ready unless Windows and Linux each pass the same baseline verification flow we expect on macOS.

Use this checklist after `desktop-verify` produces artifacts for a candidate branch, SHA, or tag.

## Required Environments

- One real Windows machine.
- One real Linux desktop distro with `xdg-open` available.
- A real project workspace with Git enabled.
- At least one Codex runtime and one Claude runtime installation available for detection checks.

## Core Smoke Checks

Run every check on both Windows and Linux:

1. Install, launch, and update eligibility

- Install the built artifact successfully.
- Launch the app without startup crashes.
- Confirm the updater/settings surface renders without broken state.

2. First run and settings

- Complete first-run onboarding.
- Open settings from the main shell.
- Navigate between core settings sections without header or chrome overlap.

3. Workspace selection and persistence

- Open a real project workspace.
- Restart the app and confirm the previously selected workspace persists.
- Verify the thread list and workspace navigation render cleanly after reopen.

4. Shell and terminal behavior

- Run at least one successful shell tool command in a repo.
- Run one failing command and confirm the error is understandable.
- Open the terminal panel and confirm it starts in the expected shell for the platform.
- Confirm the terminal respects the selected workspace directory.

5. Runtime discovery

- Verify Codex runtime detection works without manually editing app state.
- Verify Claude runtime detection works without manually editing app state.
- Confirm runtime-related errors are actionable when the runtime is missing.

6. Repo and file-manager flows

- Open the current workspace in an external editor target.
- Open a file in an external editor target at a specific line when supported.
- Reveal a file or folder in the platform file manager.
- Open the workspace in a platform terminal target.

7. Chat and approvals

- Create a new thread.
- Verify streaming output appears normally.
- Exercise at least one approval flow.
- Resume an existing thread and confirm state is restored.

8. Visual polish

- Inspect the main shell, sidebar, settings headers, and browser/sidebar surfaces.
- Confirm drag regions do not overlap interactive controls.
- Confirm custom window controls render and behave correctly on Windows/Linux.
- Check there is no clipped text, overlapping chrome, or unusable spacing in the title-bar area.

## Release Gate

- A release candidate is blocked if any core smoke check fails on Windows.
- A release candidate is blocked if any core smoke check fails on Linux.
- New features that are knowingly platform-limited must be explicitly called out in the release notes or tracked follow-up issues before shipping.
