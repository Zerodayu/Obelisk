// NOTE: thin shim — the schema itself lives in @obelisk/env (client subpath only,
// so this stays edge-safe for lib/dev-mode.ts; the server subpath pulls the
// build-time runtime-env snapshot and must not be imported from client code).
export { clientENV as env } from "@obelisk/env/client";
