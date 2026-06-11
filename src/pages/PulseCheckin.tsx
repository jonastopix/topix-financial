import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PulseCheckinModal from "@/components/PulseCheckinModal";

// Et link kan pege paa en bestemt maaned via /pulse?period=YYYY-MM, saa fx en
// nudge om manglende refleksion aabner praecis den periode der blev rapporteret.
// Uden param (eller ved ugyldig param) falder vi tilbage til modalens egen
// "forrige maaned"-default, saa /pulse opfoerer sig uaendret.
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const PulseCheckin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const periodParam = searchParams.get("period");
  const periodOverride = periodParam && PERIOD_RE.test(periodParam) ? periodParam : null;

  // Byg en dansk maaneds-label til den valgte periode, saa overskrift og den
  // gemte period_label viser den rigtige maaned (ikke modalens prevMonth-default).
  let periodLabelOverride: string | undefined;
  if (periodOverride) {
    const [y, m] = periodOverride.split("-").map(Number);
    periodLabelOverride = new Date(y, m - 1, 1).toLocaleDateString("da-DK", {
      month: "long",
      year: "numeric",
    });
  }

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto py-8 px-4">
        <PulseCheckinModal
          open={true}
          onOpenChange={(open) => { if (!open) navigate("/"); }}
          inline={true}
          periodKeyOverride={periodOverride ?? undefined}
          periodLabelOverride={periodLabelOverride}
        />
      </div>
    </AppLayout>
  );
};

export default PulseCheckin;
