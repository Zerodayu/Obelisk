// Helper to normalize names for matching
export const normalizeName = (name: string) =>
	name.toLowerCase().replace(/[^a-z0-9]/g, "");

// Helper to parse student name into last and first names
export function parseStudentName(name: string): {
	lastName: string;
	firstName: string;
} {
	if (name.includes(",")) {
		const [lastName, firstName] = name.split(",").map((s) => s.trim());
		return { lastName, firstName: firstName || "" };
	}
	const parts = name.split(" ").filter((p) => p);
	const lastName = parts.pop() || "";
	const firstName = parts.join(" ");
	return { lastName, firstName };
}
