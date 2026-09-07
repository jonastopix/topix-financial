import "@/styles/hjemmebane.css";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";

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
export const HbSpinner = () => {
  /* Mobilens grønne bundstykke (4/9, rettet her 7/9): spinneren er det
     «korte grønne blink» mellem to sider — Suspense-fallback og loading i
     App.tsx. Rammen er min-h-screen-SAFE (dvh), og lærredet males papir
     mens den er mountet; unmount lægger den tidligere værdi tilbage, så
     en spinner INDE i en Hb-skal efterlader skallens papir urørt. */
  useHbDokumentGrund();
  return (
    <div className="theme-hjemmebane flex min-h-screen-safe items-center justify-center bg-hb-paper" aria-busy>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-hb-line border-t-hb-ink-soft" />
    </div>
  );
};
