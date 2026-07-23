import Elysia from "elysia";
import { authPlugin } from "./v1/auth/controller";

export const apiRoutesV1 = new Elysia({ prefix: "api/v1" }).use(authPlugin);
