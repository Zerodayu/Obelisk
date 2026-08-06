import { redirect } from "next/navigation";

/** Root landing: authenticated users go to the dashboard (which redirects to
 * /login when unauthenticated via the proxy / layout). */
export default function HomePage() {
  redirect("/dashboard");
}
