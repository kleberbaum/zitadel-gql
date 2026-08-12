# Bun runtime image for the iam GraphQL facade.
# Build context requirement: src/proto must exist before building the image.
# Run `bun run generate` (network) or restore the offline proto export first,
# see the README section on proto generation.
FROM oven/bun:1 AS base

WORKDIR /usr/src/iam

# install dependencies into a temp directory to cache them
FROM base AS install
RUN mkdir -p /temp/dev /temp/prod
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# production-only install for the release image
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# build the pylon bundle. .dockerignore keeps the host node_modules out of the
# context, so `COPY . .` cannot clobber the hermetic install above.
FROM base AS build
COPY --from=install /temp/dev/node_modules node_modules
COPY . .
ENV NODE_ENV=production
ENV PYLON_DISABLE_TELEMETRY=1
# pylon-dev's bin ships without a shebang, so the build script invokes the
# entry file directly with bun (same reason as in the lens Dockerfile)
RUN bun run build

# release: production dependencies plus the built bundle only
FROM base AS release
ENV NODE_ENV=production
# The built bundle carries no telemetry today, the env pins that down if
# pylon ever adds a runtime phone-home.
ENV PYLON_DISABLE_TELEMETRY=1
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=build /usr/src/iam/.pylon .pylon
COPY --from=build /usr/src/iam/package.json .

USER bun
EXPOSE 3000/tcp
CMD ["bun", ".pylon/index.js"]
