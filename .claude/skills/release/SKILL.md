---
name: release
description: This skill should be used when the user asks to "release a new version", "cut a release", "publish a release", or "bump the version". Handles version bumping, changelog updates, and running the release invocate task.
argument-hint: <version>
allowed-tools: [Read, Edit, Bash]
version: 0.1.0
---

# Release

Release a new version of Interstitia to GitHub.

## Process

### 1. Determine the new version

Version follows semver (`MAJOR.MINOR.PATCH`). Ask the user if not provided.

### 2. Update version in metadata.json

The version appears in two places — update both:

```json
"Version": "X.Y.Z",
...
"X-KDE-PluginInfo-Version": "X.Y.Z",
```

### 3. Update CHANGELOG.txt

Add a new section above the previous release:

```
[ X.Y.Z ]
- Description of change
- Description of change

[ previous version ]
...
```

Show the user the proposed changelog entry and confirm before proceeding. The changelog text becomes both the git commit message and the GitHub release notes.

### 4. Run the release task

```bash
source ~/.virtualenvs/interstitia/bin/activate && invocate dev.release
```

This task:
1. Bundles source modules into `main.js` (`dev.bundle`)
2. Packages into a `.kwinscript` zip (containing `contents/`, `metadata.json`, `install.sh`, `uninstall.sh`, `README.md`, `LICENSE`)
3. Runs `git add . && git commit && git push` — commit message is derived from `CHANGELOG.txt`
4. Creates (or recreates) a GitHub release tagged `interstitia_vX.Y.Z` with the `.kwinscript` as the release asset

### Notes

- The release script reads version from the `"Version"` field in `metadata.json` to name the package and GitHub release tag
- The git push targets the current branch — confirm the correct branch is checked out before releasing
- If a GitHub release with the same tag already exists, it is deleted and recreated