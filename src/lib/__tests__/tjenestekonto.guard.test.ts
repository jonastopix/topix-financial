// Kildeværn: tjenestekonti (30/9-2026, src/lib/tjenestekonto.ts).
//
// En tjenestekonto (claude@topix.dk) kan SE alt, en rådgiver ser, men optræder
// aldrig som en PERSON. Værnet finder hvert sted, der henter rådgiverne som
// liste, og kræver ét af to:
//   (a) stedet filtrerer — synligeRaadgivere( / hentSynligeRaadgiverProfiler(
//       i klienten, udenTjenestekonti( i edge-laget; eller
//   (b) stedet står på listen herunder med sin grund: rådgiverlisten bruges som
//       ROLLE (hvem er rådgiver → tæller ikke som medlem) eller som OPSLAG pr. id
//       (navnet på den, der gjorde noget), eller fan-outen er KLOKKER, som
//       tjenestekontoen skal se (mailen filtreres i klokke-mail-cron).
// Et nyt sted uden (a) eller (b) fælder dommen (prøvet med mutation nedenfor).
// En post på listen, der ikke længere henter rådgiverne, fælder også: listen
// må ikke rådne.
//
// DOMME:
//   1. Klienten: hvert sted, der henter rådgivere/medlemsnetværket
//      (get_all_advisor_profiles, get_member_directory, get_community_medlemmer,
//      user_roles advisor/admin som liste, useRaadgivere), filtrerer eller står på
//      KLIENT_UNDTAGET.
//   2. Edge: hver rådgiver-fan-out (user_roles select user_id … advisor/admin)
//      filtrerer eller står på EDGE_UNDTAGET.
//   3. De kendte person-steder filtrerer faktisk (ingen af dem må glide over på
//      undtagelseslisten).
//   4. useAuth slår inaktivitets-logud til gennem inaktivitetsLogudAktiv — ikke
//      !!user alene.
//   5. Migrationen: kun admin skriver (policy med has_role admin), ingen ændring af
//      eksisterende funktioner, og første linje er IKKE KØRT-linjen.
//   6. Ingen læse-markering fra en tjenestekonto: hvert sted, hvor det at SE
//      skriver et spor (mark_messages_read, notifikationer set/læst, klokker
//      læst, community-visning, conversation_last_seen, forside_sidst_set,
//      ugefokus seen_at, akademiets seen_at/afspilningsposition, login-loggen),
//      er gated — laeseMarkeringTilladt (useAuth) eller stedets egen port —
//      eller står på LAESE_UNDTAGET med grunden. Nye steder uden port fælder.
//
// ROLLE_LISTE (rettet 30/9): rækkefølgen i rollelisten er fri — både
// ["advisor", "admin"] og ["admin", "advisor"] — og .eq("role", "advisor") er
// også en rådgiverliste. select'en skal blot indeholde user_id.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROD = process.cwd();

function filer(dir: string, endelser: string[]): string[] {
  const ud: string[] = [];
  const gaa = (rel: string) => {
    for (const navn of readdirSync(resolve(ROD, rel)).sort()) {
      const sti = join(rel, navn);
      if (statSync(resolve(ROD, sti)).isDirectory()) {
        if (navn === "__tests__" || navn === "node_modules") continue;
        gaa(sti);
      } else if (endelser.some((e) => navn.endsWith(e)) && !/\.test\.tsx?$/.test(navn)) {
        ud.push(sti);
      }
    }
  };
  gaa(dir);
  return ud;
}

const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");

const RPC_LISTE = /\brpc\b[^;\n]{0,40}["'](get_all_advisor_profiles|get_member_directory|get_community_medlemmer)["']/;
const ROLLE = `["'](?:advisor|admin)["']`;
const ROLLE_LISTE = new RegExp(
  String.raw`from\(["']user_roles["']\)\s*\.select\(["'][^"']*\buser_id\b[^"']*["']\)[\s\S]{0,60}?\.` +
    String.raw`(?:in\(["']role["'],\s*\[\s*` + ROLLE + String.raw`\s*(?:,\s*` + ROLLE + String.raw`\s*)?\]\)|eq\(["']role["'],\s*["']advisor["']\))`,
);
const BRUGER_HOOK = /\buseRaadgivere\(/;
const KLIENT_FILTER = /\b(synligeRaadgivere|hentSynligeRaadgiverProfiler)\(/;
const EDGE_FILTER = /\budenTjenestekonti\(/;

/** Klientens steder, der BEVIDST ikke filtrerer — med grunden. */
const KLIENT_UNDTAGET: Readonly<Record<string, string>> = {
  "src/hooks/svartid.ts": "ROLLE: svartidsurets rådgivermængde afgør, om en besked er et rådgiversvar; uden kontoen ville dens beskeder tælle som medlemmets",
  "src/hooks/ubesvaredeOpslag.ts": "ROLLE: et opslag fra en rådgiver er ikke et ubesvaret medlemsopslag",
  "src/hooks/onlineMedlemmer.ts": "ROLLE: rådgivere vises ikke i «Online nu»; uden kontoen i mængden ville den kunne stå som medlem",
  "src/components/hjemmebane/admin/views/ProgressView.tsx": "ROLLE: rådgivernes egne lektionsrækker må ikke tælle i «Kunne du bruge den?» — heller ikke tjenestekontoens",
  "src/hooks/useRaadgivere.ts": "OPSLAG pr. id (værter, forsiden) — delt cache med BoardroomView; vælgeren filtrerer i EventEditor",
  "src/components/hjemmebane/boardroom/BoardroomView.tsx": "OPSLAG pr. id: ansigtet på den rådgiver, der skrev pushet/skridtet — en tjenestekonto skriver intet",
  "src/components/hjemmebane/events/EventDetailView.tsx": "OPSLAG pr. id: eventets værter — værtsvælgeren (EventEditor) tilbyder aldrig en tjenestekonto",
  "src/components/hjemmebane/ansoegninger/AnsoegningView.tsx": "OPSLAG pr. id: navnet på den rådgiver, der tog beslutningen i sporet",
  "src/hooks/trofaeer.ts": "ROLLE: «Hjalp et andet medlem» — en tråd fra en rådgiver eller tjenestekonto er ikke et medlems; kontoen skal MED i mængden",
};

/** Edge-steder, der BEVIDST ikke filtrerer — med grunden. */
const EDGE_UNDTAGET: Readonly<Record<string, string>> = {
  "supabase/functions/_shared/raadgiverBesked.ts": "KLOKKER (advisor_notifications): kontoen skal se alt; mailen filtreres i klokke-mail-cron",
  "supabase/functions/send-slack-chat-notification/index.ts": "KLOKKER (notifications): send-notification-email mailer ikke rådgivere",
  "supabase/functions/send-slack-report-notification/index.ts": "KLOKKER (notifications): send-notification-email mailer ikke rådgivere",
  "supabase/functions/send-slack-handout-notification/index.ts": "KLOKKER (notifications): send-notification-email mailer ikke rådgivere",
  "supabase/functions/detect-financial-alerts/index.ts": "KLOKKER (alarmer i rådgiverens dashboard): kontoen skal se alt",
  "supabase/functions/certifikat-klokke/index.ts": "ROLLE: rådgivere udelukkes fra medlemmernes certifikat-klokke",
  "supabase/functions/manage-advisor/index.ts": "ROLLE: privilegerede konti udelukkes fra bulk-fjernelse af medlemmer",
  "supabase/functions/send-notification-email/index.ts": "ROLLE: rådgivere undtages fra medlemsmails",
};

/** Steder, der viser rådgivere (eller netværket) som personer — skal filtrere.
    1/10: CompanyChatPane (tildelings-vælgeren), AdvisorDashboard (bunkernes
    «tildelt»-navn) og useVirksomhed («Tildelt:» — stod på KLIENT_UNDTAGET)
    er taget af listerne: tildeling af rådgiver er fjernet (Jonas 1/10), og de
    henter ikke længere rådgiverne. Værn: ingenTildeling.guard. */
const PERSON_STEDER = [
  "src/components/MemberChatPane.tsx", // «Dine rådgivere: Jonas, Morten»
  "src/components/hjemmebane/opgaver/OpgavelisteView.tsx", // «Mig/Jonas/Morten»
  "src/components/hjemmebane/admin/views/PushView.tsx", // pushets afsender
  "src/components/hjemmebane/admin/editors/EventEditor.tsx", // værtsvælgeren
  "src/lib/hjemmebane/memberProfile.ts", // Netværket /medlemmer, «Dine rådgivere»
  "src/lib/hjemmebane/communityApi.ts", // @-nævnelser
];
const EDGE_PERSON_STEDER = [
  "supabase/functions/klokke-mail-cron/index.ts", // klokke-mails til rådgivere
  "supabase/functions/run-company-agent/index.ts", // agentens besked «som rådgiver»
  "supabase/functions/send-welcome-message/index.ts", // velkomstens afsender
];

function klientDom(kilder: Readonly<Record<string, string>>, undtaget: Readonly<Record<string, string>> = KLIENT_UNDTAGET): string[] {
  const fejl: string[] = [];
  for (const [sti, kilde] of Object.entries(kilder)) {
    const henter = RPC_LISTE.test(kilde) || ROLLE_LISTE.test(kilde) || BRUGER_HOOK.test(kilde);
    if (!henter) {
      if (sti in undtaget) fejl.push(`${sti}: står på undtagelseslisten, men henter ikke rådgiverne`);
      continue;
    }
    if (KLIENT_FILTER.test(kilde)) continue;
    if (!(sti in undtaget)) fejl.push(`${sti}: henter rådgiverne uden synligeRaadgivere/hentSynligeRaadgiverProfiler og står ikke på KLIENT_UNDTAGET`);
  }
  return fejl;
}

function edgeDom(kilder: Readonly<Record<string, string>>, undtaget: Readonly<Record<string, string>> = EDGE_UNDTAGET): string[] {
  const fejl: string[] = [];
  for (const [sti, kilde] of Object.entries(kilder)) {
    if (!ROLLE_LISTE.test(kilde)) {
      if (sti in undtaget) fejl.push(`${sti}: står på undtagelseslisten, men har ingen rådgiver-fan-out`);
      continue;
    }
    if (EDGE_FILTER.test(kilde)) continue;
    if (!(sti in undtaget)) fejl.push(`${sti}: rådgiver-fan-out uden udenTjenestekonti og står ikke på EDGE_UNDTAGET`);
  }
  return fejl;
}

// ─── Dom 6: læse-markeringer ────────────────────────────────────────────────
/** Skrivninger, som det at SE udløser. Et fund i en fil kræver en port. */
const LAESE_SKRIVNINGER: readonly RegExp[] = [
  /["']mark_messages_read["']/,
  /["']mark_notifications_seen["']/,
  /["']mark_notification_read["']/,
  /from\(["']advisor_notifications["'][^)]*\)\s*\.update\(\{\s*read_at/,
  /(?<!function )\bregistrerVisning\(traad/, // kaldet — ikke definitionen i communityApi.ts
  /from\(["']conversation_last_seen["'][^)]*\)\s*\.upsert\(/,
  /from\(["']forside_sidst_set["'][^)]*\)\s*\.upsert\(/,
  /from\(["']weekly_focus["']\)\s*\.update\(\{\s*seen_at/,
  /writeProgress\([^)]*\{\s*(?:seen_at|last_position_seconds)\s*:/,
  /["']log_user_login["']/,
  /\.update\(\{\s*(?:velkomstvideo_set_at|deling_hentet_at)\s*:/,
];

/** Standardporten: laeseMarkeringTilladt i en betingelse. */
const STANDARD_PORT = /(?:if \(|&&|\|\|)[^\n;]*!?\blaeseMarkeringTilladt\b/;

/** Steder med deres egen port (i stedet for standardporten). */
const EGEN_PORT: Readonly<Record<string, RegExp>> = {
  // Login-loggen skrives i onAuthStateChange, før konteksten findes: eget opslag.
  "src/hooks/useAuth.tsx": /erTjenestekonto\(nyBrugerId\)[\s\S]{0,120}?if \(tjeneste\) return;[\s\S]{0,80}?["']log_user_login["']/,
  // Stemplet ligger i en ren hentefunktion; forsiden giver flaget ind (se dom 6, forsiden).
  "src/hooks/sidenSidst.ts": /if \(skrivStempel\) \{[\s\S]{0,300}?forside_sidst_set/,
};

/** Steder, der BEVIDST ikke gater — med grunden. */
const LAESE_UNDTAGET: Readonly<Record<string, string>> = {
  "src/hooks/useOnboardingTjekliste.ts": "KUN MEDLEMMER: velkomstvideo_set_at skrives kun, når aktiv (!isAdvisor) — en tjenestekonto er rådgiver",
  "src/hooks/useDelingHentet.ts": "KUN MEDLEMMER: deling_hentet_at skrives kun for !isAdvisor — en tjenestekonto er rådgiver",
};

/** De kendte steder — værnet må ikke bestå tomt. */
const LAESE_STEDER = [
  "src/components/CompanyChatPane.tsx",
  "src/components/MemberChatPane.tsx",
  "src/hooks/useConversationLastSeen.ts",
  "src/hooks/useNotifications.ts",
  "src/hooks/useAdvisorNotifications.ts",
  "src/components/AdvisorNotifications.tsx",
  "src/components/hjemmebane/community/CommunityTraadView.tsx",
  "src/components/hjemmebane/boardroom/BoardroomView.tsx",
  "src/components/hjemmebane/akademi/views/ElementView.tsx",
  "src/hooks/sidenSidst.ts",
  "src/hooks/useAuth.tsx",
];

function laeseDom(kilder: Readonly<Record<string, string>>, undtaget: Readonly<Record<string, string>> = LAESE_UNDTAGET): string[] {
  const fejl: string[] = [];
  for (const [sti, kilde] of Object.entries(kilder)) {
    const skriver = LAESE_SKRIVNINGER.some((r) => r.test(kilde));
    if (!skriver) {
      if (sti in undtaget) fejl.push(`${sti}: står på LAESE_UNDTAGET, men skriver ingen læse-markering`);
      continue;
    }
    if (sti in undtaget) continue;
    const port = EGEN_PORT[sti] ?? STANDARD_PORT;
    if (!port.test(kilde)) fejl.push(`${sti}: skriver en læse-markering uden port for tjenestekonti og står ikke på LAESE_UNDTAGET`);
  }
  return fejl;
}

const klientKilder = Object.fromEntries(
  filer("src", [".ts", ".tsx"]).filter((f) => !f.endsWith("integrations/supabase/types.ts")).map((f) => [f, laes(f)]),
);
const edgeKilder = Object.fromEntries(filer("supabase/functions", [".ts"]).map((f) => [f, laes(f)]));

describe("tjenestekonto.guard — ingen tjenestekonto som person", () => {
  it("1. klienten: hvert sted, der henter rådgiverne, filtrerer eller har en grund", () => {
    expect(klientDom(klientKilder)).toEqual([]);
  });

  it("1. mutation: et nyt sted uden filter fælder dommen", () => {
    const ny = { ...klientKilder, "src/components/NyRaadgiverliste.tsx": 'const { data } = await supabase.rpc("get_all_advisor_profiles");' };
    expect(klientDom(ny)).toEqual([expect.stringContaining("NyRaadgiverliste.tsx")]);
    const netvaerk = { ...klientKilder, "src/lib/nytNetvaerk.ts": 'await (supabase.rpc as any)("get_community_medlemmer");' };
    expect(klientDom(netvaerk)).toEqual([expect.stringContaining("nytNetvaerk.ts")]);
    const roller = { ...klientKilder, "src/lib/nyVaelger.ts": 'supabase.from("user_roles").select("user_id, role").in("role", ["advisor", "admin"]);' };
    expect(klientDom(roller)).toEqual([expect.stringContaining("nyVaelger.ts")]);
    const hook = { ...klientKilder, "src/components/NyVaelger.tsx": "const q = useRaadgivere();" };
    expect(klientDom(hook)).toEqual([expect.stringContaining("NyVaelger.tsx")]);
  });

  it("1. mutation: filtret fjernet fra et person-sted fælder dommen", () => {
    const sti = "src/components/hjemmebane/opgaver/OpgavelisteView.tsx";
    const uden = { ...klientKilder, [sti]: klientKilder[sti].replace("hentSynligeRaadgiverProfiler()", 'supabase.rpc("get_all_advisor_profiles")').replace(/import \{ hentSynligeRaadgiverProfiler \}[^\n]*\n/, "") };
    expect(klientDom(uden)).toEqual([expect.stringContaining(sti)]);
  });

  it("1. mutation: en rådden undtagelse fælder dommen", () => {
    expect(klientDom(klientKilder, { ...KLIENT_UNDTAGET, "src/lib/tjenestekonto.ts": "henter intet" })).toEqual([expect.stringContaining("src/lib/tjenestekonto.ts")]);
  });

  it("2. edge: hver rådgiver-fan-out filtrerer eller har en grund", () => {
    expect(edgeDom(edgeKilder)).toEqual([]);
  });

  it("2. mutation: en ny fan-out uden filter fælder dommen", () => {
    const ny = { ...edgeKilder, "supabase/functions/ny-raadgivermail/index.ts": 'await admin.from("user_roles").select("user_id").in("role", ["advisor", "admin"]);' };
    expect(edgeDom(ny)).toEqual([expect.stringContaining("ny-raadgivermail")]);
  });

  it("3. person-stederne filtrerer faktisk (klient og edge)", () => {
    for (const sti of PERSON_STEDER) {
      expect(klientKilder[sti], sti).toBeDefined();
      expect(KLIENT_FILTER.test(klientKilder[sti]), sti).toBe(true);
      expect(sti in KLIENT_UNDTAGET, sti).toBe(false);
    }
    for (const sti of EDGE_PERSON_STEDER) {
      expect(edgeKilder[sti], sti).toBeDefined();
      expect(EDGE_FILTER.test(edgeKilder[sti]), sti).toBe(true);
      expect(edgeKilder[sti]).toContain('from "../_shared/tjenestekonti.ts"');
      expect(sti in EDGE_UNDTAGET, sti).toBe(false);
    }
  });

  it("4. useAuth: inaktivitets-logud og læse-markeringen går gennem dommene — fra SAMME query", () => {
    const auth = klientKilder["src/hooks/useAuth.tsx"];
    expect(auth).toContain("useInactivityLogout(logudAktiv, sessionTimeoutMinutes)");
    expect(auth).toContain("inaktivitetsLogudAktiv(!!user, tjenestekontoQuery.status, tjenestekontoQuery.data)");
    expect(auth).toContain("laeseMarkeringTilladt(!!user, tjenestekontoQuery.status, tjenestekontoQuery.data)");
    expect(auth).toContain("erTjenestekonto: erTjenestekontoNu, laeseMarkeringTilladt: maaMarkereLaest,");
    expect(auth).not.toContain("useInactivityLogout(!!user");
  });

  it("5. migrationen: kun tilføjende, kun admin skriver, IKKE KØRT-linjen først", () => {
    const sql = laes("supabase/migrations/20260930140000_tjenestekonti.sql");
    expect(sql.split("\n")[0]).toMatch(/^-- (IKKE KØRT\. DEPLOY: manuelt i Lovable|KØRT i prod)/);
    const kode = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    expect(kode).toMatch(/CREATE POLICY "Admin skriver tjenestekonti"[\s\S]*FOR ALL[\s\S]*USING \(public\.has_role\(auth\.uid\(\), 'admin'::app_role\)\)[\s\S]*WITH CHECK \(public\.has_role\(auth\.uid\(\), 'admin'::app_role\)\)/);
    expect(kode).toMatch(/CREATE POLICY "Indloggede ser tjenestekonti"[\s\S]*FOR SELECT[\s\S]*TO authenticated/);
    expect(kode).not.toMatch(/CREATE (OR REPLACE )?FUNCTION|DROP |ALTER FUNCTION|ALTER TABLE public\.(profiles|user_roles)/i);
    // Trin 2 (claude@topix.dk) står kun som kommentar — den køres separat, efter kontoen findes.
    expect(kode).not.toMatch(/INSERT INTO/i);
    expect(sql).toContain("ON CONFLICT (user_id) DO NOTHING");
  });
  it("1./2. mutation: rollelisten i omvendt rækkefølge og .eq(\"role\", \"advisor\") fanges også", () => {
    const omvendt = { ...klientKilder, "src/lib/nyListe.ts": 'supabase.from("user_roles").select("user_id").in("role", ["admin", "advisor"]);' };
    expect(klientDom(omvendt)).toEqual([expect.stringContaining("nyListe.ts")]);
    const eq = { ...klientKilder, "src/lib/nyListe2.ts": 'supabase.from("user_roles").select("user_id, role").eq("role", "advisor");' };
    expect(klientDom(eq)).toEqual([expect.stringContaining("nyListe2.ts")]);
    const edgeOmvendt = { ...edgeKilder, "supabase/functions/ny-fanout/index.ts": "await admin.from('user_roles').select('user_id').in('role', ['admin', 'advisor']);" };
    expect(edgeDom(edgeOmvendt)).toEqual([expect.stringContaining("ny-fanout")]);
    const edgeEq = { ...edgeKilder, "supabase/functions/ny-fanout2/index.ts": "await admin.from('user_roles').select('user_id').eq('role', 'advisor');" };
    expect(edgeDom(edgeEq)).toEqual([expect.stringContaining("ny-fanout2")]);
    // Et enkelt-opslag (select id på én bruger) er ingen liste og fanges ikke.
    expect(ROLLE_LISTE.test("from('user_roles').select('id').eq('user_id', x).eq('role', 'advisor')")).toBe(false);
  });

  it("6. ingen læse-markering fra en tjenestekonto: hvert sted er gated eller har en grund", () => {
    expect(laeseDom(klientKilder)).toEqual([]);
    for (const sti of LAESE_STEDER) {
      expect(klientKilder[sti], sti).toBeDefined();
      expect(LAESE_SKRIVNINGER.some((r) => r.test(klientKilder[sti])), sti).toBe(true);
      expect(sti in LAESE_UNDTAGET, sti).toBe(false);
    }
    // Forsiden giver flaget ind til stemplet — og har det i nøglen, så stemplet sættes, når svaret kommer.
    const forside = klientKilder["src/components/hjemmebane/forside/RaadgiverForsideView.tsx"];
    expect(forside).toContain("hentSidenSidst(user!.id, new Date(), laeseMarkeringTilladt)");
    expect(forside).toContain("queryKey: [...SIDEN_SIDST_KEY(user?.id), laeseMarkeringTilladt]");
  });

  it("6. mutation: porten fjernet fra chatten fælder dommen", () => {
    const sti = "src/components/CompanyChatPane.tsx";
    const uden = { ...klientKilder, [sti]: klientKilder[sti].replace(/ && laeseMarkeringTilladt\)/g, ")") };
    expect(uden[sti]).not.toBe(klientKilder[sti]);
    expect(laeseDom(uden)).toEqual([expect.stringContaining(sti)]);
  });

  it("6. mutation: et nyt sted uden port fælder dommen; en rådden undtagelse fælder også", () => {
    const ny = { ...klientKilder, "src/components/NyTraad.tsx": 'useEffect(() => { void supabase.rpc("mark_messages_read", { p_conversation_id: id }); }, [id]);' };
    expect(laeseDom(ny)).toEqual([expect.stringContaining("NyTraad.tsx")]);
    const klokke = { ...klientKilder, "src/hooks/nyKlokke.ts": 'await supabase.from("advisor_notifications").update({ read_at: nu }).eq("id", id);' };
    expect(laeseDom(klokke)).toEqual([expect.stringContaining("nyKlokke.ts")]);
    expect(laeseDom(klientKilder, { ...LAESE_UNDTAGET, "src/lib/tjenestekonto.ts": "skriver intet" })).toEqual([expect.stringContaining("src/lib/tjenestekonto.ts")]);
  });

  it("6. mutation: login-loggen uden tjenestekonto-opslaget fælder dommen", () => {
    const sti = "src/hooks/useAuth.tsx";
    const uden = { ...klientKilder, [sti]: klientKilder[sti].replace("if (tjeneste) return;", "") };
    expect(laeseDom(uden)).toEqual([expect.stringContaining(sti)]);
  });
});
