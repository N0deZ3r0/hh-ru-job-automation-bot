<div align="center">

<img src="icons/icon128.png" width="88" alt="HH Auto Responder Pro">

# HH Auto Responder Pro

**A Chrome extension that applies to hh.ru vacancies for you — behind five layers
of fingerprint and tracker defence, so the site cannot profile the machine doing it.**

[![CI](https://github.com/N0deZ3r0/hh-ru-job-automation-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/N0deZ3r0/hh-ru-job-automation-bot/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/N0deZ3r0/hh-ru-job-automation-bot?label=release)](https://github.com/N0deZ3r0/hh-ru-job-automation-bot/releases/latest)
[![License](https://img.shields.io/github/license/N0deZ3r0/hh-ru-job-automation-bot?color=blue)](LICENSE)
![Manifest V3](https://img.shields.io/badge/manifest-v3-4285F4?logo=googlechrome&logoColor=white)
![Chrome 111+](https://img.shields.io/badge/Chrome-111%2B-4285F4?logo=googlechrome&logoColor=white)

**English** · [Русский](README.ru.md)

</div>

---

## At a glance — v2.3

| Component | Status |
|-----------|--------|
| WebGL — GPU spoofing | Yes |
| Graphics card | 9 variants, fixed permanently |
| Timezone | Europe/Moscow |
| Language | ru-RU |
| WASM core | 26 functions |
| Tracker blocking | 32 DNR rules |
| Delay | 4 levels + night mode |
| SPA recovery | Yes |
| Direct applications | iframe isolation |
| Automatic CV choice | by match percentage |
| Test detector | hidden check |
| Persistence | chrome.storage |
| Night mode | Yes |
| Export / import | JSON |
| Session log | 30 runs |

## Background

HeadHunter took the video down. It showed a plain bot with no protection at all.

Now there are:

- 5 lines of defence
- 32 blocked domains
- 26 WASM functions
- 11 intercepted APIs
- 2 isolation levels (MAIN / ISOLATED)

Thanks for the motivation. The problem is theirs now.

## Installation

| Step | Action |
|------|--------|
| 1 | Download the files |
| 2 | Open chrome://extensions/ |
| 3 | Enable "Developer mode" |
| 4 | Click "Load unpacked" |
| 5 | Select the folder |

> After installation the extension generates a unique fingerprint by itself. The
> first time you open hh.ru a floating rocket button appears.

## Main features

| Feature | Description |
|---------|-------------|
| Speed | 0.3–5 seconds per application |
| Auto-filter | Remembers companies that use tests |
| Night mode | Pause on a schedule (0–23 h) |
| Themes | Dark / light |
| Statistics | sent / errors / skipped |
| Settings | 9 parameters |
| Chat | Closes itself |
| Cover letter | Can be turned off |
| Automatic CV choice | 0–100% threshold |
| Limit control | ~200 applications a day |
| Test detector | iframe + triple check |
| Auto-return | URL + testRequired + test-description |
| Duplicate protection | Set + chrome.storage |
| SPA recovery | pushState/popstate/replaceState |
| Manual backup | JSON export / import |
| Session log | History of the last 30 runs |

## Protection — 5 lines of defence

| Level | Mechanism |
|-------|-----------|
| 1 | Network filter — fetch/XHR/WS/ES/Beacon |
| 2 | Binary core — 26 WASM functions |
| 3 | Flow control — MutationObserver + Worker |
| 4 | Fingerprint distortion — WebGL/Canvas/Screen/Fonts |
| 5 | Masking — delays + humanScroll + mouse |

### Address blocking

| Address |
|---------|
| 127.0.0.1, localhost |
| 192.168.x.x, 10.x.x.x |
| ::1, fc00::/7, fd00::/7 |

### Tracker blocking (32 domains)

| Domain | Domain |
|--------|--------|
| targetads.io | weborama.ru |
| hybrid.ai | appsflyer.com |
| cpa.hh.ru | sentry.hh.ru |
| mc.yandex.ru | vk.com/rtrg |
| top-fwz1.mail.ru | adfox.ru |
| skcrtxr.com | apptracer.ru |
| cdn.uxfeedback.ru | tns-counter.ru |

### Digital-trace protection

| Vector | Method |
|--------|--------|
| Canvas | WASM noise + cache (5 s) |
| WebGL | GPU spoofing + 15 parameters |
| Navigator | 11 properties |
| WebRTC | ICE candidate filtering |
| Timing | Jitter ±0.1 ms |
| matchMedia | Matched to the real screen |
| Worker | Profile injected via postMessage |
| Fonts | Allow-list of 18 fonts |
| Intl | Timezone / locale spoofing |

## Control panel

| Button | Function |
|--------|----------|
| Start | Run |
| Test | One vacancy |
| Stop | Stop |
| Analyse | Statistics |
| Test filter | Check |
| Auto-filter | List |
| Clear | Reset |
| Clear auto-filter | Reset the auto-filter |
| Export | Save JSON |
| Import | Restore JSON |
| Log | Session history |

## Settings

| Setting | Range |
|---------|-------|
| Auto page turn | On / off |
| Skip already applied | On / off |
| Company filter | text |
| Auto-filter | On / off |
| Automatic CV choice | On / off |
| Match threshold | 0–100% |
| No cover letter | On / off |
| Delay | 0.3–5 s |
| Night mode | On / off + hours (0–23) |

## Requirements

| Parameter | Value |
|-----------|-------|
| Browsers | Chrome 111+, Edge 111+, Opera 97+, Yandex Browser |
| License | MIT |

## Contributing

Bug reports and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
Found a security problem? [Report it privately](https://github.com/N0deZ3r0/hh-ru-job-automation-bot/security/advisories/new)
rather than in a public issue.

---

**Authors:** ALEX | Siarhei Karnach

*hh.ru no longer collects data about your computer.*
