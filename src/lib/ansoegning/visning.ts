/**
 * src/lib/ansoegning/visning.ts
 *
 * Sporet FØR ansøgningen findes (udkast 28/9-2026, README i
 * ~/Downloads/udkast-ansoegning-visning): tre anonyme trin — vist, start,
 * tastet — sendt til ansoegning-gem «spor» (sporVisning i api.ts).
 *
 * VISNINGS-ID'ET LEVER KUN I SIDENS HUKOMMELSE. Det gemmes ALDRIG i
 * localStorage, sessionStorage eller en cookie: et id til statistik på den
 * besøgendes enhed kræver samtykke (cookiebekendtgørelsen), og appen har intet
 * cookiebanner (docs/tracking.md §2 række 18; princip (g): «Grænsen er
 * loven»). Tragten vist → start → tastet → «opret» sker i ÉN sideindlæsning,
 * så hukommelsen er nok til at koble en række til sin visning. En genindlæsning
 * giver et nyt id og en ny «vist» — det står i README'ens læsevejledning.
 *
 * HVERT TRIN SENDES HØJST ÉN GANG PR. SIDEINDLÆSNING (lavSporer). Serveren er
 * idempotent på (visning_id, trin) for sig — dette sparer kun kaldene.
 *
 * Spejler VISNINGS_TRIN i supabase/functions/_shared/ansoegningVisning.ts og
 * CHECK'en i migration 20260928170000 (værn: ansoegningVisning.guard).
 */
export const VISNINGS_TRIN = ["vist", "start", "tastet"] as const;
export type VisningsTrin = (typeof VISNINGS_TRIN)[number];

/** Et tilfældigt uuid. Uden crypto.randomUUID (meget gamle browsere) bygges et v4 af getRandomValues. */
export function nytVisningsId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * En sporer, der sender hvert trin højst én gang. `send` må kaste eller afvise —
 * sporeren fanger ALT, returnerer aldrig et løfte og kan derfor ikke afventes.
 */
export function lavSporer(send: (trin: VisningsTrin) => unknown): (trin: VisningsTrin) => void {
  const sendt = new Set<VisningsTrin>();
  return (trin) => {
    if (sendt.has(trin)) return;
    sendt.add(trin);
    try {
      const r = send(trin);
      if (r && typeof (r as Promise<unknown>).catch === "function") (r as Promise<unknown>).catch(() => undefined);
    } catch {
      /* sporet må aldrig koste siden noget */
    }
  };
}
