# Elysia with Bun runtime

Part of the Obelisk monorepo: install once at the **repo root** (`bun install`), and keep env in the root `.env.local` / `.env.prod` — dotenvx-encrypted, keys in the gitignored root `.env.keys` (see `../../.github/CONTRIBUTING.md` §2).

## Getting Started

### install dependencies

```sh
# from the repo root
bun install
```

```sh
cd apps/backend
bun dev
# or
bun db:studio
```

Open <http://localhost:8080/> with your browser to see the result. then go to `/openapi` for the apis documentation

### deploy (vercel)

From the repo root: `just deploy-backend` (preview) or `just deploy-backend prod`. The build runs `bun run build:prod`, which decrypts the root `.env.prod` and bakes it into `src/generated/runtime-env.ts` (gitignored) so the Bun-runtime function has env vars at runtime. One-time setup: `../../.github/CONTRIBUTING.md` §8.
