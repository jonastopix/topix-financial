import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (15/9 2026, fund K / DE TYVE (11)): app.theboardroom.dk er en ren
// SPA, så ethvert delt app-link viser index.html's og:/twitter:-tags. Teksten
// er Jonas' valg A (15/9), ordret. Robots noindex og og-billedet er uændrede.
// Manifestet (PWA) bærer samme beskrivelse.

const TITEL = "The Boardroom — sparring for virksomhedsejere";
const BESKRIVELSE =
  "12 måneder med sparring fra Morten Larsen og Jonas Herlev og et netværk af andre selvstændige. Medlemskab efter ansøgning på theboardroom.dk.";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "public/manifest.json"), "utf8")) as { name: string; short_name: string; description: string };

describe("linkPreview.guard — index.html bærer Jonas' titel og beskrivelse (valg A, 15/9)", () => {
  it("titlen står i <title>, og:title og twitter:title", () => {
    expect(html).toContain(`<title>${TITEL}</title>`);
    expect(html).toContain(`<meta property="og:title" content="${TITEL}">`);
    expect(html).toContain(`<meta name="twitter:title" content="${TITEL}">`);
  });

  it("beskrivelsen står i description, og:description og twitter:description", () => {
    expect(html).toContain(`<meta name="description" content="${BESKRIVELSE}">`);
    expect(html).toContain(`<meta property="og:description" content="${BESKRIVELSE}">`);
    expect(html).toContain(`<meta name="twitter:description" content="${BESKRIVELSE}">`);
  });

  it("den gamle tekst er væk", () => {
    expect(html).not.toContain("Alt-i-én platform");
    expect(html).not.toContain("Dit finansielle overblik");
    expect(html).not.toContain("Rapportér, budgettér");
  });

  it("robots noindex står stadig, og og:image peger stadig på /og-image.jpg med 1200×630", () => {
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).toContain('<meta property="og:image" content="https://app.theboardroom.dk/og-image.jpg" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain('<meta name="twitter:image" content="https://app.theboardroom.dk/og-image.jpg" />');
  });
});

describe("linkPreview.guard — manifest.json", () => {
  it("description er Jonas' beskrivelse og nævner ikke «rapportér»; name og short_name er uændrede", () => {
    expect(manifest.description).toBe(BESKRIVELSE);
    expect(manifest.description.toLowerCase()).not.toContain("rapportér");
    expect(manifest.name).toBe("The Boardroom");
    expect(manifest.short_name).toBe("Boardroom");
  });
});
