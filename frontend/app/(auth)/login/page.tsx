import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { LoginForm } from "@/components/auth/login-form";
import { ObeliskLogo } from "@/components/branding/obelisk-logo";
import { Separator } from "@/components/ui/separator";
import { requireGuest } from "@/server/auth";

const SignIn = async ({
  searchParams,
}: {
  searchParams: Promise<{
    registered?: string;
    error?: string;
    next?: string;
  }>;
}) => {
  const { registered, error, next } = await searchParams;
  await requireGuest();

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="mx-auto w-full border border-border/70 pb-0 max-sm:border-t-0 sm:max-w-md sm:rounded-xl sm:bg-card sm:p-1 sm:shadow-lg/3">
        <div className="border border-border/70 bg-muted/60 px-10 py-14 max-sm:border-x-0 sm:rounded-lg sm:shadow-sm/2">
          <ObeliskLogo className="mx-auto size-9" />
          <h1 className="mt-3 text-center font-medium text-2xl tracking-[-0.015em]">
            Login to Obelisk
          </h1>

          <div className="mt-10">
            <GoogleSignInButton
              callbackURL={next?.startsWith("/") ? next : "/dashboard"}
              errorCallbackURL="/login"
            />

            <div className="my-6 flex items-center justify-center gap-2 overflow-hidden">
              <Separator />
              <span className="text-muted-foreground text-sm">OR</span>
              <Separator />
            </div>

            <LoginForm next={next?.startsWith("/") ? next : "/dashboard"} />
          </div>
        </div>

        <div className="relative py-5">
          <div
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: `
        linear-gradient(45deg, transparent 49%, var(--border) 49%, var(--border) 51%, transparent 51%),
        linear-gradient(-45deg, transparent 49%, var(--border) 49%, var(--border) 51%, transparent 51%)
      `,
              backgroundSize: "40px 40px",
              WebkitMaskImage:
                "radial-gradient(ellipse 60% 60% at 50% 50%, #000 10%, transparent 90%)",
              maskImage:
                "radial-gradient(ellipse 60% 60% at 50% 50%, #000 10%, transparent 90%)",
            }}
          />

          <p className="relative isolate text-center text-sm">
            New to Obelisk?{" "}
            <Link className="text-muted-foreground underline" href="/register">
              Create an account
            </Link>
          </p>
        </div>
      </div>

      {registered === "1" && (
        <div className="absolute inset-x-0 bottom-6 mx-auto flex w-fit max-w-md items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="size-2 shrink-0 rounded-full bg-primary" />
          Account created. An administrator must approve your role request
          before you get access.
        </div>
      )}

      {error && (
        <div className="absolute inset-x-0 bottom-6 mx-auto flex w-fit max-w-md items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm">
          <span className="size-2 shrink-0 rounded-full bg-destructive" />
          Sign-in failed. Make sure you use your organization account.
        </div>
      )}
    </div>
  );
};

export default SignIn;
