#!/bin/bash
# Package the KWin script and publish it as a GitHub release.
#
#   ./package.sh            build, check and publish
#   ./package.sh --dry-run  build and check only; print the release notes
#
# It never commits or pushes: bump the version and changelog in a PR first,
# then run this from a clean checkout of origin/main.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

dry_run=false
case "${1:-}" in
	"") ;;
	--dry-run) dry_run=true ;;
	*) echo "usage: $0 [--dry-run]" >&2; exit 2 ;;
esac

die() { echo "package.sh: $*" >&2; exit 1; }

# gh reads its token from the keyring over the session bus. An SSH shell, or one
# inherited from an old session, can carry a missing or stale bus address, and then
# gh fails with "HTTP 401" only once the release is built. Check it up front, and
# retry with this user's session bus before giving up.
if ! $dry_run && ! gh auth status >/dev/null 2>&1; then
	bus="/run/user/$(id -u)/bus"
	if [[ -S "$bus" && "${DBUS_SESSION_BUS_ADDRESS:-}" != "unix:path=$bus" ]]; then
		echo "gh can't reach its keyring; retrying with the session bus at $bus" >&2
		export DBUS_SESSION_BUS_ADDRESS="unix:path=$bus"
	fi
	gh auth status >/dev/null 2>&1 || die "gh isn't authenticated; run 'gh auth status' to see why"
fi

# Plugin info comes from metadata.json, never from the folder name.
field() { grep -oP "\"$1\":\s*\"\K[^\"]*" metadata.json | head -n 1; }
name=$(field Id)
version=$(field Version)
info_version=$(field X-KDE-PluginInfo-Version)
[[ -n "$name" ]] || die 'no "Id" in metadata.json'
[[ -n "$version" ]] || die 'no "Version" in metadata.json'
[[ "$info_version" == "$version" ]] ||
	die "\"X-KDE-PluginInfo-Version\" ($info_version) doesn't match \"Version\" ($version) in metadata.json"
tag="${name}_v${version}"
package="${tag}.kwinscript"

# Release notes: only this version's changelog section, without its header.
notes=$(mktemp)
trap 'rm -f "$notes"' EXIT
# Leading and trailing blank lines are dropped.
awk -v header="[ $version ]" '
	$0 == header { found = 1; next }
	found && /^\[/ { exit }
	found && /^[[:space:]]*$/ { blank++; next }
	found {
		if (printed) for (i = 0; i < blank; i++) print ""
		blank = 0; printed = 1; print
	}
' CHANGELOG.txt >"$notes"
[[ -s "$notes" ]] || die "CHANGELOG.txt has no non-empty [ $version ] section"

# Only release exactly what is on origin/main, untagged, from a clean tree.
[[ -z "$(git status --porcelain)" ]] || {
	git status --short >&2
	die "the working tree isn't clean"
}
git fetch -q origin
head=$(git rev-parse HEAD)
[[ "$head" == "$(git rev-parse origin/main)" ]] || die "HEAD ($head) isn't origin/main ($(git rev-parse origin/main))"
[[ -z "$(git ls-remote --tags origin "refs/tags/$tag")" ]] || die "tag $tag already exists on origin"

# Build the package.
rm -f ./*.kwinscript
zip -rq "$package" contents metadata.json install.sh uninstall.sh README.md LICENSE
echo "package: $PWD/$package"
unzip -l "$package"
sha256sum "$package"

if $dry_run; then
	echo
	echo "release notes for $tag:"
	cat "$notes"
	echo
	echo "dry run: nothing published"
	exit 0
fi

gh release create "$tag" --target "$head" -t "$tag" -F "$notes" "$package"
echo "published $tag at $head"
