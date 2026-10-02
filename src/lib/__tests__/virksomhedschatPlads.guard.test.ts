import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for chattens plads på virksomhedssiden (30/9-2026, Jonas 21:36:
// «Chatten på virksomhedssiderne er lidt for små. Og de bliver endnu mindre
// med banneret "brug for hjælp til", som vel reelt er ligegyldigt nu, hvor vi
// har fået refleksionerne for oven på siderne?»). Tre domme, hver med
// selvbevis på en kopi:
//   1. HØJDEN er ikke en lille fast værdi: CHAT_HOEJDE bærer på lg en
//      viewport-beregning `lg:h-[calc(100dvh-Nrem)]` med N ≤ 8, et lg-minimum
//      ≥ 440 px, og hverken en fast pixelhøjde (`h-[NNNpx]`) eller de gamle
//      60 vh. Regnestykket står ved CHAT_HOEJDE i VirksomhedView.
//   2. BÅNDET «Brug for hjælp til» er ikke et fuldt bånd: det står ÉT sted,
//      aldrig i låst tilstand (virksomhedssiden — blok 2 viser samme felt),
//      hentningen er slået fra i låst tilstand, og på /chat er linjen
//      `truncate` med «Vis mere», lukket som standard (useState(null)).
//   3. SKRIVEFELTET er lavere i hvile KUN på virksomhedssiden: 10/9-klassen
//      (tre linjer) står uændret i ChatRichInput, `lavIHvile` er valgfri med
//      standard false, CompanyChatPane sender `lavIHvile={laast}`, og
//      medlemmets chat (MemberChatPane) og community sender den ikke.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const VIEW = "src/components/hjemmebane/virksomhed/VirksomhedView.tsx";
const PANE = "src/components/CompanyChatPane.tsx";
const INPUT = "src/components/ChatRichInput.tsx";
const MEDLEM = "src/components/MemberChatPane.tsx";
const COMMUNITY = "src/components/hjemmebane/community/CommunityComposer.tsx";

/** Dom 1: højden er en viewport-beregning på lg, ikke en lille fast værdi. */
export const hoejdenErViewport = (view: string): boolean => {
  const m = view.match(/const CHAT_HOEJDE = "([^"]+)";/);
  if (!m) return false;
  const k = m[1];
  const calc = k.match(/(?:^|\s)lg:h-\[calc\(100dvh-(\d+(?:\.\d+)?)rem\)\]/);
  const lgMin = k.match(/(?:^|\s)lg:min-h-\[(\d+)px\]/);
  return (
    calc !== null && Number(calc[1]) <= 8 &&
    lgMin !== null && Number(lgMin[1]) >= 440 &&
    !/(?:^|\s)(?:lg:)?h-\[\d+px\]/.test(k) &&
    !/h-\[60vh\]/.test(k)
  );
};

/** Dom 2: båndet er foldet på /chat og væk på virksomhedssiden. */
export const baandetErFoldet = (pane: string): boolean => {
  const forekomster = pane.split("Brug for hjælp til:").length - 1;
  if (forekomster !== 1) return false;
  const i = pane.indexOf("Brug for hjælp til:");
  const blok = pane.slice(Math.max(0, i - 900), i + 600);
  return (
    /\{isAdvisor && !laast && activeConv && latestPulse\?\.help_needed && /.test(blok) &&
    /udfoldet \? "whitespace-pre-line" : "truncate"/.test(blok) &&
    /\{udfoldet \? "Vis mindre" : "Vis mere"\}/.test(blok) &&
    /aria-expanded=\{udfoldet\}/.test(blok) &&
    /const \[hjaelpUdfoldetFor, setHjaelpUdfoldetFor\] = useState<string \| null>\(null\);/.test(pane) &&
    /enabled: !!isAdvisor && !laast && !!activeConv\?\.company_id,/.test(pane)
  );
};

/** Dom 3: lavIHvile kun på virksomhedssiden; 10/9-feltet uændret for alle andre. */
export const skrivefeltetLavKunDer = (input: string, pane: string, medlem: string, community: string): boolean =>
  input.includes('isCompact ? "py-2.5 min-h-[80px] max-h-[33vh]" : "py-2 min-h-[76px] max-h-[33vh]"') &&
  input.includes('!isCompact && lavIHvile && "min-h-[40px] focus:min-h-[76px] transition-[min-height] duration-150"') &&
  /lavIHvile\?: boolean;/.test(input) &&
  /lavIHvile = false,/.test(input) &&
  /lavIHvile=\{laast\}/.test(pane) &&
  !/lavIHvile/.test(medlem) &&
  !/lavIHvile/.test(community);

describe("virksomhedschatPlads.guard — chatten fylder skærmen, båndet er foldet/væk, skrivefeltet lavt i hvile", () => {
  const view = udenKommentarer(laes(VIEW));
  const pane = udenKommentarer(laes(PANE));
  const input = udenKommentarer(laes(INPUT));
  const medlem = udenKommentarer(laes(MEDLEM));
  const community = udenKommentarer(laes(COMMUNITY));

  it("dom 1: CHAT_HOEJDE er viewportet minus sektionens hoved på lg (≤ 8 rem), min ≥ 440 px, ingen fast pixelhøjde", () => {
    expect(hoejdenErViewport(view)).toBe(true);
  });
  it("dom 2: «Brug for hjælp til» — aldrig i låst tilstand, én linje med «Vis mere» på /chat", () => {
    expect(baandetErFoldet(pane)).toBe(true);
  });
  it("dom 3: lavIHvile kun fra CompanyChatPane (låst); medlemmets chat og community urørte", () => {
    expect(skrivefeltetLavKunDer(input, pane, medlem, community)).toBe(true);
  });

  it("selvbevis 1: 60 vh, en fast pixelhøjde, for stort fradrag eller et lille minimum falder", () => {
    const m = view.match(/const CHAT_HOEJDE = "([^"]+)";/)!;
    const med = (k: string) => view.replace(m[0], `const CHAT_HOEJDE = "${k}";`);
    expect(hoejdenErViewport(med("h-[60vh] min-h-[420px]"))).toBe(false);
    expect(hoejdenErViewport(med("h-[70dvh] min-h-[440px] lg:h-[520px] lg:min-h-[480px]"))).toBe(false);
    expect(hoejdenErViewport(med("h-[70dvh] min-h-[440px] lg:h-[calc(100dvh-20rem)] lg:min-h-[480px]"))).toBe(false);
    expect(hoejdenErViewport(med("h-[70dvh] min-h-[440px] lg:h-[calc(100dvh-7rem)] lg:min-h-[300px]"))).toBe(false);
  });
  it("selvbevis 2: det fulde bånd tilbage, båndet i låst tilstand, eller udfoldet som standard falder", () => {
    expect(baandetErFoldet(pane.replace('udfoldet ? "whitespace-pre-line" : "truncate"', 'udfoldet ? "whitespace-pre-line" : ""'))).toBe(false);
    expect(baandetErFoldet(pane.replace("{isAdvisor && !laast && activeConv && latestPulse?.help_needed && ", "{isAdvisor && activeConv && latestPulse?.help_needed && "))).toBe(false);
    expect(baandetErFoldet(pane.replace("enabled: !!isAdvisor && !laast && !!activeConv?.company_id,", "enabled: !!isAdvisor && !!activeConv?.company_id,"))).toBe(false);
    expect(baandetErFoldet(pane.replace("setHjaelpUdfoldetFor] = useState<string | null>(null);", "setHjaelpUdfoldetFor] = useState<string | null>(activeConvId);"))).toBe(false);
    expect(baandetErFoldet(pane + '\n<p>Brug for hjælp til: {x}</p>')).toBe(false);
  });
  it("selvbevis 3: 10/9-feltet ændret, eller lavIHvile i medlemmets chat, falder", () => {
    expect(skrivefeltetLavKunDer(input.replace("py-2 min-h-[76px] max-h-[33vh]", "py-2 min-h-[40px] max-h-[33vh]"), pane, medlem, community)).toBe(false);
    expect(skrivefeltetLavKunDer(input, pane, medlem + "\n<ChatRichInput lavIHvile />", community)).toBe(false);
    expect(skrivefeltetLavKunDer(input.replace("lavIHvile = false,", "lavIHvile = true,"), pane, medlem, community)).toBe(false);
  });
});
