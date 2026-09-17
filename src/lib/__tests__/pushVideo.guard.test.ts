import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Kildeværn for PR A «video i nyheden» (17/9-2026). JONAS (ordret): «Jeg vil
// rigtig gerne kunne smide en video ind som nyhed på forsiden til
// medlemmerne … Morten har lige optaget en spændende podcast (m. video)
// sammen med Nordea, og den skal frem i bussen.» Seks ting låses:
//   1. Iframen monteres FØRST ved klik: YouTubePlayer's iframe står i
//      `playing ?`-grenen, og eneste vej til playing er PlayCover's onPlay.
//   2. youtube-nocookie: embed-URL'en bygges ét sted (pushMedie.ts,
//      youtube-nocookie.com/embed) — ingen youtube.com/embed i src.
//   3. Ingen autoplay før klik: `autoplay=1` findes kun i pushMedie's
//      URL-bygger, som kun kaldes fra YouTubePlayer's iframe (bag gaten).
//   4. Spotify er KUN episode-embed'et: spotifyEmbedUrl bygger
//      open.spotify.com/embed/episode/<id>; SpotifyEpisodeEmbed bruger den,
//      loading="lazy" og title; dommen spotifyEpisodeId afviser show/track.
//      Og (17/9, forside PR 1): iframen monteres FØRST ved klik — samme
//      playing-gate som YouTubePlayer; ingen autoplay.
//   5. PushView skriver media_provider og external_url SAMMEN — 'external' +
//      linket, eller 'none' + null — aldrig external_url alene; et ugyldigt
//      link spærrer persist.
//   6. ÉN delt afspiller: <YouTubePlayer> bruges af både PushStory og
//      WeekVideoCard; der er præcis én YouTube-iframe i BoardroomView.
// Kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
// URL-SIKKER kommentar-stripning: husets udenKommentarer klipper ved ethvert
// «//» — også inde i «https://…» — og ville skjule netop de embed-URL'er
// dette værn skal se. Her fjernes blokkommentarer, linjer der begynder med
// «//», og hale-kommentarer efter « // » (mellemrum før) — «://» rammes ikke.
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
    .replace(/^\s*\/\/[^\n]*/gm, "")
    .replace(/\s\/\/\s[^\n]*/g, "");

const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const MEDIE = "src/components/hjemmebane/boardroom/pushMedie.ts";
const EDITOR = "src/components/hjemmebane/admin/views/PushView.tsx";

function alleFiler(rod: string): string[] {
  const ud: string[] = [];
  const gaa = (dir: string) => {
    for (const navn of readdirSync(dir)) {
      if (navn === "node_modules" || navn.startsWith(".")) continue;
      const sti = join(dir, navn);
      if (statSync(sti).isDirectory()) gaa(sti);
      else if (/\.tsx?$/.test(navn) && !/\.test\.tsx?$/.test(navn)) ud.push(sti);
    }
  };
  gaa(resolve(process.cwd(), rod));
  return ud.map((s) => s.slice(resolve(process.cwd()).length + 1)).sort();
}

/** Blokken for én komponent: fra `const Navn = (` til næste top-level `const`/`function`/`export`. */
function blok(kode: string, navn: string): string {
  const fra = kode.indexOf(`const ${navn} = (`);
  if (fra === -1) return "";
  const rest = kode.slice(fra + 1);
  const m = rest.search(/\n(const|function|export) /);
  return m === -1 ? kode.slice(fra) : kode.slice(fra, fra + 1 + m);
}

/** Dom 1 + 3: iframen kun i playing-grenen; playing kun sat af PlayCover's onPlay; ingen autoplay-tekst i komponenten selv. */
export const iframeFoerstVedKlik = (forside: string): boolean => {
  const p = blok(forside, "YouTubePlayer");
  if (!p) return false;
  const iframe = p.indexOf("<iframe");
  const gren = p.indexOf("return playing ? (");
  const ellers = p.indexOf(") : (", gren);
  return /const \[playing, setPlaying\] = useState\(false\);/.test(p) &&
    gren > -1 && iframe > gren && ellers > iframe &&
    /src=\{youtubeNocookieEmbedUrl\(youtubeId\)\}/.test(p) &&
    /<PlayCover coverUrl=\{coverUrl\} title=\{title\} onPlay=\{\(\) => setPlaying\(true\)\} \/>/.test(p.slice(ellers)) &&
    (p.match(/setPlaying\(true\)/g) ?? []).length === 1 &&
    !/autoplay=1/.test(p) && !/useState\(true\)/.test(p);
};

/** Dom 2 + 3: nocookie m. autoplay=1 bygges ét sted; ingen youtube.com/embed eller autoplay=1 andre steder i src. */
export const nocookieEtSted = (medie: string, filer: readonly { sti: string; kode: string }[]): boolean =>
  medie.includes("return `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`;") &&
  filer.every(({ sti, kode }) => (sti === MEDIE ? true : !/youtube-nocookie\.com\/embed|autoplay=1/.test(kode))) &&
  filer.every(({ kode }) => !/www\.youtube\.com\/embed/.test(kode));

/** Dom 4: Spotify kun episode-embed — og (forside PR 1, 17/9) iframen står
    under en playing-gate som alle andre afspillere: useState(false), iframen
    i `return playing ? (`-grenen, kortet med onClick={() => setPlaying(true)}
    i else-grenen, ingen autoplay-tekst.
    Før (PR A, til 17/9): kun `e.length > 0 && /src=\{spotifyEmbedUrl\(episodeId\)\}/.test(e) && /loading="lazy"/.test(e) && /title=\{`Spotify: \$\{title\}`\}/.test(e)` — iframen monteredes ved sidevisning. */
export const spotifyKunEpisode = (medie: string, forside: string): boolean => {
  const e = blok(forside, "SpotifyEpisodeEmbed");
  if (!e) return false;
  const gren = e.indexOf("return playing ? (");
  const iframe = e.indexOf("<iframe");
  const ellers = e.indexOf(") : (", gren);
  return medie.includes("return `https://open.spotify.com/embed/episode/${episodeId}`;") &&
    /const match = parsed\.pathname\.match\(\/\^\\\/episode\\\/\(\[\^\/\]\+\)\\\/\?\$\/\);/.test(medie) &&
    /parsed\.hostname !== "open\.spotify\.com"/.test(medie) &&
    /src=\{spotifyEmbedUrl\(episodeId\)\}/.test(e) && /loading="lazy"/.test(e) && /title=\{`Spotify: \$\{title\}`\}/.test(e) &&
    /const \[playing, setPlaying\] = useState\(false\);/.test(e) &&
    gren > -1 && iframe > gren && ellers > iframe &&
    /onClick=\{\(\) => setPlaying\(true\)\}/.test(e.slice(ellers)) &&
    (e.match(/setPlaying\(true\)/g) ?? []).length === 1 &&
    !/autoplay/.test(e) && !/useState\(true\)/.test(e) &&
    !/embed\/(show|track|playlist)/.test(medie + forside);
};

/** Dom 5: PushView skriver de to sammen, og et ugyldigt link spærrer gem. */
export const editorSkriverSammen = (editor: string): boolean =>
  editor.includes('onDraftChange({ media_provider: "none", external_url: null });') &&
  editor.includes('onDraftChange({ media_provider: "external", external_url: trimmed });') &&
  (editor.match(/external_url:/g) ?? []).length === 2 &&
  !/onDraftChange\(\{ external_url/.test(editor) &&
  /if \(extractYouTubeId\(trimmed\)\) \{/.test(editor) &&
  /if \(videoFejl \|\| spotifyFejl\) \{\s*setError\(videoFejl \?\? spotifyFejl\);\s*return;/.test(editor) &&
  /const renset = rensSpotifyEpisodeUrl\(trimmed\);/.test(editor) &&
  /setMeta\("spotify_url", renset\);/.test(editor) &&
  !/bunny_video_id/.test(editor);

/** Dom 6: én delt afspiller. */
export const enDeltAfspiller = (forside: string): boolean => {
  const push = blok(forside, "PushStory");
  const uge = blok(forside, "WeekVideoCard");
  return /<YouTubePlayer youtubeId=\{medie\.youtubeId\}/.test(push) &&
    /<YouTubePlayer youtubeId=\{youTubeId\}/.test(uge) &&
    (forside.match(/<iframe/g) ?? []).length === 2 && // YouTubePlayer + SpotifyEpisodeEmbed
    !/<iframe/.test(push) && !/<iframe/.test(uge) &&
    /const medie = pushMedie\(push\);/.test(push) &&
    /<MainStoryShell coverUrl=\{player \? null : coverUrl\} player=\{player\}>/.test(push);
};

describe("pushVideo.guard — PR A: video i nyheden, én delt afspiller, iframe først ved klik", () => {
  const forside = udenKommentarer(laes(FORSIDE));
  const medie = udenKommentarer(laes(MEDIE));
  const editor = udenKommentarer(laes(EDITOR));
  const filer = alleFiler("src").map((sti) => ({ sti, kode: udenKommentarer(laes(sti)) }));

  it("dom 1+3: YouTubePlayer monterer iframen først ved klik — ingen autoplay før PlayCover's onPlay", () => {
    expect(iframeFoerstVedKlik(forside)).toBe(true);
  });
  it("dom 2+3: youtube-nocookie m. autoplay=1 bygges ét sted (pushMedie.ts); ingen youtube.com/embed i src", () => {
    expect(nocookieEtSted(medie, filer)).toBe(true);
  });
  it("dom 4: Spotify er kun episode-embed'et — lazy, med title, bag en playing-gate (iframe først ved klik); show/track findes ikke", () => {
    expect(spotifyKunEpisode(medie, forside)).toBe(true);
  });
  it("dom 5: PushView skriver media_provider og external_url sammen; ugyldigt link spærrer gem; ingen Bunny i pushet", () => {
    expect(editorSkriverSammen(editor)).toBe(true);
  });
  it("dom 6: én delt YouTubePlayer for pushet og ugens video; præcis to iframes i forsiden (YouTube + Spotify)", () => {
    expect(enDeltAfspiller(forside)).toBe(true);
  });

  it("selvbevis 1: iframe uden gaten, autoplay i komponenten, eller playing der starter sand, falder", () => {
    expect(iframeFoerstVedKlik(forside.replace("const [playing, setPlaying] = useState(false);", "const [playing, setPlaying] = useState(true);"))).toBe(false);
    expect(iframeFoerstVedKlik(forside.replace("return playing ? (", "return true ? ("))).toBe(false);
    expect(iframeFoerstVedKlik(forside.replace("src={youtubeNocookieEmbedUrl(youtubeId)}", "src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}"))).toBe(false);
  });
  it("selvbevis 2: en anden fil med nocookie-embed eller autoplay=1, eller youtube.com/embed nogetsteds, falder", () => {
    expect(nocookieEtSted(medie, [...filer, { sti: "src/x.tsx", kode: 'src="https://www.youtube-nocookie.com/embed/abc?autoplay=1"' }])).toBe(false);
    expect(nocookieEtSted(medie.replace("youtube-nocookie.com/embed", "youtube.com/embed"), filer)).toBe(false);
  });
  it("selvbevis 3: et show-embed, en iframe uden lazy, en dom der tager show/, eller en Spotify-iframe uden gate/med autoplay falder", () => {
    expect(spotifyKunEpisode(medie.replace("embed/episode/", "embed/show/"), forside)).toBe(false);
    // loading="lazy" findes også på billeder i forsiden — fjern netop Spotify-iframens (unik nabo: allow="clipboard-write…").
    expect(spotifyKunEpisode(medie, forside.replace(/loading="lazy"(\s+allow="clipboard-write)/, "$1"))).toBe(false);
    expect(spotifyKunEpisode(medie.replace("/^\\/episode\\/([^/]+)\\/?$/", "/^\\/(episode|show)\\/([^/]+)\\/?$/"), forside)).toBe(false);
    // Gaten (17/9): iframen uden playing-gren, playing der starter sand, eller autoplay i blokken falder.
    const spotifyBlok = forside.slice(forside.indexOf("const SpotifyEpisodeEmbed = ("));
    const udenGate = forside.slice(0, forside.indexOf("const SpotifyEpisodeEmbed = (")) + spotifyBlok.replace("return playing ? (", "return true ? (");
    expect(spotifyKunEpisode(medie, udenGate)).toBe(false);
    const altidAaben = forside.slice(0, forside.indexOf("const SpotifyEpisodeEmbed = (")) + spotifyBlok.replace("const [playing, setPlaying] = useState(false);", "const [playing, setPlaying] = useState(true);");
    expect(spotifyKunEpisode(medie, altidAaben)).toBe(false);
    const medAutoplay = forside.slice(0, forside.indexOf("const SpotifyEpisodeEmbed = (")) + spotifyBlok.replace('allow="clipboard-write;', 'allow="autoplay; clipboard-write;');
    expect(spotifyKunEpisode(medie, medAutoplay)).toBe(false);
  });
  it("selvbevis 4: external_url skrevet alene, eller gem der ikke spærres af fejlen, falder", () => {
    expect(editorSkriverSammen(editor.replace('onDraftChange({ media_provider: "external", external_url: trimmed });', "onDraftChange({ external_url: trimmed });"))).toBe(false);
    expect(editorSkriverSammen(editor.replace("if (videoFejl || spotifyFejl) {\n      setError(videoFejl ?? spotifyFejl);\n      return;\n    }", ""))).toBe(false);
    expect(editorSkriverSammen(editor + '\nonDraftChange({ bunny_video_id: "x" });')).toBe(false);
  });
  it("selvbevis 5: en egen iframe i WeekVideoCard (to afspillere) falder", () => {
    expect(enDeltAfspiller(forside.replace("<YouTubePlayer youtubeId={youTubeId} title={video.title} coverUrl={coverUrl} />", '<iframe src={youtubeNocookieEmbedUrl(youTubeId)} title={video.title} />'))).toBe(false);
  });
});
