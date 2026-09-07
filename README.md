# jaen-idm

A modern, user-centric identity management with a GraphQL API, built on a
Zitadel backend. One typed API is the only way to manage identity: no
management UI, no REST, no v1 login. People use it through the products
that embed it, operators use it through the API, and agents use it
through MCP.

## Why

Zitadel is a solid identity engine: organisations, projects, applications,
users, roles, sessions, OIDC. Its surface is not: a management console
that mirrors the engine's internals, a REST API and a gRPC API that
overlap, a v1 login that is being replaced, and three generations of
concepts side by side. Every product built on it ends up writing its own
layer to hide that, and every operator ends up in the console anyway.

jaen-idm is that layer, once, for everyone: a GraphQL schema shaped
around people and the things they own, over Zitadel's Connect APIs, with
the engine hidden behind it. The goal is to switch the console, the REST
API and the v1 login off and never miss them.

## What it is

- **One GraphQL endpoint per site**, `https://idm.<site>/graphql`, one
  Pylon service (`apps/graphql`) deployed once per estate and scoped by
  the caller's organisation.
- **A schema of people, not of the engine.** `user`, `users`,
  `organization`, `project`, `application`, `authorization` (the roles a
  person holds), `idp`, `group`, `session`. Every list is a Relay
  connection, every id is the engine's, every mutation is one intention
  (`inviteUser`, `grantRole`, `revokeRole`, `setPassword`, `addIdp`).
- **One way to authenticate.** A caller sends a Zitadel token. The
  service introspects it against the engine, caches the answer for sixty
  seconds, and decides by the roles of the caller's organisation
  (`<org>:admin`, `<org>:manager`, `jaen:admin`). That module,
  `apps/graphql/src/auth.ts`, is the one every jaen service copies: the
  storage gateway, the jaen agent, the applications built on jaen. No
  service authenticates in a way of its own.
- **Management only through the API and through MCP.** The same schema
  is exposed as MCP tools, so an operator's agent can invite a user,
  grant a role or read a session with the same rights the operator
  holds, and nothing else. There is no console to fall back to.
- **The login is the product's.** Sign-in, second factor and passkeys run
  through Zitadel's login v2 behind the product's own domain and look;
  the v1 login is not offered.

## What exists today, honestly

The service is the façade that runs `idm.limosen.at` and
`idm.booklimo.at`: organisations, users, roles, applications, IdPs,
sessions and introspection over Zitadel's Connect APIs, on Cloudflare
Workers and in a container image for a cluster. The console is still
reachable at the engine for the operations the schema does not cover
yet, and those are the roadmap:

1. every management operation the estate uses, in the schema, so the
   console can be switched off for operators;
2. the MCP server over the schema, with the caller's own token, no
   service account;
3. login v2 on every site, the v1 login switched off at the engine;
4. the REST API switched off at the engine, gRPC reachable from this
   service alone;
5. the engine's own admin (system users, instance settings) behind the
   same schema, so the last console door closes.

## Layout

```
apps/graphql      the service: Pylon v3, the schema, auth.ts, wrangler.toml, Dockerfile
apps/login        Zitadel's login v2, the one people see
apps/api          the engine (Zitadel), vendored, unchanged where possible
README.zitadel.md the upstream's README, kept for the lineage
```

## Running it

```
cd apps/graphql
bun install
bun run dev          # against the engine named in .dev.vars (AUTH_ISSUER, the org manager token)
bun run test
bun run deploy       # wrangler, one Worker per estate
```

`AUTH_ISSUER` is always set. A caller without a valid token gets
`UNAUTHENTICATED`, a caller outside the organisation gets `FORBIDDEN`,
never an empty list.

## Where it belongs

jaen-idm is one of the pieces jaen runs on, with the jaen monorepo
(`jaenjs/jaen`, which carries this repository as the submodule
`services/jaen-idm`), the storage gateway (`jaenjs/open-storage-gateway`)
and the jaen agent (`jaenjs/jaen-agent`). Lineage: `netsnek/iam` and
`kleberbaum/zitadel-gql`.

## License

The service under `apps/graphql` is licensed as the rest of jaen. The
engine under `apps/api` keeps Zitadel's license, see `README.zitadel.md`.
