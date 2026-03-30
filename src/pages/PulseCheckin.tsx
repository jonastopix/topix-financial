import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PulseCheckinModal from "@/components/PulseCheckinModal";

const PulseCheckin = () => {
  const navigate = useNavigate();
  return (
    <AppLayout>
      <PulseCheckinModal
        open={true}
        onOpenChange={(open) => { if (!open) navigate("/"); }}
      />
    </AppLayout>
  );
};

export default PulseCheckin;
