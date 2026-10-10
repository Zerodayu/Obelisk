import { CheckCheckIcon, Clock3Icon } from "lucide-react";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/auth/onboarding-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ObeliskLogo } from "@/components/branding/obelisk-logo";
import { DEV_ENFORCE_ROLE_ACCESS, isDevMode } from "@/lib/dev-mode";
import { requestedScopeForRole, roleLabel } from "@/lib/roles";
import { listDepartments, listPrograms } from "@/server/actions/academic";
import { requireUser } from "@/server/auth";

/**
 * `/onboarding` — post-login role selection. New accounts signed in through the
 * org-restricted Google provider have no role yet; they choose one here and a
 * system_admin approves it. Users already waiting on an approval see their
 * pending request instead of the selector, so they can't file a second one.
 * Denied accounts land back here to re-file. Anyone with a granted role is
 * sent straight to the dashboard. In dev mode the route stays previewable
 * unless `DEV_ENFORCE_ROLE_ACCESS` is enabled (mirrors `requireRole`).
 */
const Onboarding = async () => {
	const user = await requireUser();

	const needsOnboarding = user.role === "user";
	const isWaiting =
		user.role === "user" && user.roleRequestStatus === "pending";
	if ((!isDevMode || DEV_ENFORCE_ROLE_ACCESS) && !needsOnboarding) {
		redirect("/dashboard");
	}

	const pendingRole = isWaiting
		? roleLabel(user.requestedRole ?? undefined)
		: undefined;

	// Scoped requests carry a program or a department — show what was filed
	// alongside the role so the applicant sees exactly what is under review.
	let pendingScope: { label: string; value: string } | undefined;
	const requestedScope = isWaiting
		? requestedScopeForRole(user.requestedRole ?? undefined)
		: null;
	const requestedProgramId =
		requestedScope === "program" ? user.programId : null;
	const requestedDepartmentId =
		requestedScope === "department" ? user.departmentId : null;
	if (requestedProgramId) {
		const programs = await listPrograms();
		const code = programs.ok
			? programs.data.find((program) => program.id === requestedProgramId)?.code
			: undefined;
		if (code) pendingScope = { label: "Program", value: code };
	} else if (requestedDepartmentId) {
		const departments = await listDepartments();
		const department = departments.ok
			? departments.data.find((entry) => entry.id === requestedDepartmentId)
			: undefined;
		const name = department?.name || department?.code;
		if (name) pendingScope = { label: "Department", value: name };
	}

	// The backend bumps `updatedAt` when a role request is filed; it's the
	// closest proxy for the submission date (no dedicated field exists).
	const submittedAt = new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(user.updatedAt));

	return (
		<div className="flex h-screen items-center justify-center">
			<div className="border-border/70 sm:bg-card mx-auto w-full border pb-0 max-sm:border-t-0 sm:max-w-md sm:rounded-xl sm:p-1 sm:shadow-lg/3">
				<div className="border-border/70 bg-muted/60 border px-10 py-14 max-sm:border-x-0 sm:rounded-lg sm:shadow-sm/2">
					<div className="relative">
						<ObeliskLogo className="mx-auto size-9" />
					</div>
					{isWaiting ? (
						<div className="mt-8 space-y-7 text-center">
							<div className="space-y-3">
								<div className="bg-warning/10 text-warning mx-auto flex size-10 items-center justify-center rounded-full">
									<Clock3Icon className="size-5" />
								</div>
								<span className="border-warning/30 bg-warning/10 text-warning inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
									Pending
								</span>
								<div className="space-y-1">
									<h1 className="text-2xl font-medium tracking-tight">
										Request pending
									</h1>
									<p className="text-muted-foreground text-sm">
										Your application for the{" "}
										<span className="text-foreground font-medium">
											{pendingRole}
										</span>{" "}
										role is being reviewed by an administrator.
									</p>
								</div>
							</div>

							<dl className="border-border/70 bg-background/60 mx-auto w-full max-w-sm space-y-2.5 rounded-lg border p-4 text-left text-sm">
								<div className="flex items-center justify-between gap-4">
									<dt className="text-muted-foreground shrink-0">Account</dt>
									<dd className="truncate font-medium">{user.email}</dd>
								</div>
								<div className="flex items-center justify-between gap-4">
									<dt className="text-muted-foreground shrink-0">
										Requested role
									</dt>
									<dd className="flex items-center gap-1.5 font-medium">
										<span className="bg-primary size-1.5 shrink-0 rounded-full" />
										{pendingRole}
									</dd>
								</div>
								{pendingScope && (
									<div className="flex items-center justify-between gap-4">
										<dt className="text-muted-foreground shrink-0">
											{pendingScope.label}
										</dt>
										<dd className="flex items-center gap-1.5 font-medium">
											<span className="bg-primary size-1.5 shrink-0 rounded-full" />
											{pendingScope.value}
										</dd>
									</div>
								)}
								<div className="flex items-center justify-between gap-4">
									<dt className="text-muted-foreground shrink-0">Submitted</dt>
									<dd className="font-medium">{submittedAt}</dd>
								</div>
							</dl>

							<ol className="mx-auto w-full max-w-sm space-y-3 text-left text-sm">
								<li className="flex items-start gap-3">
									<CheckCheckIcon className="text-success mt-0.5 size-4 shrink-0" />
									<div>
										<p className="font-medium">Request submitted</p>
										<p className="text-muted-foreground text-xs">
											You chose the role you are applying for.
										</p>
									</div>
								</li>
								<li className="flex items-start gap-3">
									<Clock3Icon className="text-warning mt-0.5 size-4 shrink-0" />
									<div>
										<p className="text-warning font-medium">Under review</p>
										<p className="text-muted-foreground text-xs">
											An administrator is reviewing your request.
										</p>
									</div>
								</li>
								<li className="flex items-start gap-3">
									<span className="border-muted-foreground/30 mt-1.5 size-3.5 shrink-0 rounded-full border-2" />
									<div>
										<p className="text-muted-foreground font-medium">
											Approved
										</p>
										<p className="text-muted-foreground text-xs">
											You will get access to the dashboard once approved.
										</p>
									</div>
								</li>
							</ol>

							<SignOutButton />
						</div>
					) : (
						<>
							<h1 className="mt-3 text-center text-2xl font-medium tracking-tight">
								Choose your role
							</h1>
							<p className="text-muted-foreground mt-1 text-center text-sm">
								Signed in as {user.email}. Pick the role you are applying for;
								an administrator will approve it.
							</p>
							<div className="mt-10">
								<OnboardingForm />
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
};

export default Onboarding;
