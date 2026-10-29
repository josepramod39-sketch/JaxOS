# Alpha feedback

Suggested questions for each consenting tester:

1. Which Windows version, KiCad version, and runtime/model did you use? Hardware details are optional; no serial numbers or account identifiers.
2. Did installation succeed? Did you load a model and receive your first response?
3. Did you connect a project and complete ERC or DRC? A completed check may legitimately have findings.
4. Where did you get stuck? Include the exact error after removing private paths and secrets.
5. What made the workflow useful or unnecessary? Did you use it again within seven days?

Use the repository issue form when available; it is public. Do not attach API keys, proprietary boards, full databases or unreviewed debug bundles. A maintainer can ask for a minimal sanitized reproduction. Do not promise private support until an actual private channel exists.

## Manual measurement

Use `tester-tracker.csv` with anonymous IDs such as T001; do not store names or contact details there. Mark unknown observations as unknown rather than converting them into failure or success.

- Activation: completed one real KiCad check / testers who started setup.
- Setup success: installed successfully / testers who attempted installation.
- First-value time: tester-reported minutes, excluding separate large downloads; use the median of known values.
- Seven-day return: returned / activated testers whose seven-day window has elapsed; exclude unknown follow-up outcomes.
- Blockers: group by installation, runtime setup, project import, model behavior, checks and other UX.

The target is ten observed activations, not ten downloads. Review weekly and fix the largest recurring blocker. Retain only the minimal voluntary feedback; no telemetry endpoint or automatic contact is created by this kit.
