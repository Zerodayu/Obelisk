// NOTE: thin shim — the schema lives in @obelisk/env/server, which reads
// `process.env.X ?? runtimeEnv.X`; process.env wins per key, so
// platform-provided vars still override the build-time `.env.prod` snapshot.
export { serverENV as env } from "@obelisk/env/server";
