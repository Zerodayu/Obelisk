import { redis } from "./redis";

// biome-ignore lint/suspicious/noExplicitAny: generic handler wrapper
type Handler = (...args: any[]) => any;

export function cached(ttl: number, handler: Handler): Handler {
	// biome-ignore lint/suspicious/noExplicitAny: generic handler wrapper
	return async (...args: any[]) => {
		const ctx = args[0];
		const { request, set } = ctx;

		if (request.method !== "GET") return handler(...args);

		const url = new URL(request.url);
		const key = `cache:${new Bun.CryptoHasher("sha256")
			.update(url.pathname + url.search)
			.digest("hex")}`;

		try {
			const hit = await redis.get(key);
			if (hit) {
				set.headers["X-Cache"] = "HIT";
				return JSON.parse(hit);
			}
		} catch {}

		const response = await handler(...args);

		const status = Number(set.status) || 200;
		if (status >= 200 && status < 300) {
			set.headers["Cache-Control"] = `public, max-age=${ttl}`;
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
