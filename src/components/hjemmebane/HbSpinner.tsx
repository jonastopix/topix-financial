import "@/styles/hjemmebane.css";

/**
 * Route-spinneren — fuld skærm, Hb-papir, en lille rolig ring. Ses i et
 * glimt mellem to sider (login → forside, lazy-ruter) og skal ikke
 * tiltrække sig opmærksomhed: hairline-grå ring med en blød mørk kant,
 * ikke brandgrøn. Erstatter de tre ens spinnere der før stod hver for
 * sig i App.tsx (ProtectedRoute, MemberRoute, Suspense — «et kort grønt
 * blink», recon-adgangsruten §6) og AuthRoutes tomme null.
 *
 * Importerer hjemmebane.css selv, så tokens findes også når spinneren er
 * det første der tegnes (før nogen Hb-side har hentet dem).
 */
export const HbSpinner = () => (
  <div className="theme-hjemmebane flex min-h-screen items-center justify-center bg-hb-paper" aria-busy>
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-hb-line border-t-hb-ink-soft" />
  </div>
);
