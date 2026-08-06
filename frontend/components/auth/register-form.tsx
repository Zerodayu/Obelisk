"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api-client";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

/** Roles a new account may apply for (system_admin is the approver, never self-assigned). */
const SELF_SELECTABLE_ROLES = [
  "faculty",
  "program_chair",
  "dean",
  "aqau",
  "vpaa",
] as const;

const formSchema = z.object({
  name: z.string().min(2, { message: "Enter your full name." }),
  email: z.email({ message: "Invalid email address." }),
  password: z.string().min(8, {
    message: "Password must be at least 8 characters.",
  }),
  requestedRole: z.enum(SELF_SELECTABLE_ROLES, {
    message: "Select the role you are applying for.",
  }),
});

type FormValues = z.infer<typeof formSchema>;

export const RegisterForm = () => {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      requestedRole: undefined,
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/auth/sign-up/email", {
        name: values.name,
        email: values.email,
        password: values.password,
        requestedRole: values.requestedRole,
      });
      // Sign-up auto-creates a session; clear it so the pending-approval
      // account doesn't stay logged in as the default `user` role.
      await api.post("/auth/sign-out");
      router.push("/login?registered=1");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-6">
        <Controller
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Full name</FieldLabel>
              <Input
                aria-invalid={fieldState.invalid}
                className="bg-background"
                placeholder="Enter your full name"
                type="text"
                {...field}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Email</FieldLabel>
              <Input
                aria-invalid={fieldState.invalid}
                className="bg-background"
                placeholder="Enter your email"
                type="email"
                {...field}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Password</FieldLabel>
              <Input
                aria-invalid={fieldState.invalid}
                className="bg-background"
                placeholder="At least 8 characters"
                type="password"
                {...field}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="requestedRole"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Requested role</FieldLabel>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SELF_SELECTABLE_ROLES.map((role) => {
                  const selected = field.value === role;
                  return (
                    <label
                      key={role}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors",
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/60",
                      )}
                    >
                      <input
                        className="size-4 accent-primary"
                        checked={selected}
                        type="radio"
                        value={role}
                        onChange={() => field.onChange(role)}
                      />
                      {ROLE_LABELS[role as UserRole]}
                    </label>
                  );
                })}
              </div>
              <FieldDescription>
                An administrator must approve your request before you gain
                access to this role.
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          className="w-full hover:cursor-pointer"
          disabled={submitting}
          size="lg"
          type="submit"
        >
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </div>
    </form>
  );
};
