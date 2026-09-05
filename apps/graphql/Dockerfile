# Bun runtime image for the GraphQL facade.
#
# Build context: this directory. The app consumes the workspace package
# packages/zitadel-proto by path (file:../../packages/zitadel-proto in
# package.json and bun.lock), which is outside the context, so a copy of the
# generated package is expected under vendor/zitadel-proto (see
# scripts/vendor-proto.sh) and lands at /packages/zitadel-proto in the image,
# exactly where ../../packages/zitadel-proto resolves to from /temp/dev and
# /temp/prod. bun links the package with absolute symlinks into that path,
# and Bun resolves the package's own imports from there, so the release
# stage needs the directory as well, together with @bufbuild/protobuf beside
# it.
#
# The install and build stages run on the build host's own platform: their
# output is JavaScript and a node_modules without native binaries, and Bun
# under qemu user emulation dies in `bun install`. Only the release stage is
# the target platform, and it only copies.
#
#   ./scripts/vendor-proto.sh
#   podman build --platform linux/amd64 -t idm-facade:<tag> .
FROM --platform=$BUILDPLATFORM docker.io/oven/bun:1 AS tools

WORKDIR /usr/src/graphql

# install dependencies into a temp directory to cache them
FROM tools AS install
COPY vendor/zitadel-proto /packages/zitadel-proto
RUN mkdir -p /temp/dev /temp/prod
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# production-only install for the release image. This stage runs on the
# build host, so the optional native packages (sharp behind Pylon) are asked
# for the target platform explicitly: buildah's TARGETARCH says amd64 or
# arm64, bun spells them x64 and arm64.
ARG TARGETARCH
COPY package.json bun.lock /temp/prod/
RUN cpu=$([ "$TARGETARCH" = amd64 ] && echo x64 || echo "${TARGETARCH:-x64}") \
  && cd /temp/prod && bun install --frozen-lockfile --production --os=linux --cpu="$cpu"

# The linked proto package resolves its runtime dependency from its own
# directory, so it gets the same pinned @bufbuild/protobuf the app installs.
RUN mkdir -p /packages/zitadel-proto/node_modules/@bufbuild \
  && cp -r /temp/prod/node_modules/@bufbuild/protobuf /packages/zitadel-proto/node_modules/@bufbuild/

# build the pylon bundle. .dockerignore keeps the host node_modules out of the
# context, so `COPY . .` cannot clobber the hermetic install above.
FROM tools AS build
COPY --from=install /packages/zitadel-proto /packages/zitadel-proto
COPY --from=install /temp/dev/node_modules node_modules
COPY . .
ENV NODE_ENV=production
ENV PYLON_DISABLE_TELEMETRY=1
# pylon-dev's bin ships without a shebang, so the build script invokes the
# entry file directly with bun (same reason as in the lens Dockerfile)
RUN bun run build

# release: production dependencies plus the built bundle only
FROM docker.io/oven/bun:1 AS release
WORKDIR /usr/src/graphql
ENV NODE_ENV=production
# The built bundle carries no telemetry today, the env pins that down if
# pylon ever adds a runtime phone-home.
ENV PYLON_DISABLE_TELEMETRY=1
COPY --from=install /packages/zitadel-proto /packages/zitadel-proto
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=build /usr/src/graphql/.pylon .pylon
COPY --from=build /usr/src/graphql/package.json .

USER bun
EXPOSE 3000/tcp
CMD ["bun", ".pylon/index.js"]
