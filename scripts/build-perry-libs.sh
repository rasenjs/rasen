#!/usr/bin/env bash
#
# Build the patched Perry native libraries that `examples/perry-nikke-viewer`
# links against.
#
# Why this exists
# ---------------
# The viewer needs two behaviours that the published Perry 0.5.1520 runtime does
# not provide:
#
#   * `patches/perry-0.5.1520-native-task-drive.patch` — the single-thread async
#     model only advances the tokio runtime inside `js_wait_for_event()`'s
#     wait-driver tick. A UI app blocks in the AppKit run loop instead, so that
#     tick never runs and EVERY `fetch` stays pending forever. The patch exposes
#     `perry_drive_native_tasks()` and calls it from both `perry_poll()` and the
#     macos UI pump.
#
#   * `patches/perry-0.5.1520-ui-trace.patch` — optional per-widget tracing,
#     enabled by `PERRY_UI_TRACE=1`. Nothing is emitted without it.
#
# Without the first patch the viewer never loads its model catalogue. The
# resulting archives therefore cannot be replaced by a plain
# `npm i @perryts/perry`.
#
# Usage
# -----
#   scripts/build-perry-libs.sh [source-dir] [output-dir]
#
# Defaults: source `~/Projects/perry/0.5.1520-patched`, output
# `~/Projects/perry/libs-0.5.1520`. Point `PERRY_RUNTIME_DIR` at the output
# directory when compiling:
#
#   PERRY_RUNTIME_DIR=~/Projects/perry/libs-0.5.1520 perry compile src/main.ts -o app
#
# The source directory must be a checkout of Perry at the commit the patches were
# generated against (see PERRY_COMMIT below). A tree that already has the patches
# applied is fine and is the normal case — each patch is skipped if it is already
# present, and HEAD is only moved when it is somewhere else.
set -euo pipefail

PERRY_TAG="${PERRY_TAG:-v0.5.1520}"
PERRY_REPO="${PERRY_REPO:-https://github.com/PerryTS/perry}"
# Pin the commit rather than the tag: a moved tag would silently change the
# runtime the viewer is validated against.
PERRY_COMMIT="${PERRY_COMMIT:-381045a8735ff325621c5dfb26a3bd4f5a8798c5}"
# The nightly the archives were validated with. A different toolchain builds a
# different object format, and Xcode's `nm` cannot read LLVM 23 objects at all.
TOOLCHAIN="${PERRY_RUST_TOOLCHAIN:-nightly-2026-08-20}"

# Default to the long-lived checkout under the developer's Projects directory
# rather than `/tmp`: these trees hold the patches and the prebuilt archives the
# example builds link against, and a reboot or a cleaner would take them along
# with it. See `~/Projects/perry/README.md`.
SRC="${1:-$HOME/Projects/perry/0.5.1520-patched}"
OUT="${2:-$HOME/Projects/perry/libs-0.5.1520}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCH_DIR="$REPO_ROOT/patches"

log() { printf '\033[1m[perry-libs]\033[0m %s\n' "$*"; }

# --- source checkout ---------------------------------------------------------

if [ ! -d "$SRC/.git" ] && [ ! -f "$SRC/.git" ]; then
  log "cloning Perry into $SRC"
  git clone --quiet "$PERRY_REPO" "$SRC"
fi

cd "$SRC"

# Only move HEAD when it is somewhere else. Checking out unconditionally would
# clobber the working-tree state this project deliberately keeps: the patches are
# applied in place, so a normal run of this script starts from a MODIFIED tree and
# `git checkout <commit>` would refuse (or silently discard them). The per-patch
# check below is what decides whether a tree is in the expected shape.
if [ "$(git rev-parse HEAD)" != "$PERRY_COMMIT" ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    log "ERROR: $SRC is at $(git rev-parse --short HEAD), not the pinned"
    log "       $PERRY_COMMIT, and has uncommitted changes — refusing to switch"
    log "       and risk losing them. Commit or stash first."
    exit 1
  fi
  log "checking out $PERRY_COMMIT ($PERRY_TAG)"
  git fetch --quiet origin "$PERRY_COMMIT" 2>/dev/null || git fetch --quiet --tags
  git checkout --quiet "$PERRY_COMMIT"
else
  log "already at $PERRY_COMMIT ($PERRY_TAG)"
fi

# --- patches -----------------------------------------------------------------

for p in perry-0.5.1520-native-task-drive.patch perry-0.5.1520-ui-trace.patch; do
  if git apply --check "$PATCH_DIR/$p" 2>/dev/null; then
    log "applying $p"
    git apply "$PATCH_DIR/$p"
  elif git apply --check --reverse "$PATCH_DIR/$p" 2>/dev/null; then
    log "$p already applied — skipping"
  else
    log "ERROR: $p does not apply to $PERRY_COMMIT."
    log "       The checkout is not the revision the patch was made against."
    exit 1
  fi
done

# --- build -------------------------------------------------------------------

# perry-runtime-static / perry-stdlib-static / perry-ui-macos are the three
# archives a macOS Perry compile links. Only perry-runtime needs the LLVM side
# for a full compiler build, so this subset avoids that dependency entirely.
log "building with toolchain $TOOLCHAIN (~5 min)"
mkdir -p "$OUT"
PERRY_BUILD_COMMIT="$PERRY_COMMIT" \
  RUSTUP_TOOLCHAIN="$TOOLCHAIN" \
  cargo build --release --manifest-path "$SRC/Cargo.toml" \
  -p perry-runtime-static \
  -p perry-stdlib-static \
  -p perry-ui-macos

# The compiler locates the archives by exact name in one directory.
for a in libperry_runtime.a libperry_stdlib.a libperry_ui_macos.a; do
  found="$(find "$SRC/target/release" -maxdepth 1 -name "$a" -print -quit)"
  if [ -z "$found" ]; then
    log "ERROR: $a not produced by the build."
    exit 1
  fi
  cp "$found" "$OUT/$a"
  log "  $a -> $OUT/$a ($(du -h "$OUT/$a" | cut -f1))"
done

log "done. compile with: PERRY_RUNTIME_DIR=$OUT perry compile src/main.ts -o app"
