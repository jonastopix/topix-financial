/**
 * stilleDom — de to klokker, der ikke fandtes (20/9-2026): «betalt, ingen
 * bruger» og «ingen login». Ren: nul imports, ingen I/O. Spejlet byte for byte
 * i src/lib/stilleDom.ts (stilleDom.paritet.test.ts). Cronen
 * stille-klokker-cron læser data og skriver klokken; dommen og teksterne bor her.
 *
 * MÅLT 20/9 på kontrakter (28 betalende): 5 har aldrig fået et menneske ind
 * (WESDEX, Din økonomiafdeling, Two Socks, Pro-Vision, E-skilte), 4 har en
 * bruger, der ikke har været inde i 30 dage (Brick Works 145 dage, TuaMea 138,
 * Capture IT 97, Homie 95). Ingen klokke ringede. Samme mønster som
 * beslutningsvinduet: systemet ved det, og ingen får det at vide.
 *
 * TÆRSKLERNE KOMMER AF TALLENE (maal.sql §4/§5, Jonas 20/9), ikke af fornemmelse:
 *   A · ingen bruger: 30 · 60 · 90, derefter hver 30. dag.
 *     Onboarding-dage fra kontraktstart til første bruger, KUN kontrakter efter
 *     1/1-2026 (de historiske fra 2025 forurener p90 — oprettet før platformen):
 *     0, 1, 10, 14, 0, 5, 1, 28, 6, 2, 18, 37, 54, 0 → median 5,5 · max 54.
 *     TOFT tog 37 dage og TuaMea 54 og blev rigtige medlemmer — så trin 1 er en
 *     PÅMINDELSE («send invitationen igen»), ikke en alarm. Din Forsikringsret
 *     (15/9) og Nordic By Hand (14/9) ringer ikke, mens onboarding kører.
 *   B · ingen login: 90 · 120 · 150 — og B4 i beslutningsvinduet uanset trin.
 *     Største hul mellem to logins hos dem, der bruger platformen: median 35
 *     dage · p90 68,8 · max 78. Tolv aktive har haft et hul ≥ 30 dage, tre
 *     ≥ 60 (YKRG 72 dage og inde 17/9; TOFT 78 og inde 4/9). Ved 60 ville
 *     klokken have ringet om tre, der kom tilbage af sig selv — og en klokke,
 *     der råber om folk, der kommer tilbage, lærer man at lukke. 90 er over p90.
 *     Brick Works, TuaMea, Capture IT og Homie ringer stadig alle fire.
 *
 * DER FINDES INTET FERIEVÆRN, og der kan ikke bygges et: 22 af 23 betalende
 * med bruger har KUN ÉN bruger (kun BR Roset har to). Én persons ferie ER hele
 * virksomhedens stilhed. Det er endnu en grund til 90 dage. B regner fra sidste
 * login på tværs af alle virksomhedens brugere — hos de 22 er det én person.
 *
 * REGLERNE (én test pr. regel i stilleDom.test.ts):
 *   1. Grundmængden er kontrakter (periode dækker i dag, pris > 0, ikke gratis),
 *      ikke companies.contract_end_date og ikke Stripe: syv medlemmer betaler
 *      gennem e-conomic og findes kun i kontrakter.
 *   2. status = 'tidligere' slukker klokken. Et menneske har afgjort det.
 *      En klokke, der råber om noget afgjort, lærer folk at lukke klokker.
 *      Legat og ikke-kunder (er_kunde = false) ringer heller ikke.
 *   3. Tærsklerne er konstanter her — ét sted.
 *   4. A skelner tre tilstande med hver sin handling: ingen invitation sendt ·
 *      invitation pending · invitation udløbet/afvist.
 *   5. B regner fra sidste login på tværs af ALLE brugere. user_login_log
 *      findes fra 2/3-2026 (LOGIN_LOG_FRA); «siden» ligger aldrig før — uden
 *      en eneste række siges «siden målingen begyndte», ikke en dato, der lyver.
 *   6. Én klokke pr. virksomhed pr. trin pr. episode: dedup i skrivRaadgiverBesked
 *      går på TITLEN (reference_id er uuid og kan ikke bære et trin), så titlen
 *      bærer tærsklen og episodens dato — betalingsdagen for A, sidste login for
 *      B — og er den samme hver dag, indtil næste trin.
 *   7. Reaktion slukker: en bruger → A tier; et login → B tier og tæller forfra
 *      (ny episode = ny titel).
 *   8. B4: i beslutningsvinduet (VINDUE_DAGE før slutdato) ringer den, der har
 *      været stille i B_VINDUE_STILLE_DAGE, uanset om B1–B3 er sprunget over —
 *      og står ved siden af beslutningen.
 *  12. INGEN BRUGER ER IKKE EN DØDSDOM — og teksten må ikke lyde som en. Målt 20/9
 *      på de udløbne kontraktår: med bruger fornyede 3 af 4; uden bruger 1 af 12
 *      (KJ AUTO — de kom ind i år 2); 7 var slettet, beviset væk. Fornyede havde
 *      median 10,7 logins pr. 30 dage før slut, ikke fornyede NUL. For få til
 *      statistik (Wilson [1,5–35,4] for de tolv), for stærkt til at ignorere.
 *      Og en fornyelse uden brug er en, der ikke kommer igen — derfor B.
 *  11. Den tavse dom hedder "tavs", ikke null: tsconfig har strict = false, og uden
 *      strictNullChecks er null ingen diskriminant — TypeScript kan ikke skille
 *      grenene ad, og tsc fejler på hver eneste feltlæsning (målt 20/9).
 *   9. Teksten er en handling, ikke en observation: hvem · hvor længe · hvad det
 *      koster · hvornår det afgøres · hvad du gør.
 *  10. Dage regnes i hele UTC-kalenderdage som fornyelse.ts — samme tal uanset
 *      maskinens tidszone.
 */

export const TYPE_INGEN_BRUGER = "stille_ingen_bruger";
export const TYPE_INGEN_LOGIN = "stille_ingen_login";

/** Første dag i user_login_log (migration 20260302213733). «Siden» ligger aldrig før. */
export const LOGIN_LOG_FRA = "2026-03-02";

/** A · betalt, ingen bruger: dage efter kontraktstart. Median onboarding 5,5 dage, max 54 (2026-kontrakter). */
export const A_TRIN_DAGE = [30, 60, 90] as const;
/** Efter sidste trin: igen hver 30. dag, indtil en bruger kommer eller nogen sætter 'tidligere'. */
export const A_GENTAG_DAGE = 30;

/** B · ingen login: dage efter sidste login. Største målte hul hos en aktiv: 78 dage — 90 ligger over p90 (68,8). */
export const B_TRIN_DAGE = [90, 120, 150] as const;
/** B4: så mange dage stille er «stille» i beslutningsvinduet (samme tal som målingen 20/9). */
export const B_VINDUE_STILLE_DAGE = 30;
/** = FORNYELSES_VINDUE_DAGE (fornyelse.ts). Gentaget her, fordi filen er import-fri; stilleDom.guard.test værner ligheden. */
export const VINDUE_DAGE = 60;

export interface StilleKontrakt {
  companyId: string;
  navn: string;
  /** companies.status — 'active' | 'tidligere'. Alt andet end 'active' er tavst. */
  status: string | null;
  erKunde: boolean | null;
  erLegat: boolean | null;
  /** «YYYY-MM-DD», slut EKSKLUSIV som overalt i huset. */
  periodeStart: string;
  periodeSlut: string;
  betalingsmodel: string;
  prisEksMomsOere: number;
  kontaktperson: string | null;
  kontaktEmail: string | null;
}

export interface StilleBruger {
  companyId: string;
  userId: string;
  navn: string | null;
  /** company_members.created_at (ISO). */
  oprettetAt: string;
}

export interface StilleLogin {
  userId: string;
  /** Seneste user_login_log.logged_in_at (ISO). */
  sidsteLogin: string;
}

export interface StilleInvitation {
  companyId: string;
  email: string;
  status: string;
  /** company_invitations.created_at (ISO). */
  sendtAt: string;
  accepteretAt: string | null;
}

export type Invitationstilstand = "ingen_invitation" | "pending" | "udloebet";

export type TavsGrund = "ikke_aktiv" | "legat" | "ikke_kunde" | "gratis" | "uden_for_periode" | "for_tidligt" | "aktiv";

export type StilleDom =
  | {
      klokke: "ingen_bruger";
      trin: number;
      /** Tærsklen, trinnet svarer til (30, 60, 90, 120, …) — den står i titlen, ikke dagstallet. */
      taerskel: number;
      dage: number;
      tilstand: Invitationstilstand;
      /** Den seneste invitation, når der findes en. */
      invitation: StilleInvitation | null;
    }
  | {
      klokke: "ingen_login";
      trin: 1 | 2 | 3 | 4;
      taerskel: number;
      dage: number;
      /** «YYYY-MM-DD»: sidste login — eller målingens begyndelse, når der ingen række er. */
      sidenDag: string;
      maaltFra: boolean;
      dageTilSlut: number;
      iVinduet: boolean;
      brugere: number;
    }
  | { klokke: "tavs"; grund: TavsGrund };

// ── Dage (UTC-komponenter, som fornyelse.ts) ─────────────────────────

function dagVaerdi(d: string | Date): number {
  const x = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}

/** Hele kalenderdage fra a til b (b − a). */
export function dageMellem(a: string | Date, b: string | Date): number {
  return Math.floor((dagVaerdi(b) - dagVaerdi(a)) / 86_400_000);
}

function isoDag(d: string | Date): string {
  return new Date(dagVaerdi(d)).toISOString().slice(0, 10);
}

function plusDage(dag: string, dage: number): string {
  return new Date(dagVaerdi(dag) + dage * 86_400_000).toISOString().slice(0, 10);
}

const MAANEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

/** «28. april 2026» — UTC-komponenter, samme dato som Postgres' ::date. */
export function danskDato(d: string | Date): string {
  const x = new Date(dagVaerdi(d));
  return `${x.getUTCDate()}. ${MAANEDER[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}

/** «42.000» af 4.200.000 øre. */
export function krAfOere(oere: number): string {
  return Math.round(oere / 100).toLocaleString("da-DK");
}

// ── Dommen ────────────────────────────────────────────────────────────

function tavs(grund: TavsGrund): StilleDom {
  return { klokke: "tavs", grund };
}

/** Regel 2 og 1: hvem klokken aldrig ringer om. */
export function erIGrundmaengden(k: StilleKontrakt, nu: Date): TavsGrund | null {
  if (k.status !== "active") return "ikke_aktiv";
  if (k.erLegat === true) return "legat";
  if (k.erKunde === false) return "ikke_kunde";
  if (k.betalingsmodel === "gratis" || k.prisEksMomsOere <= 0) return "gratis";
  const nuDag = isoDag(nu);
  if (!(k.periodeStart <= nuDag && nuDag < k.periodeSlut)) return "uden_for_periode";
  return null;
}

/** Regel 4: den seneste invitation afgør tilstanden. */
export function invitationstilstand(invitationer: readonly StilleInvitation[]): { tilstand: Invitationstilstand; invitation: StilleInvitation | null } {
  if (invitationer.length === 0) return { tilstand: "ingen_invitation", invitation: null };
  const seneste = [...invitationer].sort((a, b) => (a.sendtAt < b.sendtAt ? 1 : -1))[0];
  return { tilstand: seneste.status === "pending" ? "pending" : "udloebet", invitation: seneste };
}

/** Tærsklen for A-trin n: 30, 60, 90, 120, 150, … */
export function taerskelA(trin: number): number {
  return trin <= A_TRIN_DAGE.length ? A_TRIN_DAGE[trin - 1] : A_TRIN_DAGE[A_TRIN_DAGE.length - 1] + (trin - A_TRIN_DAGE.length) * A_GENTAG_DAGE;
}

function trinA(dage: number): number {
  if (dage < A_TRIN_DAGE[0]) return 0;
  let trin = 0;
  for (const t of A_TRIN_DAGE) if (dage >= t) trin++;
  const sidste = A_TRIN_DAGE[A_TRIN_DAGE.length - 1];
  if (dage >= sidste) trin += Math.floor((dage - sidste) / A_GENTAG_DAGE);
  return trin;
}

export function doemStille(
  k: StilleKontrakt,
  brugere: readonly StilleBruger[],
  logins: readonly StilleLogin[],
  invitationer: readonly StilleInvitation[],
  nu: Date,
): StilleDom {
  const grund = erIGrundmaengden(k, nu);
  if (grund) return tavs(grund);
  const egne = brugere.filter((b) => b.companyId === k.companyId);

  if (egne.length === 0) {
    const dage = dageMellem(k.periodeStart, nu);
    const trin = trinA(dage);
    if (trin === 0) return tavs("for_tidligt");
    const { tilstand, invitation } = invitationstilstand(invitationer.filter((i) => i.companyId === k.companyId));
    return { klokke: "ingen_bruger", trin, taerskel: taerskelA(trin), dage, tilstand, invitation };
  }

  // Regel 5: sidste login på tværs af alle brugere — eller målingens begyndelse.
  const ids = new Set(egne.map((b) => b.userId));
  let sidste: string | null = null;
  for (const l of logins) {
    if (!ids.has(l.userId)) continue;
    if (sidste === null || l.sidsteLogin > sidste) sidste = l.sidsteLogin;
  }
  let maaltFra = false;
  let sidenDag: string;
  if (sidste === null) {
    maaltFra = true;
    const foersteBruger = egne.map((b) => isoDag(b.oprettetAt)).sort()[0];
    sidenDag = foersteBruger > LOGIN_LOG_FRA ? foersteBruger : LOGIN_LOG_FRA;
  } else {
    sidenDag = isoDag(sidste);
  }
  const dage = dageMellem(sidenDag, nu);
  const dageTilSlut = dageMellem(nu, k.periodeSlut);
  const iVinduet = dageTilSlut <= VINDUE_DAGE;
  const faelles = { klokke: "ingen_login" as const, dage, sidenDag, maaltFra, dageTilSlut, iVinduet, brugere: egne.length };

  // Regel 8: i vinduet ringer den stille uanset trin.
  if (iVinduet && dage >= B_VINDUE_STILLE_DAGE) return { ...faelles, trin: 4, taerskel: B_VINDUE_STILLE_DAGE };
  if (dage >= B_TRIN_DAGE[2]) return { ...faelles, trin: 3, taerskel: B_TRIN_DAGE[2] };
  if (dage >= B_TRIN_DAGE[1]) return { ...faelles, trin: 2, taerskel: B_TRIN_DAGE[1] };
  if (dage >= B_TRIN_DAGE[0]) return { ...faelles, trin: 1, taerskel: B_TRIN_DAGE[0] };
  return tavs(dage >= B_VINDUE_STILLE_DAGE ? "for_tidligt" : "aktiv");
}

// ── Teksterne (regel 9) ───────────────────────────────────────────────

const MAANEDER_TAL: Record<number, string> = { 30: "en måned", 60: "to måneder", 90: "tre måneder", 120: "fire måneder", 150: "fem måneder", 180: "seks måneder" };

function maaneder(dage: number): string {
  return MAANEDER_TAL[dage] ?? `${dage} dage`;
}

/** Hvem der ringes til: kontaktpersonen, ellers den første bruger, ellers invitationens mail, ellers virksomheden. */
export function kontaktAf(k: StilleKontrakt, brugere: readonly StilleBruger[], invitation: StilleInvitation | null): string {
  const kp = (k.kontaktperson ?? "").trim();
  if (kp) return kp;
  const bruger = brugere.find((b) => b.companyId === k.companyId && (b.navn ?? "").trim());
  if (bruger) return (bruger.navn as string).trim();
  if (invitation) return invitation.email;
  return (k.kontaktEmail ?? "").trim() || "virksomheden";
}

export interface StilleTekst {
  /** Dedup-nøglen (regel 6): tærskel + episodens dato, aldrig dagstallet. */
  title: string;
  body: string;
}

export function stilleTekst(
  dom: StilleDom,
  k: StilleKontrakt,
  brugere: readonly StilleBruger[],
  fornyelsesprisOere: number | null,
): StilleTekst | null {
  if (dom.klokke === "tavs") return null;
  const pris = `${krAfOere(k.prisEksMomsOere)} kr.`;

  if (dom.klokke === "ingen_bruger") {
    const betalt = danskDato(k.periodeStart);
    const kontakt = kontaktAf(k, brugere, dom.invitation);
    const title = `${k.navn}: ingen bruger ${dom.taerskel} dage efter betalingen ${betalt}`;
    const invitationen = dom.tilstand === "ingen_invitation"
      ? "Der er aldrig sendt en invitation — send den i dag."
      : dom.tilstand === "pending"
        ? `Invitationen til ${dom.invitation!.email} blev sendt ${danskDato(dom.invitation!.sendtAt)} og er ikke accepteret — send den igen, eller ring til ${kontakt}.`
        : `Invitationen til ${dom.invitation!.email} fra ${danskDato(dom.invitation!.sendtAt)} er ${dom.invitation!.status === "accepted" ? "accepteret, men ingen konto findes" : "udløbet"} — send en ny, eller ring til ${kontakt}.`;
    if (dom.trin === 1) {
      return { title, body: `${k.navn} har betalt ${pris} og har ikke haft en bruger i ${maaneder(dom.taerskel)}. ${invitationen}` };
    }
    const dageIAaret = Math.max(1, dageMellem(k.periodeStart, k.periodeSlut));
    const prDag = Math.round(k.prisEksMomsOere / 100 / dageIAaret).toLocaleString("da-DK");
    if (dom.trin === 2) {
      return { title, body: `${k.navn} har betalt ${pris} for ${dom.taerskel} dages adgang, ingen har brugt endnu — ${prDag} kr. om dagen, de ikke får noget for. ${invitationen}` };
    }
    return {
      title,
      body: `${k.navn} har haft adgang i ${dom.taerskel} dage uden en bruger — ${pris} betalt, ${prDag} kr. om dagen, de ikke får noget for. Ring til ${kontakt}: en, der aldrig kom ind, fornyer sjældent, men det er ikke afgjort, før nogen har talt med dem. Er det afgjort, sæt virksomheden som tidligere, så klokken tier. ${invitationen}`,
    };
  }

  const kontakt = kontaktAf(k, brugere, null);
  const siden = dom.maaltFra ? `siden målingen begyndte ${danskDato(dom.sidenDag)}` : `siden ${danskDato(dom.sidenDag)}`;
  const slut = danskDato(k.periodeSlut);
  const vindue = danskDato(plusDage(k.periodeSlut, -VINDUE_DAGE));
  if (dom.trin === 4) {
    const fornyelse = fornyelsesprisOere !== null ? ` til ${krAfOere(fornyelsesprisOere)} kr` : "";
    return {
      title: `${k.navn}: i beslutningsvinduet uden login ${siden}`,
      body: `${k.navn} er i beslutningsvinduet og har ikke været inde ${siden}. Fornyelse ${slut}${fornyelse}. Beslut i dag: tilbyd, tilbyd ikke — eller ring til ${kontakt} først.`,
    };
  }
  const title = `${k.navn}: ingen login i ${dom.taerskel} dage (${siden})`;
  if (dom.trin === 1) {
    return { title, body: `${k.navn} har ikke logget ind i ${maaneder(dom.taerskel)} og fornyer ${slut} — vinduet åbner ${vindue}. Ring til ${kontakt}, før de beslutter sig uden os.` };
  }
  if (dom.trin === 2) {
    return { title, body: `${k.navn} har ikke været inde i ${maaneder(dom.taerskel)} — de betaler ${pris} for noget, de ikke ser. Fornyelse ${slut}. Ring til ${kontakt}.` };
  }
  return {
    title,
    body: `${k.navn} har ikke logget ind i ${maaneder(dom.taerskel)} og fornyer ${slut}. Træf fornyelsesbeslutningen nu — tilbyd eller tilbyd ikke — ikke i vinduet ${vindue}. Ring til ${kontakt} først.`,
  };
}
