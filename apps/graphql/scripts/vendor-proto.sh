#!/usr/bin/env sh
# Copies the generated @zitadel/proto package into the build context.
#
# The app consumes packages/zitadel-proto by path (file:../../packages/...),
# which a container build with apps/graphql as its context cannot see. The
# Dockerfile therefore expects a copy under vendor/zitadel-proto and places
# it at /packages/zitadel-proto inside the image, where the relative path in
# bun.lock resolves to. Run this after generating the protos and before
# building the image. The copy is gitignored.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
src="$here/../../packages/zitadel-proto"
dst="$here/vendor/zitadel-proto"

if [ ! -d "$src/es" ]; then
  echo "vendor-proto: $src is not generated (no es/ directory), run pnpm --filter @zitadel/proto generate first" >&2
  exit 1
fi

rm -rf "$dst"
mkdir -p "$dst"
# node_modules stays out: the image supplies @bufbuild/protobuf from the
# app's own pinned install
(cd "$src" && tar --exclude=node_modules -cf - .) | (cd "$dst" && tar -xf -)
echo "vendor-proto: $(du -sh "$dst" | cut -f1) copied to $dst"
