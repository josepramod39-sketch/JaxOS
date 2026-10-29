# 90-second Windows demo storyboard

Capture the real 0.5.1 app on a Windows machine after its acceptance pass. Record at readable desktop resolution, hide notifications and use a synthetic project with no personal paths. Use an installed model that advertises tool support. Keep full raw footage; disclose trims and speed-ups. Do not substitute a passing result for a failed run.

| Time | Screen action | Narration |
| --- | --- | --- |
| 0–10s | Show the board and the app | “I’m building JaxOS, a Windows workspace for local AI and KiCad checks.” |
| 10–25s | Settings: already selected local GGUF, load, show effective context | “This model runs through a local llama.cpp server. Loading and context are visible here.” |
| 25–40s | Connect the small project; show preview | “I can keep a conversation alongside the saved KiCad project.” |
| 40–60s | Select Test stage, request DRC; show real tool receipt and findings | “The assistant can request an actual KiCad check. The saved result comes from KiCad.” |
| 60–75s | Open KiCad, repair one clearly visible fault and save | “I make the edit in KiCad, then refresh the saved project.” |
| 75–85s | Refresh and rerun; inspect the new actual findings | “The new run records the updated board. Previous results can become stale.” |
| 85–90s | Hold the release URL and alpha label | “We’re recruiting ten Windows testers. Try one project check and tell us where you get stuck.” |

If inference does not issue a tool call, show the Test workbench controls and describe that actual path. If the repair does not produce a clean board, show the remaining findings. Record with Windows Snipping Tool or OBS; review the complete video before uploading. Video URL remains a draft marker until uploaded.

## Existing real screenshots

`assets/` contains copies of actual 0.5.0 Linux Electron test screenshots: managed model loading, model-selected failed DRC, and the Test findings. Their origin is listed in `assets/provenance.json`. They are useful internal preview assets, not Windows capture or proof that 0.5.1 was installed on Windows. Capture new Windows images for the public download announcement. No generated product mockup is used as working-product evidence.
