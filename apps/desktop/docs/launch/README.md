# JaxOS public alpha launch kit

Positioning: **A Windows workspace for local AI and KiCad checks.** First audience: Windows electronics hobbyists, KiCad users and local-model enthusiasts. First milestone: ten testers who complete one real check, then learn who returns in seven days. Do not advertise the future software-builder or Android roadmap as shipped functionality.

## Current state

- Owner approved Apache-2.0 for the desktop. LICENSE, NOTICE and package metadata now carry it; 0.5.1 repackages that decision. Third-party licenses remain applicable.
- Version 0.5.0 passed 86 automated tests and 13 Linux Electron scenarios; model exact-format failures remain documented. See [current validation](../VALIDATION.md) and [0.5.0 details](../validation/release-0.5.0/RESULTS.md).
- The 0.5.1 package and its validation are recorded separately in [release evidence](../validation/release-0.5.1/RESULTS.md).
- This cloud machine is Linux. Actual Windows install/upgrade/uninstall, CLI-wrapper and GPU acceptance are pending.
- Git access is connected and the review branch is pushed. GitHub plugin API tools are not exposed in this chat; the separate CLI API credential fails. No release or community post has been published.

## Sequence and ownership

1. Maintainer: review the pushed `codex/desktop-public-alpha` branch and its Windows Actions run. Git access works; API tooling is separately unavailable in this chat. Never place tokens in source, posts or issue reports.
2. Maintainer: review the prepared local branch `codex/desktop-public-alpha` in `/workspace/JaxOS-alpha`, based on `1b1a352`; it integrates the desktop under `apps/desktop` in the existing JaxOS repository on a dedicated branch. The original checkout is untouched; compare/rebase against the actual remote before pushing. The original checkout and desktop workspace are separate. Preserve the existing application; review the full diff before merging. Copy the issue template to repository-root `.github/ISSUE_TEMPLATE` and the Windows workflow template to repository-root `.github/workflows/windows-alpha.yml`.
3. Windows tester: use a dedicated Windows test account/VM. Run [native acceptance](../WINDOWS-RELEASE.md), collecting limited machine/package/CLI evidence with `scripts/collect-windows-alpha.ps1`. The review-branch push workflow (also manually dispatchable) can exercise fresh install and installed CLI on a hosted Windows runner; it cannot establish interactive upgrade/uninstall or GPU acceptance.
4. Maintainer: replace every `{{...}}` marker in the release/post drafts with a verified public URL. Check installers, prerequisites, hashes, NOTICE and known limitations. Publish as a GitHub **prerelease** only after the native acceptance outcome has been reviewed. Do not use the broad release announcement before an actual release exists.
5. Maintainer: record the Windows demonstration using [the storyboard](DEMO.md), publish it, then invite the first five testers with [the recruitment copy](POSTS.md).
6. Maintainer: help testers complete [the first task](QUICKSTART.md), collect [feedback](FEEDBACK.md), and update the anonymous [tracker](tester-tracker.csv). After ten testers, fix the most common activation blocker before a wider announcement.

## Materials

- [Release description](RELEASE.md)
- [Tester quickstart](QUICKSTART.md)
- [Demo script and screenshot provenance](DEMO.md)
- [Recruitment and launch posts](POSTS.md)
- [Feedback questions and measurement](FEEDBACK.md)
- [Draft Windows evidence form](WINDOWS-ACCEPTANCE.md)

The app currently adds no launch analytics. Use voluntarily supplied feedback and anonymous tester IDs. Downloads alone do not establish successful use. No outreach is automated by this kit.
