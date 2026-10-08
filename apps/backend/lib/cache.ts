import { redis } from "./redis";
import { unitCacheKey, unitScopeOf } from "./unit-scope";

// biome-ignore lint/suspicious/noExplicitAny: generic handler wrapper
type Handler = (...args: any[]) => any;

export function cached(ttl: number, handler: Handler): Handler {
	// biome-ignore lint/suspicious/noExplicitAny: generic handler wrapper
	return async (...args: any[]) => {
		const ctx = args[0];
		const { request, set } = ctx;

		if (request.method !== "GET") return handler(...args);

		// NOTE: the key is scoped to the caller's **unit** (program/department),
		// not just its URL — these handlers serve unit-filtered rows
		// (`lib/unit-scope.ts`), so two units hitting the same path must never
		// read each other's cached response. `unitScopeOf` is session-derived,
		// and a missing user keys as `anon`, which no authenticated unit shares.
		const url = new URL(request.url);
		const key = `cache:${new Bun.CryptoHasher("sha256")
			.update(
				`${url.pathname}${url.search}#${unitCacheKey(unitScopeOf(ctx.user))}`,
			)
			.digest("hex")}`;

		try {
			const hit = await redis.get(key);
			if (hit) {
				// NOTE: the HIT response is unit-specific too — it must carry
				// the same `private` marking as the MISS path, otherwise a
				// browser/CDN could store it under heuristic (shared) caching.
				set.headers["Cache-Control"] = `private, max-age=${ttl}`;
				set.headers["X-Cache"] = "HIT";
				return JSON.parse(hit);
			}
		} catch {}

		const response = await handler(...args);

		const status = Number(set.status) || 200;
		if (status >= 200 && status < 300) {
			// NOTE: `private` — responses are per-session/per-unit and must not
			// sit in a shared (browser/CDN) cache across accounts.
			set.headers["Cache-Control"] = `private, max-age=${ttl}`;
		}
		set.headers["X-Cache"] = "MISS";

		try {
			const body =
				typeof response === "string" ? response : JSON.stringify(response);
			if (status >= 200 && status < 300) {
				await redis.setex(key, ttl, body);
			}
		} catch {}

		return response;
	};
}
