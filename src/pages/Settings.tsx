import "@/styles/hjemmebane.css";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { IndstillingerView } from "@/components/hjemmebane/indstillinger/IndstillingerView";

/** /settings — indstillingerne i Hjemmebane (10/9), som /konto (9/9): tynd
    wrapper i Hb-medlemsskallen. Rådgivere har ingen af de tre dele
    (virksomhed, netværksprofil, notifikationer) og sendes til kontoen —
    som før konverteringen. Se IndstillingerViews filhoved. */
const Settings = () => {
  const { isAdvisor, isAdmin } = useAuth();
  if (isAdvisor || isAdmin) return <Navigate to="/konto" replace />;
  return (
    <HbMemberShell active="konto">
      <IndstillingerView />
    </HbMemberShell>
  );
};

export default Settings;
