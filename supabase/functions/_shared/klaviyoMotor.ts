/**
 * klaviyoMotor — lag 3: det, der kan LÆSE og SKRIVE i Klaviyo (udkast
 * 19/9-2026, ~/Downloads/udkast-klaviyo-motor/README.md).
 *
 * BYGGER PÅ A's `_shared/klaviyo.ts` og rører den ikke. Den forventede
 * grænseflade står i README §4 og i `KlaviyoKlient` nedenfor — ét kald, der
 * tager metode, sti og body, og svarer med JSON eller kaster en fejl med
 * status. Alt andet her er vores.
 *
 * FIRE REGLER, som motoren håndhæver, og som ikke kan slås fra:
 *
 *   1. TØRKØRSEL ER STANDARD. Hver skrivefunktion tager `skriv: boolean`.
 *      Er den falsk — og det er den, med mindre kalderen siger andet — bygges
 *      body'en, sporet skrives, og INTET sendes.
 *   2. INTET GÅR LIVE. `tvingKladde` køres over enhver body, der opretter
 *      noget. Klaviyo opretter flows som kladde «unless action status is
 *      otherwise set»; dommen fjerner den undtagelse, før body'en forlader os.
 *   3. HELE DEFINITIONEN TILBAGE. En PATCH på en flowhandling bygges med
 *      `bevarDefinition`, aldrig i hånden. To afvisninger 19/9 viste hvorfor.
 *   4. ALT SKRIVES I SPORET — FØR, det sendte, og EFTER, læst tilbage fra
 *      Klaviyo. Også tørkørsler. En agent, der ændrer kundekommunikation,
 *      skal kunne læses bagud af et menneske.
 *
 * KASTER ALDRIG mod kalderen af en anden grund end en fejl i vores egen base:
 * Klaviyo-fejl fanges og svares som et udfald, så en agent ikke kan vælte en
 * edge function ved at bede om noget dumt.
 */
import {
  bevarDefinition,
  bygMailData,
  doemSkabelon,
  hvadAendres,
  tvingKladde,
  type FlowhandlingsDefinition,
  type MailAendring,
  type SkabelonInput,
} from "./klaviyoMotorDom.ts";

// ── Grænsefladen mod A's klient (MÅLT i _shared/klaviyo.ts 19/9) ────

/**
 * A's `kald` KASTER ALDRIG. Den svarer `KlaviyoSvar{ ok, spor, krop }`, hvor
 * `spor.udfald` er et ord: ok / ingen_noegle / noegle_afvist / loft / ugyldig
 * / fejl / timeout. Det er en bedre kontrakt end et kast, og motoren er rettet
 * til den: ingen try/catch om kaldene, og udfaldet baeres direkte videre til
 * VORES spor, saa en agent kan laese hvorfor noget ikke skete.
 *
 * Dette er kun den DEL af A's fil, motoren bruger — ikke en kopi af den.
 */
/*
 * TYPERNE KOMMER FRA A, IKKE FRA EN KOPI (rettet 19/9 kl. 22.40).
 *
 * De stod her som en afskrift, indtil A tilføjede udfaldet «ingen_mail».
 * Afskriften var stadig teknisk rigtig — `kald` sætter aldrig det udfald; det
 * gør `sendHaendelse` — men to definitioner af det samme drifter, og næste
 * gang ville driften være tavs. `import type` trækker intet med ved kørsel,
 * så motoren kan stadig prøves uden at lag 1 kører.
 */
import type { KlaviyoSpor as KlaviyoSporFraA, KlaviyoSvar, KlaviyoUdfald } from "./klaviyo.ts";
export type { KlaviyoSporFraA, KlaviyoSvar, KlaviyoUdfald };

export interface KaldValg {
  metode?: "GET" | "POST" | "PATCH" | "DELETE";
  krop?: unknown;
  revision?: string;
  timeoutMs?: number;
}

/** Signaturen paa A's `kald`. Noeglen gives ind af functionen, ikke af motoren. */
export type KlaviyoKald = <T = unknown>(
  noegle: string | null | undefined,
  sti: string,
  valg?: KaldValg,
) => Promise<KlaviyoSvar<T>>;

/** Det, motoren faar ind: A's kald plus noeglen, bundet sammen én gang. */
export interface KlaviyoKlient {
  kald: <T = unknown>(metode: "GET" | "POST" | "PATCH" | "DELETE", sti: string, krop?: unknown) => Promise<KlaviyoSvar<T>>;
}

/** Binder A's `kald` og noeglen sammen, saa motoren aldrig roerer noeglen. */
export function bindKlient(kald: KlaviyoKald, noegle: string | null | undefined): KlaviyoKlient {
  return { kald: (metode, sti, krop) => kald(noegle, sti, { metode, krop }) };
}

/** Kort, laeselig grund fra A's spor — det, der havner i VORES spor. */
export function grundFra(spor: KlaviyoSporFraA): string {
  return [spor.udfald, spor.status ? `(${spor.status})` : "", spor.grund ?? spor.svar?.slice(0, 200) ?? ""]
    .filter(Boolean).join(" ").trim();
}

// ── Sporet ──────────────────────────────────────────────────────────────────

/**
 * Det lille udsnit af SupabaseClient, sporet bruger — samme form som husets
 * egen `managedEmail.ts` (`adminClient: { from: (t: string) => any }`).
 * Bevidst bredt: en præcis grænseflade ville ikke kunne tage en rigtig
 * SupabaseClient uden en cast hos hver kalder, og det er værre end dette ene
 * `any`. Motoren rører kun ÉN tabel gennem den.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SporKlient { from: (tabel: string) => any }

export type Handling =
  | "laes_flow"
  | "laes_skabelon"
  | "laes_kampagne"
  | "opret_skabelon"
  | "ret_skabelon"
  | "ret_flowmail"
  | "opret_flow";

export interface SporPost {
  handling: Handling;
  /** Klaviyos id på det, der blev rørt — null ved oprettelse i tørkørsel. */
  klaviyo_id: string | null;
  /** «flow» · «flow-action» · «template» · «campaign». */
  klaviyo_type: string;
  toerkoersel: boolean;
  /** Hele FØR-tilstanden, som den kom fra Klaviyo. */
  foer: unknown;
  /** Præcis den body, der blev (eller ville blive) sendt. */
  sendt: unknown;
  /** Læst tilbage fra Klaviyo efter skrivningen. Null ved tørkørsel og fejl. */
  efter: unknown;
  /** De felter, der flytter sig — så et menneske kan læse ændringen på ét blik. */
  aendringer: Array<{ felt: string; foer: unknown; efter: unknown }>;
  /** Statusser, dommen tvang til kladde. Tom liste = intet gik live. */
  kladde_rettelser: string[];
  udfald: "toerkoersel" | "skrevet" | "afvist" | "fejl";
  grund: string | null;
  /** Rådgiveren bag handlingen. Aldrig null — en agent handler på vegne af et menneske. */
  udfoert_af: string;
}

const LOG = "[klaviyoMotor]";

/**
 * Skriver én række i `klaviyo_spor`. Kaster ALDRIG: et spor, der fejler, må
 * ikke vælte en skrivning, der lykkedes — men det skal stå i function-loggen,
 * for et spor med huller er værre end intet spor.
 */
export async function skrivSpor(admin: SporKlient, post: SporPost): Promise<{ id: string } | null> {
  try {
    const { data, error } = await admin.from("klaviyo_spor").insert(post).select("id").maybeSingle();
    // (data/error er utypede her — SporKlient er bevidst bred; se ovenfor.)
    if (error) {
      console.error(`${LOG} SPORET FEJLEDE (${post.handling}, ${post.klaviyo_id ?? "nyt"}):`, error.message);
      return null;
    }
    return (data as { id: string } | null) ?? null;
  } catch (err) {
    console.error(`${LOG} SPORET KASTEDE (${post.handling}):`, err);
    return null;
  }
}

// ── 1. LÆS ──────────────────────────────────────────────────────────────────

export interface FlowMedHandlinger {
  flow: Record<string, unknown>;
  handlinger: Array<Record<string, unknown>>;
  genindtraedelse: { duration: number; unit: string } | null;
}

/**
 * Et helt flow med alle sine handlinger og genindtrædelseskriteriet.
 * `additional-fields[flow]=definition` er det eneste sted, genindtrædelsen kan
 * læses — den kan IKKE skrives på et eksisterende flow (README §2).
 */
/** Kastes af læsefunktionerne, når A's kald ikke gav «ok». Bærer grunden videre. */
export class LaesFejl extends Error {
  readonly udfald: KlaviyoUdfald;
  constructor(spor: KlaviyoSporFraA) {
    super(grundFra(spor));
    this.name = "LaesFejl";
    this.udfald = spor.udfald;
  }
}

export async function laesFlow(k: KlaviyoKlient, flowId: string): Promise<FlowMedHandlinger> {
  const r = await k.kald<{ data: Record<string, unknown>; included?: Array<Record<string, unknown>> }>(
    "GET",
    `/flows/${encodeURIComponent(flowId)}/?additional-fields%5Bflow%5D=definition&include=flow-actions`,
  );
  if (!r.ok || !r.krop) throw new LaesFejl(r.spor);
  const svar = r.krop;
  const attrs = (svar.data?.attributes ?? {}) as Record<string, unknown>;
  const def = (attrs.definition ?? {}) as Record<string, unknown>;
  return {
    flow: svar.data ?? {},
    handlinger: (svar.included ?? []).filter((x) => x.type === "flow-action"),
    genindtraedelse: (def.reentry_criteria as { duration: number; unit: string } | undefined) ?? null,
  };
}

export async function laesFlowhandling(k: KlaviyoKlient, handlingId: string): Promise<Record<string, unknown>> {
  const r = await k.kald<{ data: Record<string, unknown> }>("GET", `/flow-actions/${encodeURIComponent(handlingId)}/`);
  if (!r.ok || !r.krop) throw new LaesFejl(r.spor);
  return r.krop.data ?? {};
}

export async function laesSkabelon(k: KlaviyoKlient, skabelonId: string): Promise<Record<string, unknown>> {
  const r = await k.kald<{ data: Record<string, unknown> }>("GET", `/templates/${encodeURIComponent(skabelonId)}/`);
  if (!r.ok || !r.krop) throw new LaesFejl(r.spor);
  return r.krop.data ?? {};
}

/** Kampagnen med dens beskeder — læsning alene; motoren skriver ikke kampagner. */
export async function laesKampagne(k: KlaviyoKlient, kampagneId: string): Promise<{ kampagne: Record<string, unknown>; beskeder: Array<Record<string, unknown>> }> {
  const r = await k.kald<{ data: Record<string, unknown>; included?: Array<Record<string, unknown>> }>(
    "GET",
    `/campaigns/${encodeURIComponent(kampagneId)}/?include=campaign-messages`,
  );
  if (!r.ok || !r.krop) throw new LaesFejl(r.spor);
  return { kampagne: r.krop.data ?? {}, beskeder: (r.krop.included ?? []).filter((x) => x.type === "campaign-message") };
}

// ── 2. SKRIV ────────────────────────────────────────────────────────────────

export interface SkrivValg {
  /** FALSK som standard. Kun `true` sender noget til Klaviyo. */
  skriv?: boolean;
  /** Rådgiveren bag handlingen — skrives i sporet. */
  udfoertAf: string;
}

export interface Udfald<T = unknown> {
  udfald: "toerkoersel" | "skrevet" | "afvist" | "fejl";
  grund: string | null;
  /** Den body, der blev eller ville blive sendt. */
  sendt: unknown;
  efter: T | null;
  aendringer: Array<{ felt: string; foer: unknown; efter: unknown }>;
  kladdeRettelser: string[];
  sporId: string | null;
}

async function afslut<T>(
  admin: SporKlient,
  post: Omit<SporPost, "udfoert_af"> & { udfoert_af: string },
): Promise<Udfald<T>> {
  const spor = await skrivSpor(admin, post);
  return {
    udfald: post.udfald,
    grund: post.grund,
    sendt: post.sendt,
    efter: (post.efter as T) ?? null,
    aendringer: post.aendringer,
    kladdeRettelser: post.kladde_rettelser,
    sporId: spor?.id ?? null,
  };
}

/** Opret en skabelon. Dommen afgør html vs. definition; intet gætteri. */
export async function opretSkabelon(
  k: KlaviyoKlient,
  admin: SporKlient,
  input: SkabelonInput,
  valg: SkrivValg,
): Promise<Udfald> {
  const dom = doemSkabelon(input);
  if (dom.ok === false) {
    return afslut(admin, {
      handling: "opret_skabelon", klaviyo_id: null, klaviyo_type: "template", toerkoersel: valg.skriv !== true,
      foer: null, sendt: null, efter: null, aendringer: [], kladde_rettelser: [],
      udfald: "afvist", grund: `${dom.fejl}: ${dom.forklaring}`, udfoert_af: valg.udfoertAf,
    });
  }
  const body = { data: { type: "template", attributes: dom.vaerdi } };
  if (valg.skriv !== true) {
    return afslut(admin, {
      handling: "opret_skabelon", klaviyo_id: null, klaviyo_type: "template", toerkoersel: true,
      foer: null, sendt: body, efter: null, aendringer: hvadAendres({}, dom.vaerdi as Record<string, unknown>),
      kladde_rettelser: [], udfald: "toerkoersel", grund: null, udfoert_af: valg.udfoertAf,
    });
  }
  const r = await k.kald<{ data: Record<string, unknown> }>("POST", "/templates/", body);
  if (!r.ok) {
    return afslut(admin, {
      handling: "opret_skabelon", klaviyo_id: null, klaviyo_type: "template", toerkoersel: false,
      foer: null, sendt: body, efter: null, aendringer: [], kladde_rettelser: [],
      udfald: "fejl", grund: grundFra(r.spor), udfoert_af: valg.udfoertAf,
    });
  }
  return afslut(admin, {
    handling: "opret_skabelon", klaviyo_id: (r.krop?.data?.id as string) ?? null, klaviyo_type: "template", toerkoersel: false,
    foer: null, sendt: body, efter: r.krop?.data ?? null, aendringer: hvadAendres({}, dom.vaerdi as Record<string, unknown>),
    kladde_rettelser: [], udfald: "skrevet", grund: null, udfoert_af: valg.udfoertAf,
  });
}

/** Ret en skabelon. FØR læses altid først — sporet skal kunne læses bagud. */
export async function retSkabelon(
  k: KlaviyoKlient,
  admin: SporKlient,
  skabelonId: string,
  aendring: { navn?: string; html?: string; definition?: Record<string, unknown>; tekst?: string },
  valg: SkrivValg,
): Promise<Udfald> {
  let foer: Record<string, unknown>;
  try {
    foer = await laesSkabelon(k, skabelonId);
  } catch (err) {
    return afslut(admin, {
      handling: "ret_skabelon", klaviyo_id: skabelonId, klaviyo_type: "template", toerkoersel: valg.skriv !== true,
      foer: null, sendt: null, efter: null, aendringer: [], kladde_rettelser: [],
      udfald: "fejl", grund: `kunne ikke læse FØR — ${err instanceof Error ? err.message : String(err)}`, udfoert_af: valg.udfoertAf,
    });
  }
  const type = ((foer.attributes as Record<string, unknown>)?.editor_type ?? "") as string;
  // Samme dom som ved oprettelse: html og definition må ikke blandes.
  if (type === "SYSTEM_DRAGGABLE" && aendring.html !== undefined) {
    return afslut(admin, {
      handling: "ret_skabelon", klaviyo_id: skabelonId, klaviyo_type: "template", toerkoersel: valg.skriv !== true,
      foer, sendt: null, efter: null, aendringer: [], kladde_rettelser: [],
      udfald: "afvist", grund: "html_paa_system_draggable: skabelonen er SYSTEM_DRAGGABLE — html ville ødelægge den visuelle editor. Brug definition.",
      udfoert_af: valg.udfoertAf,
    });
  }
  if (type !== "SYSTEM_DRAGGABLE" && aendring.definition !== undefined) {
    return afslut(admin, {
      handling: "ret_skabelon", klaviyo_id: skabelonId, klaviyo_type: "template", toerkoersel: valg.skriv !== true,
      foer, sendt: null, efter: null, aendringer: [], kladde_rettelser: [],
      udfald: "afvist", grund: `definition_paa_code: skabelonen er ${type || "CODE/USER_DRAGGABLE"} — definition er ikke tilladt. Brug html.`,
      udfoert_af: valg.udfoertAf,
    });
  }

  const attrs: Record<string, unknown> = {};
  if (aendring.navn !== undefined) attrs.name = aendring.navn;
  if (aendring.html !== undefined) attrs.html = aendring.html;
  if (aendring.definition !== undefined) attrs.definition = aendring.definition;
  if (aendring.tekst !== undefined) attrs.text = aendring.tekst;
  const body = { data: { type: "template", id: skabelonId, attributes: attrs } };
  const foerAttrs = (foer.attributes ?? {}) as Record<string, unknown>;
  const aendringer = hvadAendres(foerAttrs, { ...foerAttrs, ...attrs });

  if (valg.skriv !== true) {
    return afslut(admin, {
      handling: "ret_skabelon", klaviyo_id: skabelonId, klaviyo_type: "template", toerkoersel: true,
      foer, sendt: body, efter: null, aendringer, kladde_rettelser: [],
      udfald: "toerkoersel", grund: null, udfoert_af: valg.udfoertAf,
    });
  }
  const r = await k.kald("PATCH", `/templates/${encodeURIComponent(skabelonId)}/`, body);
  if (!r.ok) {
    return afslut(admin, {
      handling: "ret_skabelon", klaviyo_id: skabelonId, klaviyo_type: "template", toerkoersel: false,
      foer, sendt: body, efter: null, aendringer, kladde_rettelser: [],
      udfald: "fejl", grund: grundFra(r.spor), udfoert_af: valg.udfoertAf,
    });
  }
  const efter = await laesSkabelon(k, skabelonId);
  return afslut(admin, {
    handling: "ret_skabelon", klaviyo_id: skabelonId, klaviyo_type: "template", toerkoersel: false,
    foer, sendt: body, efter, aendringer, kladde_rettelser: [], udfald: "skrevet", grund: null, udfoert_af: valg.udfoertAf,
  });
}

/**
 * Ret mailen på en flowhandling: skabelon, emne, forhåndstekst, afsender,
 * svaradresse. Bygger med `bevarDefinition` — hele definitionen tilbage,
 * inkl. id og links, ét felt ændret.
 */
export async function retFlowmail(
  k: KlaviyoKlient,
  admin: SporKlient,
  handlingId: string,
  aendring: MailAendring,
  valg: SkrivValg,
): Promise<Udfald> {
  let raa: Record<string, unknown>;
  try {
    raa = await laesFlowhandling(k, handlingId);
  } catch (err) {
    return afslut(admin, {
      handling: "ret_flowmail", klaviyo_id: handlingId, klaviyo_type: "flow-action", toerkoersel: valg.skriv !== true,
      foer: null, sendt: null, efter: null, aendringer: [], kladde_rettelser: [],
      udfald: "fejl", grund: `kunne ikke læse FØR — ${err instanceof Error ? err.message : String(err)}`, udfoert_af: valg.udfoertAf,
    });
  }
  const foerDef = ((raa.attributes as Record<string, unknown>)?.definition ?? null) as FlowhandlingsDefinition | null;
  if (foerDef?.type !== "send-email") {
    return afslut(admin, {
      handling: "ret_flowmail", klaviyo_id: handlingId, klaviyo_type: "flow-action", toerkoersel: valg.skriv !== true,
      foer: foerDef, sendt: null, efter: null, aendringer: [], kladde_rettelser: [],
      udfald: "afvist", grund: `handlingen er «${foerDef?.type ?? "ukendt"}», ikke send-email`, udfoert_af: valg.udfoertAf,
    });
  }
  const dom = bevarDefinition(foerDef, { data: bygMailData(foerDef.data ?? null, aendring) });
  if (dom.ok === false) {
    return afslut(admin, {
      handling: "ret_flowmail", klaviyo_id: handlingId, klaviyo_type: "flow-action", toerkoersel: valg.skriv !== true,
      foer: foerDef, sendt: null, efter: null, aendringer: [], kladde_rettelser: [],
      udfald: "afvist", grund: `${dom.fejl}: ${dom.forklaring}`, udfoert_af: valg.udfoertAf,
    });
  }
  const body = { data: { type: "flow-action", id: handlingId, attributes: { definition: dom.vaerdi } } };
  const aendringer = hvadAendres(foerDef as unknown as Record<string, unknown>, dom.vaerdi as unknown as Record<string, unknown>);

  if (valg.skriv !== true) {
    return afslut(admin, {
      handling: "ret_flowmail", klaviyo_id: handlingId, klaviyo_type: "flow-action", toerkoersel: true,
      foer: foerDef, sendt: body, efter: null, aendringer, kladde_rettelser: [],
      udfald: "toerkoersel", grund: null, udfoert_af: valg.udfoertAf,
    });
  }
  const r = await k.kald("PATCH", `/flow-actions/${encodeURIComponent(handlingId)}/`, body);
  if (!r.ok) {
    return afslut(admin, {
      handling: "ret_flowmail", klaviyo_id: handlingId, klaviyo_type: "flow-action", toerkoersel: false,
      foer: foerDef, sendt: body, efter: null, aendringer, kladde_rettelser: [],
      udfald: "fejl", grund: grundFra(r.spor), udfoert_af: valg.udfoertAf,
    });
  }
  const efterRaa = await laesFlowhandling(k, handlingId);
  return afslut(admin, {
    handling: "ret_flowmail", klaviyo_id: handlingId, klaviyo_type: "flow-action", toerkoersel: false,
    foer: foerDef, sendt: body, efter: (efterRaa.attributes as Record<string, unknown>)?.definition ?? null,
    aendringer, kladde_rettelser: [], udfald: "skrevet", grund: null, udfoert_af: valg.udfoertAf,
  });
}

/**
 * Opret et HELT nyt flow med alle sine handlinger på én gang.
 *
 * DET ER DENNE VEJ, LAG 4 SKAL GÅ. En handling kan ikke sættes ind i en
 * eksisterende kæde (der findes ingen POST til flow-actions), så en agent,
 * der vil ændre en struktur, bygger et nyt flow ved siden af.
 *
 * Nye handlinger bærer `temporary_id`, ikke `id` — Klaviyos egne ord:
 * «New objects within the flow definition, such as actions, will need to use
 * a temporary_id field». Motoren tvinger kladde over hele definitionen først.
 */
export async function opretFlow(
  k: KlaviyoKlient,
  admin: SporKlient,
  input: { navn: string; definition: Record<string, unknown> },
  valg: SkrivValg,
): Promise<Udfald> {
  const { vaerdi: kladde, rettede } = tvingKladde(input.definition);
  const body = { data: { type: "flow", attributes: { name: input.navn, definition: kladde } } };

  if (valg.skriv !== true) {
    return afslut(admin, {
      handling: "opret_flow", klaviyo_id: null, klaviyo_type: "flow", toerkoersel: true,
      foer: null, sendt: body, efter: null,
      aendringer: hvadAendres(input.definition, kladde as Record<string, unknown>),
      kladde_rettelser: rettede, udfald: "toerkoersel", grund: null, udfoert_af: valg.udfoertAf,
    });
  }
  const r = await k.kald<{ data: Record<string, unknown> }>("POST", "/flows/", body);
  if (!r.ok) {
    return afslut(admin, {
      handling: "opret_flow", klaviyo_id: null, klaviyo_type: "flow", toerkoersel: false,
      foer: null, sendt: body, efter: null, aendringer: [], kladde_rettelser: rettede,
      udfald: "fejl", grund: grundFra(r.spor), udfoert_af: valg.udfoertAf,
    });
  }
  {
    const svar = r.krop ?? { data: undefined };
    const nyId = (svar.data?.id as string) ?? null;
    const status = ((svar.data?.attributes as Record<string, unknown>)?.status ?? null) as string | null;
    // Klaviyo opretter som kladde. Er svaret noget andet, siger vi det HØJT i
    // sporet — så er der en antagelse, der ikke holder, og den skal ses af et
    // menneske, før lag 4 får lov at bruge vejen.
    const uventet = status && status.toLowerCase() !== "draft" ? ` ADVARSEL: flowet blev oprettet med status «${status}», ikke draft.` : "";
    if (uventet) console.error(`${LOG} opret_flow ${nyId}:${uventet}`);
    return afslut(admin, {
      handling: "opret_flow", klaviyo_id: nyId, klaviyo_type: "flow", toerkoersel: false,
      foer: null, sendt: body, efter: svar.data ?? null,
      aendringer: hvadAendres(input.definition, kladde as Record<string, unknown>),
      kladde_rettelser: rettede, udfald: "skrevet", grund: uventet.trim() || null, udfoert_af: valg.udfoertAf,
    });
  }
}
