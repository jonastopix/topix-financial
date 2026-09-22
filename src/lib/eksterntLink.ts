/**
 * Et eksternt link af en værdi, BRUGEREN har skrevet (22/9-2026).
 *
 * Ansøgeren skriver sin hjemmeside i et fritekstfelt, og rådgiverens
 * detaljevisning viste den som ren tekst — man kunne ikke klikke på den.
 * Det er hele ærindet. Men et href, der bygges af en fremmeds tekst, er
 * ikke et formateringsspørgsmål, og derfor er dommen skrevet ned her, ét
 * sted, ren og prøvet:
 *
 *   «https://x.dk» · «http://x.dk»   →  linket, UÆNDRET
 *   «zanco-group.dk» · «www.x.dk»    →  «https://…» i href, teksten som skrevet
 *   «javascript:alert(1)» · «mailto:…» · «data:…» · «//x.dk» · «» · «har ingen»
 *                                     →  null, altså TEKST — aldrig et link
 *
 * HVORFOR ET HVIDT SKEMA OG IKKE EN SORT LISTE. `javascript:` er den, alle
 * kender, men `data:`, `vbscript:` og `blob:` findes også, og en sort liste
 * skal vedligeholdes af den, der kender dem alle. Her er REGLEN omvendt: er
 * der overhovedet et skema, og er det ikke http eller https, bliver værdien
 * tekst. Så kan listen af farlige skemaer vokse, uden at vi skal følge med.
 *
 * HVORFOR EN VÆRT MED PUNKTUM. «har ingen» og «ved det ikke» står i prod som
 * svar. Uden kravet ville de blive til «https://har» og «https://ved» —
 * links, der ligner links og ikke virker. Mellemrum og manglende punktum
 * betyder: det her er ikke én adresse, og så er det tekst.
 *
 * FLYTTET HERTIL 22/9 fra src/lib/hjemmebane/memberProfile.ts, hvor den hed
 * det samme og gjorde mindre: den satte «https://» foran ALT, der ikke
 * begyndte med http — også «mailto:x@y.dk», som blev til det brudte link
 * «https://mailto:x@y.dk». Den bor nu i en ren fil uden Supabase-klienten,
 * så prøverne ikke skal mocke noget for at læse en streng.
 */

/**
 * Værten skal bære et punktum. Delen før det første «/», «?» eller «#» er
 * værten; «x.dk/om?a=1» og «www.x.dk» har et, «localhost» og «har» har ikke.
 */
const VAERT_MED_PUNKTUM = /^[^/?#]*\.[^/?#]+/;

/** Et skema overhovedet: «javascript:», «mailto:», «data:», «tel:», «ftp:» … */
const ETHVERT_SKEMA = /^[a-z][a-z0-9+.-]*:/i;

/**
 * href'en — eller `null`, når værdien skal vises som ren tekst.
 *
 * Returnerer ALDRIG andet end en http(s)-adresse. Det er invarianten,
 * kaldestedet hviler på: `null` betyder «tegn ingen <a>».
 */
export function eksterntHref(raa: string | null | undefined): string | null {
  if (typeof raa !== "string") return null;
  const s = raa.trim();
  if (s === "") return null;
  // Mellemrum inde i værdien: det er en sætning, ikke én adresse.
  if (/\s/.test(s)) return null;

  if (/^https?:\/\//i.test(s)) {
    // Skemaet er rigtigt — men «https://» uden vært er ikke et link.
    // URL kaster på det, og på alt andet, der ikke kan parses.
    try {
      const u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      if (u.hostname === "") return null;
    } catch {
      return null;
    }
    return s;
  }

  // Ethvert ANDET skema bliver tekst. Denne linje er værnet.
  if (ETHVERT_SKEMA.test(s)) return null;
  // Protokol-relativ («//x.dk») arver siden protokol og er ikke noget, nogen
  // skriver som sin hjemmeside.
  if (s.startsWith("//")) return null;
  if (!VAERT_MED_PUNKTUM.test(s)) return null;

  return `https://${s}`;
}
