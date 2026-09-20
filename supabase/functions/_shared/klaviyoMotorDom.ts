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
  | "ukendt_redigeringstype"
  | "betingelser_ugyldige"
  | "skabelon_frakoblet";

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
  /**
   * Det betingede filter på mailen — Klaviyos `additional_filters`.
   *
   * `undefined` = rør ikke. `null` = ryd filteret (send til alle, der når
   * hertil). Et objekt = sæt dette filter. De tre er IKKE det samme, og netop
   * derfor må feltet ikke læses med en hjælper, der laver alt ukendt om til
   * undefined: «rør ikke» og «ryd» ville så være samme handling.
   */
  betingelser?: Betingelser | null;
}

/**
 * Formen på et betinget filter, målt 19/9 i kontoens eget flow «Onboarding,
 * new subscriber & no order». Vi holder den løs med vilje — Klaviyo har flere
 * betingelsestyper, end vi kender — men de bærende led er faste.
 */
export interface Betingelser {
  condition_groups: Array<{ conditions: Array<Record<string, unknown>> }>;
  [andet: string]: unknown;
}

const MAIL_FELT: Record<keyof MailAendring, string> = {
  skabelonId: "template_id",
  emne: "subject_line",
  forhaandstekst: "preview_text",
  afsenderMail: "from_email",
  afsenderNavn: "from_label",
  svaradresse: "reply_to_email",
  betingelser: "additional_filters",
};

/**
 * Bygger det nye `data` for en send-email: hele message bevares, kun de
 * felter, kalderen navngiver, ændres. `undefined` betyder «rør ikke»; `null`
 * betyder «sæt til tom» — de to er ikke det samme, og forskellen er hele
 * grunden til, at et felt kan ryddes med vilje.
 */
/**
 * Dømmer et betinget filter, FØR det sendes.
 *
 * HVORFOR DEN FINDES, OG HVORFOR DEN ER FAIL-CLOSED. `additional_filters` er
 * et «send kun hvis»-filter. Sender vi et filter, Klaviyo ikke forstår, er der
 * to udfald, og begge er tavse: enten afvises kaldet, eller også ses der bort
 * fra filteret — og så går mailen til ALLE, der når hertil. Det andet udfald er
 * præcis den fejl, betingelsen skulle forhindre, og det ville ingen opdage
 * før mailen lå i indbakken.
 *
 * Derfor: kan vi ikke stå inde for filteret, sender vi det ikke. En betingelse,
 * vi er i tvivl om, er farligere end ingen betingelse, fordi den ser ud som om
 * den virker.
 *
 * `null` er et gyldigt svar og betyder «ryd filteret» — det er en udtrykkelig
 * handling, ikke en tvivl.
 */
export function doemBetingelser(v: unknown): Dom<Betingelser | null> {
  if (v === null) return { ok: true, vaerdi: null };
  if (typeof v !== "object" || Array.isArray(v)) {
    return { ok: false, fejl: "betingelser_ugyldige", forklaring: "Betingelserne skal være et objekt eller null." };
  }
  const o = v as Record<string, unknown>;
  const grupper = o.condition_groups;
  if (!Array.isArray(grupper) || grupper.length === 0) {
    return { ok: false, fejl: "betingelser_ugyldige", forklaring: "condition_groups mangler eller er tom." };
  }
  for (let g = 0; g < grupper.length; g++) {
    const gruppe = grupper[g] as Record<string, unknown> | null;
    if (!gruppe || typeof gruppe !== "object") {
      return { ok: false, fejl: "betingelser_ugyldige", forklaring: `condition_groups[${g}] er ikke et objekt.` };
    }
    const betingelser = gruppe.conditions;
    if (!Array.isArray(betingelser) || betingelser.length === 0) {
      return { ok: false, fejl: "betingelser_ugyldige", forklaring: `condition_groups[${g}].conditions mangler eller er tom.` };
    }
    for (let c = 0; c < betingelser.length; c++) {
      const b = betingelser[c] as Record<string, unknown> | null;
      const sti = `condition_groups[${g}].conditions[${c}]`;
      if (!b || typeof b !== "object") {
        return { ok: false, fejl: "betingelser_ugyldige", forklaring: `${sti} er ikke et objekt.` };
      }
      if (typeof b.type !== "string" || b.type.trim() === "") {
        return { ok: false, fejl: "betingelser_ugyldige", forklaring: `${sti}.type mangler.` };
      }
      // DEN VIGTIGSTE: en metrik-betingelse uden metric_id er den fælde, hele
      // webinar-sagen handlede om. Metrikken fandtes ikke, og en pladsholder
      // ville være gået igennem som tekst.
      if (b.type === "profile-metric") {
        const id = b.metric_id;
        if (typeof id !== "string" || !/^[A-Za-z0-9]{6}$/.test(id)) {
          return {
            ok: false,
            fejl: "betingelser_ugyldige",
            forklaring: `${sti}.metric_id er ikke et Klaviyo-id (seks tegn, bogstaver og tal). Slå metrikken op først — findes den ikke, kan betingelsen ikke sættes.`,
          };
        }
      }
    }
  }
  return { ok: true, vaerdi: o as Betingelser };
}

/**
 * Hvad Klaviyo lavede om, UDEN at vi bad om det.
 *
 * DEN FÆLDE, DEN FINDES FOR (målt 19/9 kl. 23:17): kobler man en skabelon på
 * en flowmail, KLONER Klaviyo den. Vi sendte `TVbT4b`; EFTER bar `SYKyM6` —
 * en kopi med samme navn, oprettet i selve PATCH-øjeblikket. Originalen er
 * frakoblet fra det sekund. Retter man den bagefter, sker der INTET i flowet,
 * og man opdager det aldrig, for kaldet lykkes.
 *
 * Værre: klonerne kan ikke findes med `GET /api/templates`. Både
 * `any(id,[…])` og et filter på oprettelsestidspunktet giver tom liste. De
 * findes kun, hvis man kender id'et i forvejen.
 *
 * DERFOR ER DEN GENEREL, ikke en tjek af template_id. Vi sammenligner det, vi
 * sendte, med det, der kom tilbage — felt for felt. Så fanges kloningen, og
 * også enhver anden tavs ombytning, vi endnu ikke har opdaget. En regel, der
 * kun kender den fælde, vi allerede er faldet i, fanger ikke den næste.
 *
 * Det er IKKE en fejl. Det er Klaviyos normale adfærd. Men den skal siges
 * højt, og begge id'er skal i sporet, så klonen kan findes igen.
 */
export interface Afvigelse {
  felt: string;
  vi_sendte: unknown;
  klaviyo_satte: unknown;
}

export function doemAfvigelse(
  sendtDefinition: unknown,
  efterDefinition: unknown,
): { afvigelser: Afvigelse[]; besked: string | null } {
  const afvigelser = hvadAendres(
    sendtDefinition as Record<string, unknown>,
    efterDefinition as Record<string, unknown>,
  ).map((a) => ({ felt: a.felt, vi_sendte: a.foer, klaviyo_satte: a.efter }));

  if (afvigelser.length === 0) return { afvigelser, besked: null };

  const skabelon = afvigelser.find((a) => a.felt === "data.message.template_id");
  const dele: string[] = [];
  if (skabelon) {
    dele.push(
      `Klaviyo KLONEDE skabelonen: vi koblede ${String(skabelon.vi_sendte)} på, og flowmailen bruger nu ${String(skabelon.klaviyo_satte)}. ` +
        `${String(skabelon.vi_sendte)} er frakoblet — en rettelse dér ændrer INTET i flowet. Klonen kan ikke findes i skabelonlisten, kun på id.`,
    );
  }
  const andre = afvigelser.filter((a) => a.felt !== "data.message.template_id");
  if (andre.length > 0) {
    dele.push(`Klaviyo ændrede også ${andre.map((a) => a.felt).join(", ")} uden at vi bad om det.`);
  }
  return { afvigelser, besked: dele.join(" ") };
}

/**
 * Samme spørgsmål som `doemAfvigelse`, men for et HELT flow.
 *
 * MÅLT 19/9 kl. 23:34: vi oprettede QYVEpj med `trigger_time: "11:00:00"`.
 * Klaviyo gemte `"00:00:00"`. Ingen fejl, ingen advarsel — flowet så bare
 * anderledes ud, end vi bad om. Samtidig blev alle fem skabeloner klonet.
 *
 * Et flow kan ikke sammenlignes råt felt for felt: handlingernes
 * `temporary_id` bliver til rigtige `id`'er, så ALT ville se ændret ud. Derfor
 * skæres begge sider ned til det, der kan sammenlignes meningsfuldt —
 * udløseren, genindtrædelsen og hver mail matchet på sit navn — og resten
 * lades i fred. En sammenligning, der råber ved hver oprettelse, bliver
 * ignoreret, og så fanger den heller ikke den ene gang, det gælder.
 */
function flowTilSammenligning(definition: unknown): Record<string, unknown> {
  const d = (definition ?? {}) as Record<string, unknown>;
  const ud: Record<string, unknown> = {};
  const udloesere = d.triggers;
  if (Array.isArray(udloesere) && udloesere.length > 0) {
    for (const [k, v] of Object.entries(udloesere[0] as Record<string, unknown>)) {
      // internal_metric_id tildeles af Klaviyo ved oprettelsen — ikke en afvigelse.
      if (k === "internal_metric_id") continue;
      ud[`udloeser.${k}`] = v;
    }
  }
  if (d.reentry_criteria !== undefined) ud["genindtraedelse"] = d.reentry_criteria;
  for (const h of (Array.isArray(d.actions) ? d.actions : []) as Array<Record<string, unknown>>) {
    if (h.type !== "send-email") continue;
    const besked = (((h.data ?? {}) as Record<string, unknown>).message ?? {}) as Record<string, unknown>;
    const navn = String(besked.name ?? "");
    if (navn === "") continue;
    for (const felt of ["template_id", "subject_line", "preview_text", "additional_filters", "from_email", "from_label", "reply_to_email"]) {
      ud[`mail[${navn}].${felt}`] = besked[felt];
    }
  }
  return ud;
}

export function doemFlowAfvigelse(
  sendtDefinition: unknown,
  efterDefinition: unknown,
): { afvigelser: Afvigelse[]; besked: string | null } {
  const afvigelser = hvadAendres(flowTilSammenligning(sendtDefinition), flowTilSammenligning(efterDefinition))
    .map((a) => ({ felt: a.felt, vi_sendte: a.foer, klaviyo_satte: a.efter }));
  if (afvigelser.length === 0) return { afvigelser, besked: null };

  const kloner = afvigelser.filter((a) => a.felt.endsWith("].template_id"));
  const andre = afvigelser.filter((a) => !a.felt.endsWith("].template_id"));
  const dele: string[] = [];
  if (kloner.length > 0) {
    dele.push(
      `Klaviyo KLONEDE ${kloner.length} skabelon(er): ` +
        kloner.map((k) => `${String(k.vi_sendte)} → ${String(k.klaviyo_satte)}`).join(", ") +
        ". Originalerne er frakoblet — ret klonerne, ikke dem. Klonerne kan ikke findes i skabelonlisten.",
    );
  }
  if (andre.length > 0) {
    dele.push(
      "Klaviyo ændrede også: " +
        andre.map((a) => `${a.felt} (vi sendte ${JSON.stringify(a.vi_sendte)}, Klaviyo satte ${JSON.stringify(a.klaviyo_satte)})`).join("; ") +
        ".",
    );
  }
  return { afvigelser, besked: dele.join(" ") };
}

/**
 * Er den skabelon, nogen er ved at rette, overhovedet den flowet bruger?
 *
 * Følgen af kloningen: «skabelonen til mailen» og «skabelonen flowet bruger»
 * er to forskellige ting, så snart mailen har været koblet én gang. Den her
 * dom er fail-closed, fordi den tavse vej er den farlige: at rette originalen
 * lykkes, ser rigtigt ud i sporet, og rammer ingen.
 */
export function doemSkabelonKobling(skabelonId: string, iBrug: readonly string[]): Dom<string> {
  if (iBrug.includes(skabelonId)) return { ok: true, vaerdi: skabelonId };
  return {
    ok: false,
    fejl: "skabelon_frakoblet",
    forklaring:
      iBrug.length === 0
        ? `Flowet bruger ingen skabeloner — der er ingen mailhandlinger at rette. ${skabelonId} hører ikke til her.`
        : `${skabelonId} er ikke den skabelon, flowet bruger. Flowet bruger ${iBrug.join(", ")}. ` +
          `Klaviyo kloner en skabelon, når den kobles på en flowmail, så originalen er frakoblet — en rettelse i ${skabelonId} ville ikke ændre noget i flowet.`,
  };
}

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
