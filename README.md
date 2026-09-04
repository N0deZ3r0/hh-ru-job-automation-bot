<div align="center">

<img src="icons/icon128.png" width="88" alt="HH Auto Responder Pro">

# HH Auto Responder Pro

**A Chrome extension that applies to hh.ru vacancies for you, skips the ones that
demand a test, and keeps the machine doing it from standing out.**

[![CI](https://github.com/N0deZ3r0/hh-ru-job-automation-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/N0deZ3r0/hh-ru-job-automation-bot/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/N0deZ3r0/hh-ru-job-automation-bot?label=release)](https://github.com/N0deZ3r0/hh-ru-job-automation-bot/releases/latest)
[![License](https://img.shields.io/github/license/N0deZ3r0/hh-ru-job-automation-bot?color=blue)](LICENSE)
![Manifest V3](https://img.shields.io/badge/manifest-v3-4285F4?logo=googlechrome&logoColor=white)
![Chrome 111+](https://img.shields.io/badge/Chrome-111%2B-4285F4?logo=googlechrome&logoColor=white)

**English** · [Русский](README.ru.md)

</div>

---

## At a glance — v2.4

| Component | Status |
|-----------|--------|
| Applications per run | Paced 0.3–5 s apart, capped at hh.ru's daily 200 |
| Test vacancies | Detected in a hidden iframe and skipped |
| CV selection | Automatic, by title match (0–100% threshold) |
| Cover letter | Optional, with `{vacancy}` / `{company}` placeholders |
| Filters | Employer list, auto-learned list, title stop-words |
| Night mode | Pause on a schedule (0–23 h) |
| Persistence | `chrome.storage`, invisible to the page |
| Backup | JSON export / import |
| Session log | Last 30 runs |
| WASM core | 842 bytes, 8 functions, built from source |
| Tracker blocking | 21 domains, 22 declarativeNetRequest rules |
| Fingerprint defence | GPU, canvas, audio, text metrics, WebGL precision |

## Background

HeadHunter took the video down. It showed a plain bot with no protection at all.
This is the answer to that.

## Installation

| Step | Action |
|------|--------|
| 1 | Download or clone the repository |
| 2 | Open `chrome://extensions/` |
| 3 | Enable **Developer mode** |
| 4 | Click **Load unpacked** |
| 5 | Select the project folder |

No build step is required — the compiled `protect.wasm` is committed. On the first
hh.ru page a floating rocket button appears; it opens the control panel.

A packaged ZIP is attached to every [release](https://github.com/N0deZ3r0/hh-ru-job-automation-bot/releases/latest)
if you would rather not clone the repository.

## How it works

The bot walks the search results page, filters out what you told it to skip, and
opens each remaining vacancy's response form.

Before applying it opens the response page in an off-screen iframe and looks for
the four signals of an employer test — `startedWithQuestion=false` in the URL, an
`input[name="testRequired"]`, a `test-description` block, or
`employer-asking-for-test`. If any of them fire the vacancy is skipped and the
employer is remembered, so their other listings are skipped too.

Pacing is deliberately irregular: a short pause, a main pause, and occasionally a
longer one, plus scrolling and mouse movement toward the button before the click.

## Features

| Feature | Description |
|---------|-------------|
| Daily limit | Counts per calendar day and stops at hh.ru's 200 |
| Auto page turn | Follows the pager to the end of the results |
| Skip already applied | Recognises cards that already carry a response status |
| Employer filter | Manual list, matched on partial names |
| Auto-filter | Learns employers whose vacancies require a test |
| Title stop-words | Skips by job title; matches Russian inflection by stem |
| Cover letter | `{vacancy}` and `{company}` are filled per vacancy, trimmed to 2000 chars |
| CV selection | Picks the CV whose title best matches the vacancy |
| Night mode | Pauses between two hours and resumes by itself |
| Error handling | Pauses after repeated failures, reloads and resumes after eight |
| SPA recovery | Survives `pushState` / `replaceState` / `popstate` navigation |
| Duplicate protection | Skipped vacancies persist across sessions |
| Themes | Dark / light |

## Control panel

| Button | Function |
|--------|----------|
| Start | Run over the whole results list |
| Test | Process a single vacancy |
| Stop | Stop and save |
| Analyse | Counts on the current page |
| Test filter | Explains why each vacancy is allowed or blocked |
| Auto-filter | Shows the learned employer list |
| Clear | Reset history and statistics |
| Clear auto-filter | Reset only the learned list |
| Export / Import | JSON backup |
| Log | History of the last 30 runs |

## Settings

| Setting | Range |
|---------|-------|
| Delay | 0.3–5 s |
| Auto page turn | On / off |
| Skip already applied | On / off |
| Employer filter | On / off + list |
| Auto-filter | On / off |
| Title stop-words | List |
| Automatic CV choice | On / off |
| Match threshold | 0–100% |
| Skip cover letter | On / off |
| Night mode | On / off + hours (0–23) |

## Fingerprint defence

The extension runs in two isolated worlds: `hh-protect.js` patches the page's own
APIs in the MAIN world, while `core.js`, the UI and the bot live in the ISOLATED
world where the page cannot reach them.

**What is spoofed** — only things the server cannot cross-check against the
request it already received:

| Vector | Method |
|--------|--------|
| WebGL renderer | One of 9 GPUs, picked once and stored |
| Canvas | One colour channel of ~half the pixels shifted by ±1, alpha untouched |
| Text metrics | `measureText` widths shifted by at most 2e-5 relative |
| Audio | `AudioBuffer` samples shifted below the audible floor |
| Shader precision | Normalised to the values every desktop GPU reports |
| Max anisotropy | Fixed at 16 |
| WebRTC | Private ICE candidates filtered out |
| `navigator.webdriver` | Forced to `false` |
| Fonts | `document.fonts.check` limited to an 18-font allow-list |

**What is deliberately left alone.** The extension does not rewrite outgoing HTTP
headers, so the server always sees the real `User-Agent`, `Sec-CH-UA` and
`Accept-Language`. Claiming a different browser, locale, timezone or screen size
in JavaScript would contradict headers the site has already read — a mismatch no
genuine machine produces, which makes the browser *more* identifiable rather than
less. The profile therefore mirrors the real browser for all of those, and a
patched getter is installed only where the value actually differs.

If you want locale or user-agent spoofing back, it has to be done together with
`declarativeNetRequest` header rewriting so that JavaScript and the headers agree.

All noise is deterministic: each value is derived from the session seed and the
element's index, so reading the same canvas twice returns the same pixels. A
fingerprint that changes between two reads is itself an anomaly.

### Network filtering

`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon` are
wrapped, and 21 tracker domains are blocked both there and by 22
declarativeNetRequest rules. Requests to loopback and private ranges
(`127.0.0.1`, `192.168.0.0/16`, `10.0.0.0/8`, `172.16.0.0/12`, `::1`, `fc00::/7`)
are refused.

## The WASM module

`protect.wasm` is built from [`wasm/protect.wat`](wasm/protect.wat) — 842 bytes,
no imports, no allocator. JavaScript writes into its memory at a fixed offset and
grows it as needed.

```bash
npm install          # only needed to rebuild
npm run build:wasm   # wasm/protect.wat -> protect.wasm
npm test             # module + unit tests
```

The compiled binary is committed, so installing the extension needs no toolchain.

## Tests

```bash
npm test
```

| Suite | Covers |
|-------|--------|
| `wasm/test.mjs` | Determinism, clamping, alpha, seed separation, canvas size rule, noise bounds |
| `test/protect.mjs` | `core.js` and `hh-protect.js` |
| `test/bot.mjs` | `content.js` |

The suites read the sources as text and extract the real functions, so they test
the code that ships rather than a copy. CI runs them together with the manifest
and JSON validation on every push and pull request.

## Releases

Releases are built by CI from a tag:

```bash
git tag v2.4
git push origin v2.4
```

The workflow validates the sources, runs every test suite, rebuilds
`protect.wasm` from `wasm/protect.wat` and compares it byte for byte with the
committed binary, checks that the tag matches the version in `manifest.json`,
packs the extension and publishes the release with generated notes.

The archive holds the extension runtime only — the WASM source, tests, scripts
and documentation stay in the repository. Builds are reproducible: the ZIP uses
fixed timestamps, so the same commit always produces the same file.

```bash
npm run pack               # dist/hh-auto-responder-v<version>.zip
node scripts/pack.mjs --list   # what would go into it
npm run check:wasm         # binary still matches its source?
```

Running the workflow manually (**Actions → Release → Run workflow**) builds the
archive and uploads it as a build artifact without publishing anything.

## Project layout

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest, two content-script worlds |
| `background.js` | Service worker; builds the profile and injects it into MAIN |
| `hh-protect.js` | MAIN world — all fingerprint patches |
| `protect.js` | Loader for `protect.wasm` |
| `core.js` | ISOLATED world — WASM load, network filtering, SPA recovery |
| `ui.js` | Control panel markup |
| `content.js` | Bot logic |
| `rules.json` | declarativeNetRequest rules |
| `wasm/` | WASM source, build script, module tests |
| `scripts/` | Packing and release notes |
| `test/` | Unit tests |

## Requirements

| Parameter | Value |
|-----------|-------|
| Browsers | Chrome 111+, Edge 111+, Opera 97+, Yandex Browser |
| Node (development only) | 20+ |
| License | MIT |

## Contributing

Bug reports and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
Found a security problem? [Report it privately](https://github.com/N0deZ3r0/hh-ru-job-automation-bot/security/advisories/new)
rather than in a public issue.

---

**Authors:** ALEX | Siarhei Karnach

*Use it on your own account, for your own applications.*
