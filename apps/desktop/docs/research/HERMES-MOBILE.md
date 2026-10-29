# Hermes mobile support: source review

Reviewed 2026-10-11 at NousResearch/hermes-agent commit `97a9ae8ee55d31bebce49f1fb6b5ef775323976a`. This is a source/documentation review; no phone, remote connection, or application runtime was tested.

## What is supported

| Surface | Evidence | Important boundary |
| --- | --- | --- |
| Phone messaging clients | Root README lists Telegram, Discord, Slack, WhatsApp, Signal; Telegram guide supports text, voice transcription, images, files, scheduled results, and QR onboarding. | Agent/gateway executes on its host; Telegram on a phone is a client, not a native Hermes app. Gateway must be reachable/running for work. |
| Browser dashboard on a phone | Web-dashboard docs explicitly describe phone workspace selection, narrow-screen chat rail slide-over, browser resizing and reconnect behavior. | Browser chat currently embeds the terminal TUI through xterm.js and a server PTY. Docs say native Windows dashboard chat requires WSL2; other dashboard pages work on native Windows. |
| Android local runtime through Termux | Official aarch64 APT package includes Python, Node, TUI, core tools. Platform support labels it Tier 2/best effort. | The current Termux guide opens with **“Termux is currently broken.”** Android may kill background processes; no Electron, Chromium, local Docker, desktop computer-use, or phone-native microphone/clipboard adapters in this package path. |
| Native Hermes iOS/Android GUI | No official native GUI target confirmed in the reviewed source or platform documentation. Desktop README lists macOS, Windows, Linux; app source tree contains bootstrap installer, desktop, shared. | Do not imply Hermes Desktop installs on iOS/Android. |
| Installable PWA/offline/push | No web manifest, service-worker target, or PWA integration found in reviewed web index/package/Vite configuration and source tree filenames. | Responsive browser support does not by itself establish an installable/offline/push-capable PWA. |

## Source links

- [Desktop architecture and supported OSes](https://github.com/NousResearch/hermes-agent/blob/97a9ae8ee55d31bebce49f1fb6b5ef775323976a/apps/desktop/README.md): Electron shell owns native features; React renderer and browser dashboard share transport code in apps/shared; agent runs on the local or remote gateway host.
- [Phone browser chat and platform limitations](https://github.com/NousResearch/hermes-agent/blob/97a9ae8ee55d31bebce49f1fb6b5ef775323976a/website/docs/user-guide/features/web-dashboard.md#chat).
- [Remote dashboard authentication](https://github.com/NousResearch/hermes-agent/blob/97a9ae8ee55d31bebce49f1fb6b5ef775323976a/website/docs/user-guide/features/web-dashboard.md#connecting-hermes-desktop-to-a-remote-backend): authenticated HTTP plus WebSocket transport; private-network/VPN and internet-facing OAuth deployment distinctions. Do not copy an unauthenticated public listener.
- [Telegram capabilities and QR onboarding](https://github.com/NousResearch/hermes-agent/blob/97a9ae8ee55d31bebce49f1fb6b5ef775323976a/website/docs/user-guide/messaging/telegram.md#quick-setup-dashboard-and-desktop-app).
- [Android/Termux warning and limits](https://github.com/NousResearch/hermes-agent/blob/97a9ae8ee55d31bebce49f1fb6b5ef775323976a/website/docs/getting-started/termux.md).
- [Platform support tiers](https://github.com/NousResearch/hermes-agent/blob/97a9ae8ee55d31bebce49f1fb6b5ef775323976a/website/docs/getting-started/platform-support.md).
- [Web package](https://github.com/NousResearch/hermes-agent/blob/97a9ae8ee55d31bebce49f1fb6b5ef775323976a/web/package.json), [index](https://github.com/NousResearch/hermes-agent/blob/97a9ae8ee55d31bebce49f1fb6b5ef775323976a/web/index.html), [Vite config](https://github.com/NousResearch/hermes-agent/blob/97a9ae8ee55d31bebce49f1fb6b5ef775323976a/web/vite.config.ts).

## Recommendation for JaxOS desktop + mobile

Keep the chosen Electron + React Windows app. Add a responsive React companion first, with installability deliberately added and tested as a PWA rather than assumed. Share typed API contracts, task/session models, design tokens and pure components; isolate Electron IPC/native capabilities behind a desktop adapter. A phone browser must use authenticated network APIs and must not depend on Electron or unrestricted filesystem access.

The durable coordinator should own sessions, project identities, work items, runs, approvals and evidence. Windows runner owns local project paths and execution; the phone selects a project ID, not an arbitrary path. The phone can brainstorm, capture text/voice/images, prioritize the day, review a proposed change, start/stop permitted runs and inspect actual test evidence. It should show the execution host and current connectivity explicitly.

If the PC sleeps, a PC-hosted coordinator and runner are offline. Preserve an unsent draft locally and show the offline state. Do not claim work was queued unless a durable coordinator actually accepted it. An always-on hosted coordinator is a later deployment choice; Windows-specific work still waits for the paired Windows runner. Cached reports must show their revision/time and must not be presented as a fresh passing run.

Use authenticated private network access for a personal first release. Design pairing as expiring single-use tokens with an explicit desktop confirmation, per-device revocation, and scoped project access. QR should identify the connection and short-lived pairing challenge, not distribute provider keys. Later public access needs an intentional identity/relay design and proper TLS; do not expose the local model or OpenCode server directly as a shortcut.

Background execution belongs to the host, not a mobile browser. Durable event cursors and idempotent submissions allow mobile reconnection without duplicate tasks. Push notifications are a later capability with iOS/Android acceptance tests; browser suspension means live sockets cannot be relied upon for background alerts. Optional Telegram integration offers familiar phone capture/notifications, but channel conversation IDs must map to the same task authority and external delivery needs user configuration.

If app-store distribution, share-sheet capture or deeper native integrations become important, evaluate Capacitor around the React companion before committing to a separate React Native interface. Electron itself is not a mobile runtime. Native wrappers still need platform-specific permissions, notification plumbing, signing, and device testing.
