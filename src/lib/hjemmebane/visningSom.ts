/**
 * src/lib/hjemmebane/visningSom.ts
 *
 * Dommen bag «visning som»-linjen i Hjemmebane-skallerne (3/9,
 * recon-raadgiverfladen §4): en rådgiver der har valgt et medlem
 * (company-override i useAuth) kunne SÆTTE valget fra fire Hb-flader, men
 * ikke RYDDE det fra nogen af dem — de eneste veje ud var AppLayouts
 * banner på tre gamle sider, adresselinjen eller en genindlæsning. Værst:
 * «Dit Boardroom» viste MEDLEMMETS forside, fordi companyId var sat.
 *
 * Betingelsen er AppLayout-bannerets, ordret (AppLayout.tsx:269, :321):
 * `isCompanyOverride && !viewingAsMember && isAdvisor`. «Se som medlem»
 * (viewingAsMember) er en anden ting — den skifter kun filtre, ikke
 * identitet — og bannerne har aldrig vist sig samtidig med den. Ren
 * funktion, nul imports, testet i __tests__/visningSom.test.ts.
 */

export interface VisningSomInput {
  isAdvisor: boolean;
  isCompanyOverride: boolean;
  viewingAsMember: boolean;
  companyName: string | null | undefined;
}

export interface VisningSomLinje {
  /** «Du ser Two Socks ApS» — eller «Du ser en anden virksomhed» uden navn. */
  tekst: string;
  /** Knappen der rydder valget. */
  knap: string;
}

export const VISNING_SOM_KNAP = "Tilbage til dig selv";

/** Null når linjen ikke skal vises. */
export function visningSomLinje(i: VisningSomInput): VisningSomLinje | null {
  if (!i.isAdvisor || !i.isCompanyOverride || i.viewingAsMember) return null;
  const navn = (i.companyName ?? "").trim();
  return {
    tekst: navn ? `Du ser ${navn}` : "Du ser en anden virksomhed",
    knap: VISNING_SOM_KNAP,
  };
}
