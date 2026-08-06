import { redirect } from "next/navigation";

/**
 * Legacy `/faculty` URL — superseded by `/forms/clo-raw-data` (class-record
 * upload moved there). Keep this redirect while old bookmarks exist.
 */
export default function FacultyPage() {
  redirect("/forms/clo-raw-data");
}
