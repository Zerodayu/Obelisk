import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";
import { Logo } from "@/components/branding/logo";
import { requireGuest } from "@/server/auth";

const Register = async ({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) => {
  const { error } = await searchParams;
  await requireGuest();

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="mx-auto w-full border border-border/70 pb-0 max-sm:border-t-0 sm:max-w-md sm:rounded-xl sm:bg-card sm:p-1 sm:shadow-lg/3">
        <div className="border border-border/70 bg-muted/60 px-10 py-14 max-sm:border-x-0 sm:rounded-lg sm:shadow-sm/2">
          <Logo className="mx-auto size-9" />
          <h1 className="mt-3 text-center font-medium text-2xl tracking-[-0.015em]">
            Create an account
          </h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Sign in with your organization Google account. You&apos;ll choose
            your role after logging in.
          </p>

          <div className="mt-10">
            <RegisterForm />
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
            Already have an account?{" "}
            <Link className="text-muted-foreground underline" href="/login">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {error && (
        <div className="absolute inset-x-0 bottom-6 mx-auto flex w-fit max-w-md items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm">
          <span className="size-2 shrink-0 rounded-full bg-destructive" />
          Sign-up failed. Make sure you use your organization Google account.
        </div>
      )}
    </div>
  );
};

export default Register;
