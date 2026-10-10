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

import { Button, buttonVariants } from "@/components/ui/button";

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
			title: "Contents",
			url: "#",
			Icon: DonutIcon,
		},
		{
			title: "FAQ",
			url: "#",
			Icon: BadgeQuestionMark,
		},
		{
			title: "Footer",
			url: "#",
			Icon: NotepadTextIcon,
		},
	];

	return (
		<div className="bg-background/80 fixed flex h-fit w-full items-center justify-between space-x-12 self-center rounded-full border px-6 py-4 backdrop-blur-md sm:w-6xl">
			<span className="flex text-xl font-black">
				<Origami size={36} />
			</span>
			<div className="flex">
				{navs.map(({ title, url, Icon }) => {
					return (
						<Button key={title} variant="ghost">
							<Icon />
							{title}
						</Button>
					);
				})}
			</div>
			<Button className="hidden sm:flex">
				Login
				<LogIn />
			</Button>
		</div>
	);
};

const Hero = () => {
	return (
		<div className="typeset w-8xl flex h-full flex-col items-center justify-center self-center">
			<div className="flex flex-col">
				<h1 className="text-6xl">{appINFO.title} —</h1>
				<blockquote className="font-mono text-xl">
					{appINFO.description}
				</blockquote>
			</div>
			<div className="not-typeset space-x-6 self-end py-8">
				<Button variant="ghost" size="xl">
					How to use
				</Button>
				<Link href={"/register"} className={buttonVariants({ size: "xl" })}>
					Get Started <ArrowUpRight />
				</Link>
			</div>
		</div>
	);
};
