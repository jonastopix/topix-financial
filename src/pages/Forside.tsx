import { Navigate, useLocation } from "react-router-dom";

/** /forside — VIDERESTILLING til "/" (swappet 4/9). Ruten var den
    midlertidige adresse for rådgiverens forside på dommen (#630–#641),
    mens "/" stadig renderede AdvisorDashboard i AppLayout. Nu bærer "/"
    forsiden (Index.tsx, rådgiver-grenen), og /forside bliver stående, så
    gamle links og bogmærker ikke brækker.

    VALGT: viderestilling, ikke en kopi. Én adresse for forsiden — "/" er
    husets universelle fallback (logo-hjemlink, expired-redirect,
    rolleafvisninger, onboarding-resume, Auth), og to ruter der viser det
    samme ville drive fra hinanden den dag en af dem rettes. Search og
    hash bevares (BudgetteringRedirect-/HandoutRedirect-mønstret i
    App.tsx), og `replace`, så tilbage-knappen ikke lander på
    viderestillingen igen. AdvisorRoute gater ruten som før (App.tsx);
    et medlem der rammer den sendes til "/" af vagten og lander på sit
    eget Boardroom. */
const Forside = () => {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/", search, hash }} replace />;
};

export default Forside;
