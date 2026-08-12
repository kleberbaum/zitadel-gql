# iam

GraphQL facade over Zitadel for the Walther estate. Consumers only ever see
GraphQL. Zitadel, its Connect RPC APIs and its tokens never leak past this
service.

The facade wraps the Zitadel v2 Connect APIs (the zitadel-gql groups line)
and exposes a
Relay-flavored GraphQL schema: users (human and machine), organizations,
projects, project roles, sessions, applications, authorizations and identity
providers, plus the user lifecycle mutations (create, update, lock, password,
email verification, phone) and authorization management.

Built on stock Pylon v3 (canary) with bun as package manager and runtime. It
replaces the previous build that depended on a private Pylon fork and a
management/v1 REST layer. The v1 REST layer is gone entirely, every call goes
through the generated Connect clients.

## Where this lives

**Here, in `kleberbaum/zitadel-gql`, next to the server it fronts.** This is
the repository that gets deployed at the university, so the facade and the
Zitadel it talks to are one artifact with one history. There is no second
home and no vendored copy to keep in step.

That placement removes a class of drift by construction. The generated Connect
clients come from `../proto` in this same tree (see `buf.gen.yaml`), so they
cannot describe a different API version than the server ships: both are the
same commit. Before the move, codegen pulled a pinned tarball of this fork
over HTTP, which meant a commit sha maintained by hand in a second repository
and a codegen step that needed the network.

An older, pre-Pylon-v3 generation of this code exists at `netsnek/iam`. It is
**not** an upstream of this one and nothing is folded back into it: it predates
the rewrite, has a different area layout and does not build against this fork.
Ignore it.

## Upstream Zitadel

The service fronts the zitadel-gql instance (the public
`kleberbaum/zitadel-gql` fork: upstream main plus the complete-groups PR
zitadel#12308 plus the walther fixes) at
`https://accounts.lens.walther.exp.univie.ac.at`.

API surface notes for the fork line:

* The former v2beta services graduated to v2 for user, session, oidc,
  settings, feature, org, action, webkey, project, instance, authorization,
  internal_permission, object, filter and metadata.
* `app/v2beta` was renamed to `application/v2`.
* `zitadel.group.v2.GroupService` exists with 13 Connect-only RPCs: flat
  org-scoped groups, memberships, group grants and group manager roles,
  exposed since 2026-08-12 as the `group` area (five queries, nine mutations).
* `idp/v2` is read only and only exposes `GetIDPByID`.

## Deploy targets

The decided primary target is the **single identity package**: the facade
ships inside `ghcr.io/netsnek/zitadel-gql` together with the patched
Zitadel and runs as a sidecar in the same pod, dialing Zitadel on
`localhost:8080` (see [`zitadel-build/README.md`](https://github.com/netsnek/walther-deployment/blob/main/zitadel-build/README.md)
and [`zitadel/package-override.yaml`](https://github.com/netsnek/walther-deployment/blob/main/zitadel/package-override.yaml)).
In that setup `ZITADEL_BASE_URL` is `http://localhost:8080` and
`ZITADEL_HOST_HEADER` carries the canonical issuer host, because Zitadel
resolves its instance by Host header. If the runtime refuses the Host
override, map the issuer host to `127.0.0.1` with a pod `hostAliases` entry
instead and drop the env var.

The two standalone targets below remain buildable for development and as
fallbacks. The Worker target additionally sits behind a network reachability
gate: it only works once the edge exposes
`accounts.lens.walther.exp.univie.ac.at` publicly.

### Cloudflare Worker

`wrangler.toml` is set up with `main = ".pylon/index.js"`, nodejs_compat and
observability logs. Plaintext vars live in `[vars]`. The `AUTH_KEY`
introspection app key is a Worker secret and is never committed:

```sh
bun install
bun run generate     # proto codegen, see below
bun run build        # produces .pylon/index.js
wrangler secret put AUTH_KEY
wrangler deploy
```

`wrangler.toml` aliases `ts-morph` to an empty shim (`src/shims/ts-morph.cjs`).
Pylon's dist statically reaches its build-time chunk, which imports ts-morph,
and wrangler's bundler must resolve that specifier even though the code never
runs in the Worker. Verified with `wrangler deploy --dry-run`.

### Container (bun runtime, walther microk8s)

The `Dockerfile` builds a bun image that runs `bun .pylon/index.js` and
listens on port 3000. `src/proto` must exist in the build context, so run the
proto generation before `docker build`.

```sh
bun run generate
docker build -t iam .
docker run -p 3000:3000 -e AUTH_ISSUER=... -e AUTH_KEY=... iam
```

## Environment variables

| Variable              | Required | Purpose                                                                                     |
| --------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `AUTH_ISSUER`         | yes      | OIDC issuer of the fronted Zitadel. Used for inbound consumer auth and as API base fallback.  |
| `AUTH_KEY`            | yes      | API app key JSON for the `useAuth` introspection client (`private_key_jwt`), secret-backed.   |
| `ZITADEL_BASE_URL`    | no       | Zitadel API base URL if it differs from `AUTH_ISSUER` (internal addressing).                  |
| `ZITADEL_HOST_HEADER` | no       | Host header override for in-pod localhost dialing, set to the canonical issuer host.          |
| `ZITADEL_ORG_ID`      | no       | Default `x-zitadel-orgid` header. Explicit per-call organization ids always win.              |
| `PORT`                | no       | Listen port for the bun runtime, defaults to 3000. Ignored on Workers.                        |

## Permissions: caller-token pass-through, no exceptions

The facade adds no authorization model of its own and holds no credentials
of its own beyond the introspection app key. Every Zitadel RPC runs with the
CALLER's own bearer token forwarded as is, so Zitadel enforces the exact
per-RPC permissions it enforced on its retired REST surface. A user without
the required Zitadel role gets Zitadel's own permission-denied answer
through GraphQL, and the facade can never escalate a caller's rights. There
is no service PAT and no machine user: automation that needs machine rights
brings its own machine user's PAT as the bearer token, which passes through
with exactly that user's permissions. The permission model therefore stays
intact by construction instead of being rebuilt (and drifting) in a plugin.

One consequence for consumers: management operations require the caller's
token to carry the Zitadel project audience, requested with the scope
`urn:zitadel:iam:org:project:id:zitadel:aud`, exactly as when calling the
Zitadel APIs directly.

Passwords are not the facade's job at all: password changes happen in
Zitadel itself (Login V2 self service and reset flows), and the estate's
Samba and Vault synchronization hangs on an interrupting Zitadel Actions v2
execution on the password RPCs, see [`../docs/lens.md`](https://github.com/netsnek/walther-deployment/blob/main/docs/lens.md).

## Inbound auth

Consumer requests authenticate with OIDC tokens issued by the same Zitadel
(`useAuth({issuer: AUTH_ISSUER})`). Every mutation and every query that
returns user data is guarded with `requireAuth`, and the same token is what
gets forwarded to Zitadel for authorization (previous section).

The old stub auth mutations (`userSignIn`, `userSignOut`, `userRefresh`) are
gone. Pylon v3 `useAuth` natively provides the PKCE routes `/auth/login`,
`/auth/callback` and `/auth/logout`, so the facade does not need hand-rolled
auth mutations.

During the hermetic `pylon build` no `AUTH_ISSUER` is set, so the auth plugin
stays inactive at build time. At runtime it activates as soon as the variable
is present.

## Proto generation

`src/proto` is generated output and gitignored. `buf.gen.yaml` pulls the proto
tree straight from the pinned kleberbaum/zitadel-gql fork commit and generates
TypeScript with protoc-gen-es v2 (services come out as GenService descriptors
for `createClient`, connect-es v2 has no separate plugin):

```sh
bun run generate   # alias for: buf generate
```

Offline fallback if the tarball fetch is not possible: export the proto tree
once while you have network and keep it next to the repo, then point the
`inputs` entry of `buf.gen.yaml` at that directory.

```sh
buf export 'https://github.com/kleberbaum/zitadel-gql.git#ref=main,subdir=proto' -o third_party/proto
```

## Build and test

```sh
bun install
bun run generate    # buf generate (network fetch of the proto tarball)
bun run typecheck   # tsc --noEmit
bun run build       # pylon build, produces .pylon/index.js and schema.graphql
bun test            # schema smoke test, no network
```

The build script invokes `bun ./node_modules/@getcronit/pylon-dev/dist/index.js build`
directly because the pylon-dev bin ships without a shebang and bun's symlinked
bin cannot exec it.

## Workers compatibility note (connect-web redirect fix)

connect-web issues fetches with `redirect: 'error'`, which the Workers runtime
does not support. The transport in `src/zitadel/client.ts` wraps fetch,
rewrites `redirect: 'error'` to `'manual'` and throws on any 3xx or
opaqueredirect response. Keep this shim when touching the transport.

## Runbook gate before first deploy

The new Zitadel instance did not exist while this rebuild was written, so
nothing here has been exercised against a live server. Before the first
deploy, run at least one live RPC against the running zitadel-gql instance (for
example the `organizations` query, or `isUnique` with a throwaway login name)
and confirm it round-trips through the facade.

## Known gaps

* **Groups are exposed but not yet covered by tests against a live
  instance.** The area was verified on the proving ground
  ([`zitadel-build/proving-ground/`](https://github.com/netsnek/walther-deployment/blob/main/zitadel-build/proving-ground/)): the schema carries `group`, `groups`,
  `groupMembers`, `groupGrants`, `userGroups` plus nine mutations, the `Group`
  type resolves `members` and `grants` lazily, and `@requireAuth()` rejects an
  unauthenticated call with 401. What has NOT been exercised is a call that
  actually reaches Zitadel with a token, because that needs an app key
  provisioned on the instance. Do that before trusting the mappings,
  especially `userCount` (bigint narrowed to Int) and the membership id, which
  the facade synthesises as `groupId:userId` since the proto carries none.

* `idps` returns an empty connection. `idp/v2` has no list endpoint at
  the fork line, only `GetIDPByID`. The `idp(id)` query works.
* `Project.grants` and `Application.keys` return empty connections, as they
  did in the old facade. The schema shape is kept for compatibility.
* `createAuthorization` accepts `projectGrantId` for input compatibility, but
  authorization/v2 `CreateAuthorization` has no project grant field. The value
  is used as a project id fallback when `projectId` is missing, the org scope
  selects the grant.
* The `metadata` helpers in `src/zitadel/users.ts` (user/v2 SetUserMetadata
  and ListUserMetadata) are available to the data layer but not exposed in the
  GraphQL schema, matching the old resolver surface.

## License

EUPL-1.2, see `LICENSE`.
