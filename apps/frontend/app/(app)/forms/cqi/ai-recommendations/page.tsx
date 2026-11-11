import { AiRecommendationsForm } from "@/components/forms/ai-recommendations-form";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function AiRecommendationsPage() {
	await requireRole(formRoles("cqi_action_plan"));
	return <AiRecommendationsForm />;
}
