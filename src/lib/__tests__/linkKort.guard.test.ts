import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (17/9-2026): link-kort og #opslag i Community (PR B, valg A).
// Syv domme, læst i kilden fordi de handler om HVAD der må hentes og
// indlejres — ikke om hvad en enkelt funktion returnerer:
//   1. Hverken CommunityDokument.tsx eller CommunityLinkKort.tsx bruger
//      dangerouslySetInnerHTML — dokumentet renderes fortsat som træ.
//   2. Præcis to <iframe> i CommunityLinkKort.tsx, og deres src er
//      PRÆCIS `youtubeNocookieEmbedUrl(kort.videoId)` (PR A's delte bygger i
//      pushMedie.ts — nocookie-adressen bygges ét sted i huset) og
//      `https://open.spotify.com/embed/${kort.slags}/${kort.id}` — id'er fra
//      motoren efter et fast præfiks; aldrig en rå URL.
//   3. Begge iframes monteres KUN under `playing ? (` — ingen afspiller før
//      klik, ingen autoplay uden klik.
//   4. linkKortApi.ts henter ÉT sted: `fetchFn(oembedUrl(kort), {` — og de
//      eneste https-hosts i filen (uden kommentarer) er www.youtube.com,
//      open.spotify.com og i.ytimg.com. Ingen vilkårlig URL forlader
//      klienten (SSRF-dommen — der er ingen server, men heller ingen
//      unfurl).
//   5. Motoren linkKort.ts kender hverken fetch, supabase eller window —
//      den er ren.
//   6. De tre spejle af område-hvidlisten er ens: motorens
//      TILLADTE_OMRAADER, composerens OMRAADE_LABELS og kortets
//      OMRAADE_LABELS.
//   7. Nodetypen "opslaghenvisning" er kendt alle FEM steder: motorens
//      inline-hvidliste og case, rendererens case, composerens node og
//      command, og migrationens opslagsliste — ellers falder #opslag
//      stille væk ved visning eller i uddraget.
// Dommene er navngivne og rene over kildetekst; «VÆRNET VIRKER» kører dem
// på kopier med fejlen indsat (klokkeCommunity.guard-mønstret).

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
/** Blokkommentarer væk; linjekommentarer KUN når `//` står først på
    linjen — ellers ville `"https://…"` inde i en streng blive klippet, og
    host-dommen (4) ville være tom. */
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");

const DOK = "src/components/hjemmebane/community/CommunityDokument.tsx";
const KORT = "src/components/hjemmebane/community/CommunityLinkKort.tsx";
const API = "src/lib/hjemmebane/linkKortApi.ts";
const MOTOR = "src/lib/hjemmebane/linkKort.ts";
const DOKMOTOR = "src/lib/hjemmebane/communityDokument.ts";
const COMPOSER = "src/components/hjemmebane/community/CommunityComposer.tsx";
const MIGRATION = "supabase/migrations/20260917160000_community_tekst_med_opslaghenvisninger.sql";

const YT_SRC = "src={youtubeNocookieEmbedUrl(kort.videoId)}";
const YT_IMPORT = 'import { youtubeNocookieEmbedUrl, youtubeThumbnailUrl } from "@/components/hjemmebane/boardroom/pushMedie";';
const SP_SRC = "src={`https://open.spotify.com/embed/${kort.slags}/${kort.id}`}";
const HENTNING = "fetchFn(oembedUrl(kort), {";
const TILLADTE_HOSTS = new Set(["www.youtube.com", "open.spotify.com", "i.ytimg.com"]);

/** Dom 1. */
export const ingenInnerHtml = (kilde: string): boolean => !kilde.includes("dangerouslySetInnerHTML");

/** Alle <iframe …>-tags i en kilde. */
function iframes(kilde: string): string[] {
  return kilde.match(/<iframe[\s\S]*?\/>/g) ?? [];
}

/** Dom 2: præcis to iframes, én med hver af de to faste src'er — og
    YouTube-byggeren importeret fra pushMedie (ikke en lokal kopi). */
export const iframesKunKendteAdresser = (kilde: string): boolean => {
  const tags = iframes(kilde);
  if (tags.length !== 2) return false;
  // src er enten et template-literal (`…${…}…`) eller et kald — begge fanges.
  const srcs = tags.map((tag) => tag.match(/src=\{(?:`[^`]*`|[^{}]*)\}/)?.[0] ?? "");
  return srcs.includes(YT_SRC) && srcs.includes(SP_SRC) && kilde.includes(YT_IMPORT);
};

/** Dom 3: hver iframe står højst 200 tegn efter et `playing ? (`. */
export const afspillerKunEfterKlik = (kilde: string): boolean => {
  let fra = 0;
  for (const tag of iframes(kilde)) {
    const pos = kilde.indexOf(tag, fra);
    const gate = kilde.lastIndexOf("playing ? (", pos);
    if (gate === -1 || pos - gate > 200) return false;
    fra = pos + tag.length;
  }
  return iframes(kilde).length > 0;
};

/** Dom 4: ét fetch-kald, gennem oembedUrl; kun de tre hosts. */
export const henterKunOembed = (kilde: string): boolean => {
  const ren = udenKommentarer(kilde);
  const kald = ren.match(/fetch(Fn)?\(/g) ?? [];
  if (kald.length !== 1 || !ren.includes(HENTNING)) return false;
  // Definitionen `fetchFn: typeof fetch = fetch` tæller ikke som kald (intet "(").
  const hosts = new Set((ren.match(/https:\/\/[a-z0-9.-]+/g) ?? []).map((u) => u.slice("https://".length)));
  for (const host of hosts) if (!TILLADTE_HOSTS.has(host)) return false;
  return true;
};

/** Dom 5. */
export const motorenErRen = (kilde: string): boolean => {
  const ren = udenKommentarer(kilde);
  return !/\bfetch\b|supabase|\bwindow\b|\bdocument\b/.test(ren);
};

/** Område-sættet fra motoren: `TILLADTE_OMRAADER … = new Set([ … ])`. */
export function omraaderIMotoren(kilde: string): string[] {
  const m = udenKommentarer(kilde).match(/TILLADTE_OMRAADER[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error("fandt ikke TILLADTE_OMRAADER");
  return (m[1].match(/"([a-z_]+)"/g) ?? []).map((s) => s.slice(1, -1)).sort();
}

/** Nøglerne i `OMRAADE_LABELS: Record<string, string> = { … }`. */
export function omraaderILabels(kilde: string): string[] {
  const m = udenKommentarer(kilde).match(/OMRAADE_LABELS: Record<string, string> = \{([\s\S]*?)\};/);
  if (!m) throw new Error("fandt ikke OMRAADE_LABELS");
  return (m[1].match(/^\s*([a-z_]+):/gm) ?? []).map((s) => s.trim().slice(0, -1)).sort();
}

/** Dom 6. */
export const spejleneErEns = (motor: string, composer: string, kort: string): boolean => {
  const a = omraaderIMotoren(motor).join(",");
  return a === omraaderILabels(composer).join(",") && a === omraaderILabels(kort).join(",");
};

/** Dom 7: de fem steder. */
export const opslagsnodenKendesOveralt = (k: {
  dokmotor: string;
  dok: string;
  composer: string;
  migration: string;
}): boolean => {
  const inline = udenKommentarer(k.dokmotor).match(/inline: new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
  return (
    inline.includes('"opslaghenvisning"') &&
    k.dokmotor.includes('case "opslaghenvisning": {') &&
    k.dok.includes('case "opslaghenvisning":') &&
    k.dok.includes("to={`/community/${node.traadId}`}") &&
    k.composer.includes('name: "opslaghenvisning",') &&
    k.composer.includes('type: "opslaghenvisning",') &&
    k.composer.includes("attrs: { traadId: forslag.traad.id, titel: forslag.traad.titel },") &&
    k.migration.includes("('opslaghenvisning', 'titel', '#')")
  );
};

describe("linkKort.guard — link-kort og #opslag i Community", () => {
  const dok = laes(DOK);
  const kort = laes(KORT);
  const api = laes(API);
  const motor = laes(MOTOR);
  const dokmotor = laes(DOKMOTOR);
  const composer = laes(COMPOSER);
  const migration = laes(MIGRATION);

  it("1. dokument og kort renderes uden dangerouslySetInnerHTML", () => {
    expect(ingenInnerHtml(dok)).toBe(true);
    expect(ingenInnerHtml(kort)).toBe(true);
  });
  it("2. præcis to iframes: youtube-nocookie og open.spotify.com/embed, id efter fast præfiks", () => {
    expect(iframesKunKendteAdresser(kort)).toBe(true);
  });
  it("3. afspilleren monteres først ved klik (playing ? …)", () => {
    expect(afspillerKunEfterKlik(kort)).toBe(true);
  });
  it("4. datalaget henter ét sted, gennem oembedUrl, og kender kun de tre hosts", () => {
    expect(henterKunOembed(api)).toBe(true);
  });
  it("5. motoren er ren — ingen fetch, supabase, window, document", () => {
    expect(motorenErRen(motor)).toBe(true);
  });
  it("6. område-hvidlisten er ens i motor, composer og kort", () => {
    expect(spejleneErEns(dokmotor, composer, kort)).toBe(true);
    expect(omraaderIMotoren(dokmotor)).toEqual(["academy", "classroom", "quick_wins", "rabataftaler", "start_her"]);
  });
  it("7. opslaghenvisning kendes i motor, renderer, composer og migration", () => {
    expect(opslagsnodenKendesOveralt({ dokmotor, dok, composer, migration })).toBe(true);
  });
});

describe("linkKort.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const dok = laes(DOK);
  const kort = laes(KORT);
  const api = laes(API);
  const motor = laes(MOTOR);
  const dokmotor = laes(DOKMOTOR);
  const composer = laes(COMPOSER);
  const migration = laes(MIGRATION);

  it("1. et dangerouslySetInnerHTML fælder dom 1", () => {
    expect(ingenInnerHtml(dok + "\n<div dangerouslySetInnerHTML={{ __html: x }} />")).toBe(false);
  });
  it("2. en rå URL som src, en tredje iframe eller en anden host fælder dom 2", () => {
    expect(iframesKunKendteAdresser(kort.replace(YT_SRC, "src={kort.url}"))).toBe(false);
    expect(iframesKunKendteAdresser(kort + '\n<iframe src={`https://vimeo.com/${kort.id}`} />')).toBe(false);
    expect(iframesKunKendteAdresser(kort.replace(YT_SRC, "src={`https://www.youtube.com/embed/${kort.videoId}`}"))).toBe(false);
    expect(iframesKunKendteAdresser(kort.replace(YT_IMPORT, ""))).toBe(false);
  });
  it("3. en iframe uden playing-gate fælder dom 3", () => {
    expect(afspillerKunEfterKlik(kort.replace("playing ? (", "true ? ("))).toBe(false);
    expect(afspillerKunEfterKlik(kort + "\n<iframe src={`https://open.spotify.com/embed/${kort.slags}/${kort.id}`} />")).toBe(false);
  });
  it("4. et ekstra fetch, en hentning uden om oembedUrl eller en fjerde host fælder dom 4", () => {
    expect(henterKunOembed(api + "\nawait fetch(url);\n")).toBe(false);
    expect(henterKunOembed(api.replace(HENTNING, "fetchFn(kort.url, {"))).toBe(false);
    expect(henterKunOembed(api + '\nconst x = "https://unfurl.example/api";\n')).toBe(false);
  });
  it("5. et fetch eller en supabase-import i motoren fælder dom 5", () => {
    expect(motorenErRen(motor + "\nconst r = await fetch(url);\n")).toBe(false);
    expect(motorenErRen(motor + '\nimport { supabase } from "@/integrations/supabase/client";\n')).toBe(false);
  });
  it("6. et område kun ét sted fælder dom 6", () => {
    expect(spejleneErEns(dokmotor.replace('"start_her",', '"start_her",\n  "push",'), composer, kort)).toBe(false);
    expect(spejleneErEns(dokmotor, composer.replace('  start_her: "Start her",\n', ""), kort)).toBe(false);
    expect(spejleneErEns(dokmotor, composer, kort.replace('  quick_wins: "Quick win",\n', ""))).toBe(false);
  });
  it("7. nodetypen fjernet ét sted fælder dom 7", () => {
    expect(opslagsnodenKendesOveralt({ dokmotor: dokmotor.replace('    "opslaghenvisning",\n  ]),', "  ]),"), dok, composer, migration })).toBe(false);
    expect(opslagsnodenKendesOveralt({ dokmotor, dok: dok.replace('case "opslaghenvisning":', 'case "x":'), composer, migration })).toBe(false);
    expect(opslagsnodenKendesOveralt({ dokmotor, dok, composer: composer.replace('type: "opslaghenvisning",', 'type: "henvisning",'), migration })).toBe(false);
    expect(opslagsnodenKendesOveralt({ dokmotor, dok, composer, migration: migration.replace("('opslaghenvisning', 'titel', '#')", "") })).toBe(false);
  });
});
