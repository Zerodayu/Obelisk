import { appINFO } from "@obelisk/app-info";
import type { LucideIcon } from "lucide-react";
import {
	ArrowUpAzIcon,
	ArrowUpRight,
	BadgeQuestionMark,
	DonutIcon,
	LogIn,
	NotepadTextIcon,
	Origami,
} from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
	return (
		<section className="flex h-screen w-full flex-col p-4">
			<Navbar />
			<Hero />
		</section>
	);
}

const Navbar = () => {
	const navs: { title: string; url: string; Icon: LucideIcon }[] = [
		{
			title: "Workflow",
			url: "#",
			Icon: DonutIcon,
		},
		{
			title: "Roles",
			url: "#",
			Icon: BadgeQuestionMark,
		},
		{
			title: "FAQ",
			url: "#",
			Icon: NotepadTextIcon,
		},
	];

	return (
		<div className="bg-background/80 fixed flex h-fit w-full items-center justify-between space-x-12 self-center rounded-full border px-6 py-4 backdrop-blur-md sm:w-6xl">
			<span className="flex items-center gap-2 text-xl font-black">
				<Origami size={36} />
				{appINFO.title}
			</span>
			<div className="flex">
				{navs.map(({ title, url, Icon }) => {
					return (
						<Link
							key={title}
							href={url}
							className={buttonVariants({ variant: "ghost" })}
						>
							<Icon />
							{title}
						</Link>
					);
				})}
			</div>
			<Link
				href="/login"
				className={buttonVariants({ className: "hidden sm:flex" })}
			>
				Sign in
				<LogIn />
			</Link>
		</div>
	);
};

export function Hero() {
	return (
		<div className="mx-auto mt-26 min-h-[calc(100svh-4rem)] px-6 py-16 text-center">
			<strong className="text-muted-foreground/90 font-semibold">
				Outcome-based education, digitized
			</strong>
			<h1 className="mx-auto mt-5 max-w-3xl text-4xl leading-[1.1] font-semibold tracking-tighter text-balance sm:text-5xl md:text-6xl">
				Every outcome, from class record to institutional review — without
				spreadsheets.
			</h1>
			<div className="text-muted-foreground mx-auto mt-8 max-w-3xl text-lg text-balance">
				<p>
					One upload turns raw class records into course and program attainment,
					flags at-risk students automatically, and routes every form through a
					complete approval chain. One source of truth for the whole
					institution.
				</p>
			</div>
			<div className="mt-12 flex justify-center gap-4">
				<Link href="/login" className={buttonVariants({ size: "lg" })}>
					Get started
				</Link>
				<Link
					href="#"
					className={buttonVariants({ variant: "outline", size: "lg" })}
				>
					See how it works
				</Link>
			</div>
			<p className="text-muted-foreground mt-6 text-sm">
				Benchmarks enforced · No skipped approvals · Live dashboards
			</p>

			<div className="bg-muted mt-20 aspect-video rounded-lg border p-2">
				<div className="bg-background relative h-full w-full rounded border">
					<div
						className="absolute inset-0 z-0"
						style={{
							backgroundImage: `
        linear-gradient(to right, var(--border) 1px, transparent 1px),
        linear-gradient(to bottom, var(--border) 1px, transparent 1px)
      `,
							backgroundSize: "20px 20px",
							backgroundPosition: "0 0, 0 0",
							maskImage: `
       repeating-linear-gradient(
              to right,
              black 0px,
              black 3px,
              transparent 3px,
              transparent 8px
            ),
            repeating-linear-gradient(
              to bottom,
              black 0px,
              black 3px,
              transparent 3px,
              transparent 8px
            ),
          radial-gradient(ellipse 60% 60% at 50% 50%, #000 30%, transparent 70%)
      `,
							WebkitMaskImage: `
 repeating-linear-gradient(
              to right,
              black 0px,
              black 3px,
              transparent 3px,
              transparent 8px
            ),
            repeating-linear-gradient(
              to bottom,
              black 0px,
              black 3px,
              transparent 3px,
              transparent 8px
            ),
          radial-gradient(ellipse 60% 60% at 50% 50%, #000 30%, transparent 70%)
      `,
							maskComposite: "intersect",
							WebkitMaskComposite: "source-in",
						}}
					/>
					<div className="text-muted-foreground relative z-10 flex h-full items-center justify-center text-sm">
						The pipeline, end to end.
					</div>
				</div>
			</div>
		</div>
	);
}
