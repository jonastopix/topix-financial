/**
 * annoncekilde — ÉT hjem for oversættelsen utm_source → kanalens navn
 * (udkast 20/9-2026, ~/Downloads/udkast-annoncekilde/README.md). Flyttet ud
 * af src/lib/webinar/dashboard.ts, som var den eneste, der kunne læse feltet.
 *
 * Spejlet ORDRET i supabase/functions/_shared/annoncekilde.ts — enhver ændring
 * her SKAL også laves der (paritetstest
 * src/lib/__tests__/annoncekilde.paritet.test.ts). Nul imports.
 * Kildeværnet src/lib/__tests__/annoncekilde.guard.test.ts holder listen op
 * mod de værdier, der er MÅLT i prod (fb, facebook, ig, th, an).
 */

// ── Oversættelsen ──────────────────────────────────────────────────────────

/**
 * Kanalens navn ud fra utm_source. Små, EKSPLICITTE oversættelser — alt andet
 * står som annoncøren skrev det, så en ny kilde aldrig forsvinder i en
 * «andet»-spand, vi selv har fundet på.
 *
 * utm_source er IKKE «kilden». Det er den bogstavelige værdi af én parameter i
 * det link, personen klikkede — sat af den, der lavede annoncen, den dag den
 * blev lavet (recon-meta-kaeden/fund-utm_source.md, 20/9-2026). Tre
 * annoncegenerationer gav tre stavemåder for samme kanal. Derfor oversættes
 * der ved LÆSNING, ét sted, og råværdien gemmes urørt.
 *
 * Metas {{site_source_name}} — målt i prod 20/9-2026: fb 358 · ig 60 · th 1 ·
 * an 1 («facebook» 182 er håndskrevet, fra en ældre generation):
 *   fb Facebook · ig Instagram · msg Messenger · an Audience Network · th Threads
 * Listen er fra hukommelsen, ikke citeret — Metas hjælpeside (2360940870872492)
 * er JS-renderet. Efterprøves i Ads Manager → annoncen → URL-parametre.
 */
export const KILDE_NAVNE: Readonly<Record<string, string>> = {
  fb: "Facebook", facebook: "Facebook", meta: "Facebook",
  ig: "Instagram", instagram: "Instagram",
  msg: "Messenger", messenger: "Messenger",
  an: "Audience Network",
  th: "Threads", threads: "Threads",
  li: "LinkedIn", linkedin: "LinkedIn",
  google: "Google", adwords: "Google", youtube: "YouTube",
  email: "E-mail", mail: "E-mail", newsletter: "E-mail", klaviyo: "E-mail",
};

/**
 * Kanalens navn af en rå utm_source. null = feltet er tomt (kalderen afgør,
 * hvad tomt betyder — fbclid, referrer eller «direkte»). Ukendt = råt, som
 * annoncøren skrev det. Store/små bogstaver er ligegyldige.
 */
export function kildeNavn(utmSource: string | null | undefined): string | null {
  if (typeof utmSource !== "string") return null;
  const s = utmSource.trim();
  if (s === "") return null;
  return KILDE_NAVNE[s.toLowerCase()] ?? s;
}

/** Er værdien én, vi oversætter — eller ville den stå råt på fladen? */
export function kildeErKendt(utmSource: string): boolean {
  return Object.prototype.hasOwnProperty.call(KILDE_NAVNE, utmSource.trim().toLowerCase());
}
