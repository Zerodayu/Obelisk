import { FormPlaceholder } from "@/components/forms/form-placeholder";
import PeerObservationForm from "@/components/forms/peer-observation-form";
import { formRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

export default async function PeerObservationPage() {
  await requireRole(formRoles("peer_observation"));
  return (
    <FormPlaceholder
      title="Peer Observation Record"
      code="peer_observation"
      pdcaStage="CHECK"
      description="7 fixed criteria observation form with per-criterion rating scales."
    >
      <PeerObservationForm />
    </FormPlaceholder>
  );
}
