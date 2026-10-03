# Changelog

## Unreleased
- Windows support. `tools/build.js` and `tools/new-project.js` do the work in Node (byte-identical mp4s to the bash build); `build.sh` and `new-project.sh` now just call them. `.gitattributes` keeps `*.sh` at LF, so a Windows checkout with `core.autocrlf` still runs under WSL or Linux bash.
- `PV_PYTHON` picks the Python for `doctor.js` and `npm test` (default `python3`, or `python` on Windows, where `python3` is usually the Microsoft Store placeholder).
- `doctor.js` checks the browser by launching it the way `render.js` does, so it finds Chrome on Windows and catches a missing bundled Chromium when `PV_CHANNEL=""`.
- `npm test` also covers `tools/new-project.js`; `tools/sheet.py` labels tiles correctly from Windows paths.

## 1.0.0 - 2026-10-02
- First release, extracted from the Pitchcraft repository where the toolkit was built for its launch film.
- `lib/motion.js` + `lib/motion.css` (browser toolkit), `lib/synth.py` (procedural audio), `tools/` (render, build, doctor, new-project, sheet), `templates/starter`, `examples/pitchcraft`, `tests/smoke.js`, docs and AI operating manual.
- Differences from the original in-repo tools: generic projects with their own `cues.json` (size, fps, sub-frames, shutter), sound refactored into a reusable library, `will-change: transform` removed from the base CSS (it made rendering order-dependent), ephemeral server port, missing-file and page-error reporting.
