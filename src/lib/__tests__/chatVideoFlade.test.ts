import { describe, expect, it } from "vitest";
import {
  AFSPIL_POLL_HURTIG_INDTIL_MS,
  AFSPIL_POLL_HURTIG_MS,
  AFSPIL_POLL_MAKS_MS,
  AFSPIL_POLL_MS,
  byggVideoBesked,
  doemFilLaengde,
  erSkjultBobletekst,
  erTomFil,
  formatVarighed,
  FORNY_FOER_MS,
  FORNY_MINDST_MS,
  naesteAfspilForespoergsel,
  OPTAGEFORMATER,
  sletGennemfoert,
  TOM_TEKST,
  vaelgOptageformat,
  varighedTilBesked,
  VIDEO_MARKOER,
  videoSendeTekst,
} from "@/lib/chatVideoFlade";
import { laesChatVideo, MAKS_SEKUNDER } from "@/lib/chatVideo";
import { svarUddrag } from "@/lib/chatSvar";

const GUID = "657bb740-a71b-4529-a012-528021c31a92";

describe("chatVideoFlade — markøren", () => {
  it("er «🎥 Video», og boblen skjuler den som «📎»", () => {
    expect(VIDEO_MARKOER).toBe("🎥 Video");
    expect(erSkjultBobletekst(VIDEO_MARKOER)).toBe(true);
    expect(erSkjultBobletekst("📎")).toBe(true);
  });

  it("kun PRÆCIS markøren skjules — en tekst med markøren i er tekst", () => {
    for (const c of ["🎥 Video af tallene", " 🎥 Video", "Hej", "", null, undefined]) {
      expect(erSkjultBobletekst(c as string), String(c)).toBe(false);
    }
  });

  it("svarcitatet giver «🎥 Video» (som «📎 Vedhæftning»)", () => {
    expect(svarUddrag(VIDEO_MARKOER)).toBe("🎥 Video");
    expect(svarUddrag(`<p>${VIDEO_MARKOER}</p>`)).toBe("🎥 Video");
    expect(svarUddrag("📎")).toBe("📎 Vedhæftning");
  });
});

describe("chatVideoFlade — optageformatet: MP4 før WebM", () => {
  it("rækkefølgen er den besluttede", () => {
    expect([...OPTAGEFORMATER]).toEqual(["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]);
  });

  it("det første understøttede vinder", () => {
    expect(vaelgOptageformat(() => true)).toBe("video/mp4;codecs=avc1,mp4a");
    expect(vaelgOptageformat((t) => t === "video/mp4" || t.startsWith("video/webm"))).toBe("video/mp4");
    expect(vaelgOptageformat((t) => t.startsWith("video/webm"))).toBe("video/webm;codecs=vp9,opus");
    expect(vaelgOptageformat((t) => t === "video/webm")).toBe("video/webm");
  });

  it("intet understøttet → null (browseren vælger selv); en browser, der kaster, understøtter ikke", () => {
    expect(vaelgOptageformat(() => false)).toBeNull();
    expect(vaelgOptageformat((t) => { if (t.startsWith("video/mp4")) throw new Error("x"); return t === "video/webm"; })).toBe("video/webm");
  });
});

describe("chatVideoFlade — længden på en valgt fil", () => {
  it("op til og med MAKS_SEKUNDER er ok; over er for lang", () => {
    expect(MAKS_SEKUNDER).toBe(180);
    expect(doemFilLaengde(1)).toBe("ok");
    expect(doemFilLaengde(180)).toBe("ok");
    expect(doemFilLaengde(180.4)).toBe("for_lang");
    expect(doemFilLaengde(600)).toBe("for_lang");
  });

  it("en længde, ingen kan aflæse, afvises", () => {
    for (const s of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) expect(doemFilLaengde(s), String(s)).toBe("ukendt");
  });
});

describe("chatVideoFlade — varighed og beskedens form", () => {
  it("formatVarighed", () => {
    expect(formatVarighed(0)).toBe("0:00");
    expect(formatVarighed(83.9)).toBe("1:23");
    expect(formatVarighed(180)).toBe("3:00");
    expect(formatVarighed(Number.NaN)).toBe("0:00");
  });

  it("varigheden på beskeden er hele sekunder, aldrig over loftet og aldrig negativ", () => {
    expect(varighedTilBesked(83.6)).toBe(84);
    expect(varighedTilBesked(181)).toBe(180);
    expect(varighedTilBesked(-3)).toBe(0);
    expect(varighedTilBesked(Number.NaN)).toBe(0);
  });

  it("byggVideoBesked: markøren som content, video.guid + varighed i context_meta — og laesChatVideo læser den", () => {
    const b = byggVideoBesked({ guid: GUID, varighed: 42.2 });
    expect(b).toEqual({ content: VIDEO_MARKOER, context_meta: { video: { guid: GUID, varighed: 42 } } });
    expect(laesChatVideo(b.context_meta)).toEqual({ guid: GUID });
  });
});

describe("chatVideoFlade — hvornår «afspil» spørges igen", () => {
  const NU = Date.parse("2026-09-29T12:00:00Z");

  it("behandles: hvert 2. sekund det første minut fra første svar (29/9)", () => {
    expect(AFSPIL_POLL_HURTIG_MS).toBe(2_000);
    expect(AFSPIL_POLL_HURTIG_INDTIL_MS).toBe(60_000);
    expect(naesteAfspilForespoergsel({ status: "behandles", nuMs: NU, foersteMs: NU })).toBe(2_000);
    expect(naesteAfspilForespoergsel({ status: "behandles", nuMs: NU + 10_000, foersteMs: NU })).toBe(2_000);
    expect(naesteAfspilForespoergsel({ status: "behandles", nuMs: NU + 59_999, foersteMs: NU })).toBe(2_000);
  });

  it("behandles: derefter hvert 10. sekund i højst 10 minutter fra første svar", () => {
    expect(AFSPIL_POLL_MS).toBe(10_000);
    expect(AFSPIL_POLL_MAKS_MS).toBe(600_000);
    expect(naesteAfspilForespoergsel({ status: "behandles", nuMs: NU + 60_000, foersteMs: NU })).toBe(10_000);
    expect(naesteAfspilForespoergsel({ status: "behandles", nuMs: NU + 599_999, foersteMs: NU })).toBe(10_000);
    expect(naesteAfspilForespoergsel({ status: "behandles", nuMs: NU + 600_000, foersteMs: NU })).toBe(false);
    expect(naesteAfspilForespoergsel({ status: "behandles", nuMs: NU + 3_600_000, foersteMs: NU })).toBe(false);
  });

  it("REGNESTYKKET i kommentaren holder: kald til «klar» efter 10, 30 og 60 s — og ved loftet", () => {
    /** Kald fra mount til «klar» efter T ms: 1 ved mount + hvert interval, dommen selv giver. */
    const kald = (klarEfterMs: number) => {
      let n = 1, t = 0;
      for (;;) {
        const naeste = naesteAfspilForespoergsel({ status: "behandles", nuMs: NU + t, foersteMs: NU });
        if (naeste === false) return n;
        t += naeste;
        n++;
        if (t >= klarEfterMs) return n;
      }
    };
    expect(kald(10_000)).toBe(6);
    expect(kald(30_000)).toBe(16);
    expect(kald(60_000)).toBe(31);
    expect(kald(Number.POSITIVE_INFINITY)).toBe(85);
    // Før 29/9 (10 s hele vejen) var det 2, 4, 7 og 61 — regnestykket står i chatVideoFlade.ts.
    const foer = (klarEfterMs: number) => 1 + Math.ceil(klarEfterMs / 10_000);
    expect([foer(10_000), foer(30_000), foer(60_000)]).toEqual([2, 4, 7]);
  });

  it("klar: et minut før expires, dog mindst 10 sekunder; uden expires aldrig", () => {
    const expires = Math.floor(NU / 1000) + 3600;
    expect(naesteAfspilForespoergsel({ status: "klar", expires, nuMs: NU, foersteMs: NU })).toBe(3600_000 - FORNY_FOER_MS);
    expect(naesteAfspilForespoergsel({ status: "klar", expires: Math.floor(NU / 1000) + 30, nuMs: NU, foersteMs: NU })).toBe(FORNY_MINDST_MS);
    expect(naesteAfspilForespoergsel({ status: "klar", expires: null, nuMs: NU, foersteMs: NU })).toBe(false);
  });

  it("fejlet, intet svar eller en ukendt status: aldrig", () => {
    expect(naesteAfspilForespoergsel({ status: "fejlet", nuMs: NU, foersteMs: NU })).toBe(false);
    expect(naesteAfspilForespoergsel({ status: undefined, nuMs: NU, foersteMs: NU })).toBe(false);
    expect(naesteAfspilForespoergsel({ status: null, nuMs: NU, foersteMs: NU })).toBe(false);
  });
});

describe("chatVideoFlade — erTomFil: 0 bytes uploades aldrig, ingen øvre grænse", () => {
  it("0, negativ, NaN, ikke-tal, mangler eller intet objekt er tomt", () => {
    for (const fil of [{ size: 0 }, { size: -1 }, { size: Number.NaN }, { size: "12" }, { size: null }, {}, null, undefined]) {
      expect(erTomFil(fil as never), JSON.stringify(fil)).toBe(true);
    }
  });
  it("én byte er nok — og der findes ingen øvre grænse (Bunny dokumenterer ingen)", () => {
    expect(erTomFil({ size: 1 })).toBe(false);
    expect(erTomFil({ size: 2 * 1024 * 1024 * 1024 })).toBe(false);
    expect(erTomFil(new Blob(["x"]))).toBe(false);
    expect(erTomFil(new Blob([]))).toBe(true);
  });
  it("teksterne er ordret Jonas' (29/9)", () => {
    expect(TOM_TEKST.optagelse).toBe("Optagelsen blev tom. Prøv at optage igen.");
    expect(TOM_TEKST.fil).toBe("Filen er tom.");
  });
});

describe("chatVideoFlade — sendelinjens ord", () => {
  it("sender: «Sender video … 42 %», afrundet og klemt til 0–100", () => {
    expect(videoSendeTekst({ tilstand: "sender", procent: 42 })).toBe("Sender video … 42 %");
    expect(videoSendeTekst({ tilstand: "sender", procent: 0 })).toBe("Sender video … 0 %");
    expect(videoSendeTekst({ tilstand: "sender", procent: 99.6 })).toBe("Sender video … 100 %");
    expect(videoSendeTekst({ tilstand: "sender", procent: 140 })).toBe("Sender video … 100 %");
    expect(videoSendeTekst({ tilstand: "sender", procent: Number.NaN })).toBe("Sender video … 0 %");
  });
  it("sendt og fejl", () => {
    expect(videoSendeTekst({ tilstand: "sendt" })).toBe("Videoen er sendt.");
    expect(videoSendeTekst({ tilstand: "fejl", besked: "Videoen kunne ikke uploades. Prøv igen." })).toBe("Videoen kunne ikke uploades. Prøv igen.");
  });
});

describe("chatVideoFlade — sletningen er gennemført KUN ved { slettet: true }", () => {
  it("fandtes eller ej", () => {
    expect(sletGennemfoert({ slettet: true, fandtes: true })).toBe(true);
    expect(sletGennemfoert({ slettet: true, fandtes: false })).toBe(true);
  });
  it("alt andet må ikke slette beskeden", () => {
    for (const s of [null, undefined, {}, { slettet: false }, { slettet: "true" }, { error: "Forbidden" }, "ok", true]) {
      expect(sletGennemfoert(s), JSON.stringify(s)).toBe(false);
    }
  });
});
