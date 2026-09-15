import { FormPlaceholder } from "@/components/forms/form-placeholder";
import PeerObservationForm from "@/components/forms/peer-observation-form";

export default function PeerObservationPage() {
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
