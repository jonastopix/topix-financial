// Eksport af nøgletal (mangellisten m16, 1/10-2026).
//
// Reglen: INGEN EKSPORT AF INGENTING. Før 1/10 tegnede /kpis «Download PDF ·
// Download CSV» som deaktiverede knapper på en tom side — to løfter, siden ikke
// kunne holde. Knapperne tegnes kun, når der er mindst én måned at eksportere
// (samme `monthlyData` som eksporten selv læser). Dommen står ét sted, så fladen
// og testen spørger det samme.

/** Skal eksportknapperne tegnes? Kun når der er mindst én måned. */
export const visEksport = (antalMaaneder: number): boolean =>
  Number.isFinite(antalMaaneder) && antalMaaneder > 0;
