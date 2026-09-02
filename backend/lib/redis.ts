import { env } from "@utils/env";
import Redis from "ioredis";

export const redis = new Redis({
	host: env.REDIS_HOST,
	port: Number(env.REDIS_PORT),
	maxRetriesPerRequest: 3,
	enableOfflineQueue: false,
});

redis.on("error", (err) => {
	console.error("Redis connection error:", err.message);
});
