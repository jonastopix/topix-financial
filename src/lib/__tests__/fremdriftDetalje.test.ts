import { describe, expect, it } from "vitest";
import { detaljeTilstand, type HentningsStatus } from "@/lib/hjemmebane/fremdriftDetalje";
import { HentningsFejl } from "@/lib/kraevRaekker";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";

// Fremdrift-fanens medlemsdetalje (16/9): fejler en hentning, vises husets
// fejltekst — aldrig «0 af 0 videoer gennemført». Mens der hentes: henter.

const ok: HentningsStatus = { isError: false, isSuccess: true };
const venter: HentningsStatus = { isError: false, isSuccess: false };
const fejl = (kilde: string): HentningsStatus => ({ isError: true, isSuccess: false, error: new HentningsFejl(kilde, "x") });

describe("detaljeTilstand", () => {
  it("klar når lektioner, samlinger og fremdrift er hentet", () => {
    expect(detaljeTilstand({ lektioner: ok, samlinger: ok, fremdrift: ok, publiceredeLektioner: 17 })).toEqual({ art: "klar" });
  });

  it("henter så længe én af de tre mangler — aldrig 0", () => {
    expect(detaljeTilstand({ lektioner: venter, samlinger: ok, fremdrift: ok, publiceredeLektioner: 17 })).toEqual({ art: "henter" });
    expect(detaljeTilstand({ lektioner: ok, samlinger: venter, fremdrift: ok, publiceredeLektioner: 17 })).toEqual({ art: "henter" });
    expect(detaljeTilstand({ lektioner: ok, samlinger: ok, fremdrift: venter, publiceredeLektioner: 17 })).toEqual({ art: "henter" });
    expect(detaljeTilstand({ lektioner: venter, samlinger: venter, fremdrift: venter, publiceredeLektioner: 0 })).toEqual({ art: "henter" });
  });

  it("fejl når én hentning er fejlet — fejlen gives videre, så teksten kan navngive kilden", () => {
    const l = detaljeTilstand({ lektioner: fejl("content_items"), samlinger: ok, fremdrift: ok, publiceredeLektioner: 17 });
    expect(l.art).toBe("fejl");
    const s = detaljeTilstand({ lektioner: ok, samlinger: fejl("content_collections"), fremdrift: ok, publiceredeLektioner: 17 });
    expect(s.art).toBe("fejl");
    const f = detaljeTilstand({ lektioner: ok, samlinger: ok, fremdrift: fejl("member_progress"), publiceredeLektioner: 17 });
    expect(f.art).toBe("fejl");
    if (f.art !== "fejl") throw new Error("uventet");
    expect(raadgiverHentefejlTekst(f.error, "listen")).toBe("Noget af det der står her kunne ikke hentes — listen kan mangle noget. Prøv igen.");
  });

  it("fejl vinder over henter og over klar — også når fremdriften er hentet", () => {
    expect(detaljeTilstand({ lektioner: fejl("content_items"), samlinger: venter, fremdrift: venter, publiceredeLektioner: 0 }).art).toBe("fejl");
    expect(detaljeTilstand({ lektioner: ok, samlinger: ok, fremdrift: fejl("member_progress"), publiceredeLektioner: 17 }).art).toBe("fejl");
  });

  it("lektionerne dømmes først: fejler de, er det deres fejl der vises (samlinger og fremdrift er meningsløse uden)", () => {
    const t = detaljeTilstand({ lektioner: fejl("content_items"), samlinger: fejl("content_collections"), fremdrift: fejl("member_progress"), publiceredeLektioner: 17 });
    if (t.art !== "fejl") throw new Error("uventet");
    expect((t.error as HentningsFejl).kilde).toBe("content_items");
  });

  it("ingen publicerede lektioner: fremdrift-hentningen er slået fra, og «0 af 0» er det sande tal → klar", () => {
    expect(detaljeTilstand({ lektioner: ok, samlinger: ok, fremdrift: venter, publiceredeLektioner: 0 })).toEqual({ art: "klar" });
  });
});
