import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PulseCheckinModal from "@/components/PulseCheckinModal";

const PulseCheckin = () => {
  const navigate = useNavigate();
  return (
    <AppLayout>
      <div className="max-w-lg mx-auto py-8 px-4">
        <PulseCheckinModal
          open={true}
          onOpenChange={(open) => { if (!open) navigate("/"); }}
          inline={true}
        />
      </div>
    </AppLayout>
  );
};

export default PulseCheckin;
