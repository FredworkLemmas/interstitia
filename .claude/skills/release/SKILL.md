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

Show the user the proposed changelog entry and confirm before proceeding. This version's section, and only it, becomes the GitHub release notes.

### 4. Land the bump in a PR

Commit the `metadata.json` and `CHANGELOG.txt` changes on a branch and open a PR against `main`. The release task never commits or pushes, so the release is exactly what is on `origin/main` once the PR is merged.

### 5. Release from a clean `main`

Set up the virtualenv once, on any account:

```bash
python -m venv ~/.virtualenvs/interstitia && ~/.virtualenvs/interstitia/bin/pip install -r requirements-dev.txt
```

Then, from a clean checkout at `origin/main` (a detached worktree works well):

```bash
source ~/.virtualenvs/interstitia/bin/activate
invocate dev.release --dry-run   # build, check, print the notes; publishes nothing
invocate dev.release             # the same, then publish
```

Show the user the dry run's notes, file listing and checksum, and get their go-ahead before running it without `--dry-run`.

`dev.release` bundles the source modules into `main.js` (`dev.bundle`), then runs `package.sh`, which:
1. Reads the name from `"Id"` and the version from `"Version"` in `metadata.json`, and refuses unless `"X-KDE-PluginInfo-Version"` matches
2. Takes the `[ X.Y.Z ]` section of `CHANGELOG.txt` as the release notes, and refuses if it is missing or empty
3. Refuses unless the working tree is clean, `HEAD` is `origin/main`, and no tag `interstitia_vX.Y.Z` exists on `origin`
4. Zips `contents/`, `metadata.json`, `install.sh`, `uninstall.sh`, `README.md` and `LICENSE` into `interstitia_vX.Y.Z.kwinscript`, and prints its listing and checksum
5. Without `--dry-run`, creates the GitHub release `interstitia_vX.Y.Z` at `HEAD` with the `.kwinscript` attached

### 6. Update the KDE Store listing

After the GitHub release, update the listing by hand:

1. Open the Interstitia product through https://www.opendesktop.org/member/838882/products/ (the public page is https://www.pling.com/p/2349376/)
2. Update the version number
3. Upload the generated `.kwinscript` and mark it as the current file
4. Paste the release notes into the changelog, if the page has one

### Notes

- The package and tag are named from `metadata.json`, never from the folder, so any checkout or worktree works
- `package.sh` never commits, pushes, or deletes a release; an existing tag makes it refuse rather than recreate
- Untracked files (such as `.claude/settings.local.json`) make it refuse; gitignored ones (`main.js`, `*.kwinscript`) don't
- `gh` needs a working `DBUS_SESSION_BUS_ADDRESS` for its keyring; before publishing, `package.sh` checks `gh auth status` and, if it fails, retries with `/run/user/<uid>/bus`, which covers an address that is unset or stale
