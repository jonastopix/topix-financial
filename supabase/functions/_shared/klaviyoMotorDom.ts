/**
 * klaviyoMotorDom — de rene domme bag lag 3 (udkast 19/9-2026,
 * ~/Downloads/udkast-klaviyo-motor/README.md).
 *
 * Alt her er rent: ingen fetch, ingen Supabase, ingen Deno. Det er dét, der
 * gør det testbart, og det er dét, der afgør, om en skrivning til Klaviyo
 * overhovedet må forlade huset. Selve kaldene bor i klaviyoMotor.ts.
 *
 * TRE DOMME, og de svarer til de tre måder, man kan komme galt af sted på:
 *
 *   bevarDefinition   En PATCH på en flowhandling skal sende definitionen
 *                     TILBAGE SOM DEN KOM, på nær det ene felt, der ændres.
 *                     Målt ved to afvisninger 19/9: udelades `id`, svarer
 *                     Klaviyo «Actions must have either an id or temporary
 *                     id»; udelades `links`, svarer den «You cannot change
 *                     the links of an action». INGEN af reglerne står i
 *                     skemaet — serveren håndhæver dem alligevel.
 *
 *   tvingKladde       Alt, motoren opretter, skal være kladde. Klaviyo
 *                     opretter flows som Draft «unless action status is
 *                     otherwise set in your initial request» (deres egne ord,
 *                     README §2). Sætter en handling sig selv til «live»,
 *                     ryger hele flowet live ved oprettelsen. Dommen fjerner
 *                     den mulighed, før body'en bygges.
 *
 *   doemSkabelon      CODE og USER_DRAGGABLE skrives med `html`;
 *                     SYSTEM_DRAGGABLE KUN med `definition`. Blandes de,
 *                     ødelægges den visuelle editor — spec'en siger «not
 *                     allowed» begge veje, og en ødelagt skabelon kan ikke
 *                     rulles tilbage fra vores side.
 */

// ── Typer, der beskriver det, vi sender ─────────────────────────────────────

export type Redigeringstype = "CODE" | "USER_DRAGGABLE" | "SYSTEM_DRAGGABLE";

export interface FlowhandlingsDefinition {
  id?: string | null;
  temporary_id?: string | null;
  type?: string | null;
  links?: { next?: string | null } | null;
  data?: Record<string, unknown> | null;
  [andet: string]: unknown;
}

export type DomFejl =
  | "definition_mangler"
  | "id_mangler"
  | "type_mangler"
  | "html_paa_system_draggable"
  | "definition_paa_code"
  | "indhold_mangler"
  | "ukendt_redigeringstype";

export type Dom<T> = { ok: true; vaerdi: T } | { ok: false; fejl: DomFejl; forklaring: string };

// ── 1. Bevar definitionen ───────────────────────────────────────────────────

/**
 * Bygger den definition, en PATCH skal bære: ALT fra læsningen, med kun de
 * felter, kalderen udtrykkeligt ændrer, lagt ovenpå.
 *
 * Spredningen er hele pointen. Kender Klaviyo et felt, vi aldrig har hørt om,
 * kommer det med — og det er den eneste form, der er robust over for regler,
 * vi ikke har læst. Udelades ét felt, læser Klaviyo det som en ændring.
 */
export function bevarDefinition(
  foer: FlowhandlingsDefinition | null | undefined,
  aendringer: { data?: Record<string, unknown> } = {},
): Dom<FlowhandlingsDefinition> {
  if (!foer || typeof foer !== "object") {
    return { ok: false, fejl: "definition_mangler", forklaring: "Der er ingen FØR-definition at bygge på. Læs handlingen først." };
  }
  if (!foer.id && !foer.temporary_id) {
    return {
      ok: false,
      fejl: "id_mangler",
      forklaring: "Definitionen bærer hverken id eller temporary_id. Klaviyo afviser med «Actions must have either an id or temporary id».",
    };
  }
  if (!foer.type) {
    return { ok: false, fejl: "type_mangler", forklaring: "Definitionen mangler type (fx send-email eller countdown-delay)." };
  }
  return {
    ok: true,
    vaerdi: {
      ...foer,
      ...(aendringer.data ? { data: { ...(foer.data ?? {}), ...aendringer.data } } : {}),
    },
  };
}

/**
 * Hvad ville en given body ÆNDRE i forhold til FØR? Bruges af sporet og af
 * tørkørslen, så et menneske kan se præcis de felter, der flytter sig —
 * ikke to store JSON-blokke, man selv skal sammenligne.
 */
export function hvadAendres(
  foer: Record<string, unknown> | null | undefined,
  efter: Record<string, unknown> | null | undefined,
  sti = "",
): Array<{ felt: string; foer: unknown; efter: unknown }> {
  const ud: Array<{ felt: string; foer: unknown; efter: unknown }> = [];
  const a = foer ?? {};
  const b = efter ?? {};
  for (const noegle of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = (a as Record<string, unknown>)[noegle];
    const vb = (b as Record<string, unknown>)[noegle];
    const fuldt = sti ? `${sti}.${noegle}` : noegle;
    const begge = va && vb && typeof va === "object" && typeof vb === "object" && !Array.isArray(va) && !Array.isArray(vb);
    if (begge) {
      ud.push(...hvadAendres(va as Record<string, unknown>, vb as Record<string, unknown>, fuldt));
    } else if (JSON.stringify(va) !== JSON.stringify(vb)) {
      ud.push({ felt: fuldt, foer: va ?? null, efter: vb ?? null });
    }
  }
  return ud.sort((x, y) => x.felt.localeCompare(y.felt));
}

// ── 2. Tving kladde ─────────────────────────────────────────────────────────

/** De statusser en handling kan have. «live» og «manual» må motoren aldrig sætte. */
export const KLADDE = "draft";

/**
 * Går hele definitionen igennem og sætter enhver `status` til «draft».
 * Rekursivt, fordi handlinger ligger i lister inde i lister, og fordi en
 * fremtidig handlingstype kan bære sin status et sted, vi ikke kender.
 *
 * Returnerer også, HVOR den rettede — så tørkørslen kan vise det, og så
 * sporet kan bevise, at intet gik live af sig selv.
 */
export function tvingKladde(vaerdi: unknown, sti = ""): { vaerdi: unknown; rettede: string[] } {
  const rettede: string[] = [];
  const gaa = (v: unknown, s: string): unknown => {
    if (Array.isArray(v)) return v.map((x, i) => gaa(x, `${s}[${i}]`));
    if (!v || typeof v !== "object") return v;
    const ud: Record<string, unknown> = {};
    for (const [k, vv] of Object.entries(v as Record<string, unknown>)) {
      const fuldt = s ? `${s}.${k}` : k;
      if (k === "status" && typeof vv === "string" && vv !== KLADDE) {
        rettede.push(`${fuldt}: «${vv}» → «${KLADDE}»`);
        ud[k] = KLADDE;
      } else {
        ud[k] = gaa(vv, fuldt);
      }
    }
    return ud;
  };
  return { vaerdi: gaa(vaerdi, sti), rettede };
}

/** Sandt, hvis der ikke findes én eneste status, der ikke er «draft». */
export function erHeltKladde(vaerdi: unknown): boolean {
  return tvingKladde(vaerdi).rettede.length === 0;
}

// ── 3. Døm en skabelon ──────────────────────────────────────────────────────

export interface SkabelonInput {
  navn: string;
  redigeringstype: Redigeringstype;
  html?: string | null;
  definition?: Record<string, unknown> | null;
  tekst?: string | null;
}

/**
 * CODE og USER_DRAGGABLE skrives med `html`. SYSTEM_DRAGGABLE KUN med
 * `definition` — spec'en siger ordret «not allowed for SYSTEM_DRAGGABLE» om
 * html, og «Not allowed for CODE/USER_DRAGGABLE» om definition. Sender man
 * html til en SYSTEM_DRAGGABLE, ødelægges den visuelle editor, og vi kan
 * ikke rulle det tilbage.
 */
export function doemSkabelon(i: SkabelonInput): Dom<Record<string, unknown>> {
  if (i.redigeringstype !== "CODE" && i.redigeringstype !== "USER_DRAGGABLE" && i.redigeringstype !== "SYSTEM_DRAGGABLE") {
    return { ok: false, fejl: "ukendt_redigeringstype", forklaring: `«${String(i.redigeringstype)}» er ikke CODE, USER_DRAGGABLE eller SYSTEM_DRAGGABLE.` };
  }
  if (i.redigeringstype === "SYSTEM_DRAGGABLE") {
    if (i.html) {
      return {
        ok: false,
        fejl: "html_paa_system_draggable",
        forklaring: "SYSTEM_DRAGGABLE må ikke få html — det ødelægger den visuelle editor, og det kan ikke rulles tilbage herfra. Brug definition (dnd-vejen).",
      };
    }
    if (!i.definition) return { ok: false, fejl: "indhold_mangler", forklaring: "SYSTEM_DRAGGABLE kræver definition." };
    return { ok: true, vaerdi: { name: i.navn, editor_type: i.redigeringstype, definition: i.definition, ...(i.tekst ? { text: i.tekst } : {}) } };
  }
  if (i.definition) {
    return { ok: false, fejl: "definition_paa_code", forklaring: `${i.redigeringstype} må ikke få definition — spec'en siger «Not allowed for CODE/USER_DRAGGABLE». Brug html.` };
  }
  if (!i.html) return { ok: false, fejl: "indhold_mangler", forklaring: `${i.redigeringstype} kræver html.` };
  return { ok: true, vaerdi: { name: i.navn, editor_type: i.redigeringstype, html: i.html, ...(i.tekst ? { text: i.tekst } : {}) } };
}

// ── Mailens felter på en flowhandling ───────────────────────────────────────

/** De felter lag 4 må røre på en flow-mail. Alt andet i message bevares. */
export interface MailAendring {
  skabelonId?: string | null;
  emne?: string | null;
  forhaandstekst?: string | null;
  afsenderMail?: string | null;
  afsenderNavn?: string | null;
  svaradresse?: string | null;
}

const MAIL_FELT: Record<keyof MailAendring, string> = {
  skabelonId: "template_id",
  emne: "subject_line",
  forhaandstekst: "preview_text",
  afsenderMail: "from_email",
  afsenderNavn: "from_label",
  svaradresse: "reply_to_email",
};

/**
 * Bygger det nye `data` for en send-email: hele message bevares, kun de
 * felter, kalderen navngiver, ændres. `undefined` betyder «rør ikke»; `null`
 * betyder «sæt til tom» — de to er ikke det samme, og forskellen er hele
 * grunden til, at et felt kan ryddes med vilje.
 */
export function bygMailData(foerData: Record<string, unknown> | null | undefined, aendring: MailAendring): Record<string, unknown> {
  const data = { ...(foerData ?? {}) };
  const besked = { ...((data.message as Record<string, unknown>) ?? {}) };
  for (const [vores, deres] of Object.entries(MAIL_FELT) as Array<[keyof MailAendring, string]>) {
    const v = aendring[vores];
    if (v !== undefined) besked[deres] = v;
  }
  data.message = besked;
  return data;
}
