---
name: testing
description: This skill should be used when the user asks to "run tests", "run the test suite", "check tests", "run jest", "install and test", "test the live script", or "/test". Runs the Jest test suite and/or installs the script into KWin and checks live logs.
argument-hint: [test-file-or-pattern]
allowed-tools: [Bash]
version: 0.2.0
---

# Testing

Two testing modes: unit tests (Jest) and live integration (install + log check).

## Unit Tests (Jest)

To run all tests:

```bash
npx jest
```

To run a specific file or pattern:

```bash
npx jest <argument>
```

Report: pass/fail summary, any failing test names and error messages.

## Live Integration Testing

### 1. Bundle then Install

Always bundle first to ensure the latest source modules are concatenated into `main.js`, then install:

```bash
source ~/.virtualenvs/interstitia/bin/activate && invocate dev.bundle && invocate dev.install
```

`install.sh` uses `qdbus` to unload, reload, and reconfigure the KWin script live — **no logout or Plasma restart required**.

### 2. Check Logs

After install, check for errors or confirmation that the script loaded:

```bash
journalctl --user -n 80 --no-pager | grep -E "interstitia|tilegaps|kwin_wayland"
```

Note: the currently running version logs with a `tilegaps:` prefix (old script name). Look for that prefix until the log prefix is updated to `interstitia:`.

Look for:
- Syntax errors (`error: Expected token`, `SyntaxError`, etc.) — means main.js needs fixing before live testing
- Gap/geometry log lines confirming the script is active
- Any unexpected errors

### 3. Manual Verification

Once the script loads cleanly, ask the user to:
- Move or tile windows and observe gap behavior
- Try the cascade shortcut

### Notes on Restarting KWin

The `qdbus` reload in `install.sh` handles script reloading without any restart. If a full KWin restart is ever needed (e.g. after a crash or KWin API change):

```bash
kwin_wayland --replace &   # Wayland session
kwin_x11 --replace &       # X11 session
```

This restarts just KWin, not the full Plasma session — much faster than logging out.