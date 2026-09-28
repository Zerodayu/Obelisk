import { env } from "@utils/env";
import Redis from "ioredis";

export const redis = new Redis({
	host: env.REDIS_HOST,
	port: Number(env.REDIS_PORT),
	// NOTE: prod Redis sits on the python-server docker host and may be exposed
	// publicly — password is optional so local docker-compose stays authless
	...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
	maxRetriesPerRequest: 3,
	enableOfflineQueue: false,
});

redis.on("error", (err) => {
	console.error("Redis connection error:", err.message);
});
