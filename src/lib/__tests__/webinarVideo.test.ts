import { describe, expect, it } from "vitest";
import {
  bunnyAfspilUrl,
  BUNNY_AFSPIL_VAERT,
  type KlikOpslag,
  knapTekst,
  laesKlikId,
  laesVideoKonfig,
  mailVideo,
  stillbilledeUrl,
  VIDEO_ART,
  VIDEO_KONFIG_NOEGLE,
  videoIKoerslen,
  videoKlikUrl,
  verifyVideoKlik,
} from "../../../supabase/functions/_shared/webinarVideo.ts";
import { bygWebinarMail } from "../../../supabase/functions/_shared/webinarMailTekster.ts";
import { AKTIVE_ARTER, ARTER } from "@/lib/webinar/mailDom";

/**
 * Mortens hilsen i mailen «dagen før» (udkast 30/9-2026). Dommen over
 * konfigurationen, valget pr. kørsel, linkene og byggeren — på ALLE arter.
 */

const GYLDIG = {
  library_id: "123456",
  video_id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  pull_zone: "vz-00a6a87d-5cd.b-cdn.net",
  titel: "Mortens hilsen før webinaret",
  varighed_min: 2,
  aktiv: true,
};
const KLIK_BASIS = "https://p.supabase.co/functions/v1/webinar-video";
const MAIL_ID = "11111111-2222-4333-8444-555555555555";

const SESSION = "2026-10-13T09:00:00.000Z";
const ARGS = {
  sessionTid: SESSION,
  webinarTitel: "Webinar med Morten Larsen",
  joinLink: "https://topix.ewebinar.com/webinar/x/join/abc",
  kalenderLink: "https://api.ewebinar.com/v1/attendees/12345/ics",
  afmeldUrl: "https://p.supabase.co/functions/v1/webinar-afmeld?t=abc.def",
  invitationVedhaeftet: true,
};

const konfig = () => {
  const d = laesVideoKonfig(GYLDIG);
  if (d.status !== "gyldig") throw new Error("GYLDIG er ikke gyldig");
  return d.konfig;
};
const VIDEO = mailVideo(konfig(), KLIK_BASIS, MAIL_ID);

describe("laesVideoKonfig — dommen over app_config.webinar_en_dag_video", () => {
  it("nøglen og arten er de aftalte", () => {
    expect(VIDEO_KONFIG_NOEGLE).toBe("webinar_en_dag_video");
    expect(VIDEO_ART).toBe("en_dag");
  });

  it("null og manglende række = ikke_sat (mailen som i dag)", () => {
    expect(laesVideoKonfig(null)).toEqual({ status: "ikke_sat" });
    expect(laesVideoKonfig(undefined)).toEqual({ status: "ikke_sat" });
  });

  it("den gyldige form læses og normaliseres", () => {
    const d = laesVideoKonfig({ ...GYLDIG, library_id: 123456, video_id: GYLDIG.video_id.toUpperCase(), pull_zone: " VZ-00A6A87D-5CD.B-CDN.NET " });
    expect(d).toEqual({ status: "gyldig", konfig: { libraryId: "123456", videoId: GYLDIG.video_id, pullZone: "vz-00a6a87d-5cd.b-cdn.net", titel: GYLDIG.titel, varighedMin: 2, aktiv: true } });
  });

  it("FAIL-CLOSED: alt andet end den præcise form er ugyldig — med en grund", () => {
    const ugyldige: unknown[] = [
      "tekst", 42, true, [], [GYLDIG],
      {},                                                   // delvis: alt mangler
      { ...GYLDIG, aktiv: undefined },                       // nøglen står, men uden værdi
      (() => { const { aktiv: _a, ...r } = GYLDIG; return r; })(),
      (() => { const { pull_zone: _p, ...r } = GYLDIG; return r; })(),
      { ...GYLDIG, ekstra: 1 },                              // ukendt nøgle = stavefejl
      { ...GYLDIG, library_id: "abc" },
      { ...GYLDIG, library_id: "0123" },
      { ...GYLDIG, library_id: 1.5 },
      { ...GYLDIG, library_id: "123/../456" },
      { ...GYLDIG, video_id: "ikke-et-guid" },
      { ...GYLDIG, video_id: `${GYLDIG.video_id}/../x` },
      { ...GYLDIG, pull_zone: "evil.example.com" },
      { ...GYLDIG, pull_zone: "a.b.b-cdn.net" },
      { ...GYLDIG, pull_zone: "https://vz-00a6a87d-5cd.b-cdn.net" },
      { ...GYLDIG, pull_zone: "vz-00a6a87d-5cd.b-cdn.net/x" },
      { ...GYLDIG, titel: "" },
      { ...GYLDIG, titel: "x".repeat(81) },
      { ...GYLDIG, titel: "Se optagelsen" },
      { ...GYLDIG, varighed_min: 0 },
      { ...GYLDIG, varighed_min: 21 },
      { ...GYLDIG, varighed_min: 1.5 },
      { ...GYLDIG, varighed_min: "2" },
      { ...GYLDIG, aktiv: "true" },
      { ...GYLDIG, aktiv: 1 },
    ];
    for (const u of ugyldige) {
      const d = laesVideoKonfig(u);
      expect(d.status, JSON.stringify(u)).toBe("ugyldig");
      if (d.status === "ugyldig") expect(d.grund.length, JSON.stringify(u)).toBeGreaterThan(0);
    }
  });
});

describe("videoIKoerslen — hvem får videoen i DENNE kørsel", () => {
  it("aktiv true = alle; aktiv false = kun prøven; ellers ingen", () => {
    const taendt = laesVideoKonfig(GYLDIG);
    const slukket = laesVideoKonfig({ ...GYLDIG, aktiv: false });
    expect(videoIKoerslen(taendt, false).status).toBe("taendt");
    expect(videoIKoerslen(taendt, true).status).toBe("taendt");
    expect(videoIKoerslen(slukket, false)).toEqual({ status: "slukket", konfig: null, grund: null });
    const p = videoIKoerslen(slukket, true);
    expect(p.status).toBe("proeve");
    expect(p.konfig).not.toBeNull();
  });

  it("ikke sat og ugyldig giver ALDRIG video — heller ikke i prøven", () => {
    for (const proeve of [false, true]) {
      expect(videoIKoerslen(laesVideoKonfig(null), proeve)).toEqual({ status: "ikke_sat", konfig: null, grund: null });
      const u = videoIKoerslen(laesVideoKonfig({ ...GYLDIG, video_id: "x" }), proeve);
      expect(u.status).toBe("ugyldig");
      expect(u.konfig).toBeNull();
      expect(u.grund).toContain("video_id");
    }
  });
});

describe("linkene — ingen åben viderestilling, ingen adresse i URL'en", () => {
  it("afspilningssiden er Bunnys faste vært med bibliotek og video", () => {
    expect(bunnyAfspilUrl(konfig())).toBe(`https://${BUNNY_AFSPIL_VAERT}/play/123456/${GYLDIG.video_id}`);
    expect(BUNNY_AFSPIL_VAERT).toBe("iframe.mediadelivery.net");
  });

  it("et mål bygget af noget andet end dømte id'er giver null", () => {
    expect(bunnyAfspilUrl({ libraryId: "@evil.example.com", videoId: GYLDIG.video_id })).toBeNull();
    expect(bunnyAfspilUrl({ libraryId: "123", videoId: "../../x" })).toBeNull();
    expect(bunnyAfspilUrl({ libraryId: "123.evil.com", videoId: GYLDIG.video_id })).toBeNull();
  });

  it("stillbilledet og klik-linket", () => {
    expect(stillbilledeUrl(konfig())).toBe(`https://vz-00a6a87d-5cd.b-cdn.net/${GYLDIG.video_id}/thumbnail.jpg`);
    expect(videoKlikUrl(`${KLIK_BASIS}/`, MAIL_ID)).toBe(`${KLIK_BASIS}?m=${MAIL_ID}`);
    expect(VIDEO.klikUrl).not.toContain("@");
    expect(knapTekst(2)).toBe("Se Mortens hilsen (2 min)");
  });

  it("laesKlikId: kun et uuid når databasen", () => {
    expect(laesKlikId(MAIL_ID)).toBe(MAIL_ID);
    expect(laesKlikId(` ${MAIL_ID.toUpperCase()} `)).toBe(MAIL_ID);
    for (const u of [null, undefined, "", "jonas@topix.dk", "1", `${MAIL_ID}x`, 42]) expect(laesKlikId(u)).toBeNull();
  });
});

describe("verifyVideoKlik — kun en sendt en_dag-række logges", () => {
  const falsk = (svar: { data: unknown; error: { message: string } | null } | "kast") => {
    const kald: string[][] = [];
    const admin: KlikOpslag = {
      from: (t) => ({
        select: (k) => ({
          eq: (a1, v1) => ({
            eq: (a2, v2) => ({
              eq: (a3, v3) => ({
                maybeSingle: () => {
                  kald.push([t, k, a1, v1, a2, v2, a3, v3]);
                  if (svar === "kast") throw new Error("nede");
                  return Promise.resolve(svar);
                },
              }),
            }),
          }),
        }),
      }),
    };
    return { admin, kald };
  };

  it("et ugyldigt id når aldrig databasen", async () => {
    const { admin, kald } = falsk({ data: { id: MAIL_ID }, error: null });
    expect(await verifyVideoKlik(admin, "jonas@topix.dk")).toEqual({ kendt: false, grund: "form" });
    expect(kald).toHaveLength(0);
  });

  it("opslaget er id + art en_dag + udfald ok", async () => {
    const { admin, kald } = falsk({ data: { id: MAIL_ID }, error: null });
    expect(await verifyVideoKlik(admin, MAIL_ID)).toEqual({ kendt: true, mailId: MAIL_ID });
    expect(kald[0]).toEqual(["webinar_mails", "id", "id", MAIL_ID, "art", "en_dag", "udfald", "ok"]);
  });

  it("ukendt, fejl og kast er ikke kendt", async () => {
    expect(await verifyVideoKlik(falsk({ data: null, error: null }).admin, MAIL_ID)).toEqual({ kendt: false, grund: "ukendt" });
    expect(await verifyVideoKlik(falsk({ data: null, error: { message: "x" } }).admin, MAIL_ID)).toEqual({ kendt: false, grund: "laesefejl" });
    expect(await verifyVideoKlik(falsk("kast").admin, MAIL_ID)).toEqual({ kendt: false, grund: "laesefejl" });
  });
});

describe("bygWebinarMail med video — KUN en_dag, på alle arter", () => {
  it("en_dag får blokken: stillbillede link-wrapped, knappen, og linjen i teksten", () => {
    const m = bygWebinarMail({ ...ARGS, art: "en_dag", video: VIDEO });
    expect(m.html).toContain(`<a href="${VIDEO.klikUrl}" style="text-decoration:none;"><img alt="${GYLDIG.titel}" src="${VIDEO.stillbilledeUrl}"`);
    expect(m.html).toContain(">Se Mortens hilsen (2 min)</a>");
    expect(m.html).toContain(`href="${VIDEO.klikUrl}" style="height:48px;`); // Outlooks VML-knap
    expect(m.text).toContain(`Se Mortens hilsen (2 min): ${VIDEO.klikUrl}`);
    // Ingen afspiller i mailen — mailklienter kan ikke.
    expect(m.html).not.toMatch(/<iframe|<video|<source/i);
    // Join-knappen er uændret den primære handling.
    expect(m.html).toContain(`href="${ARGS.joinLink}"`);
  });

  it("alle andre arter (aktive og udgåede) er TEGN FOR TEGN som uden video", () => {
    for (const art of ARTER) {
      if (art === VIDEO_ART) continue;
      const med = bygWebinarMail({ ...ARGS, art, video: VIDEO });
      const uden = bygWebinarMail({ ...ARGS, art, video: null });
      expect(med, art).toEqual(uden);
      expect(med.html, art).not.toContain("Mortens hilsen");
    }
    // Og de aktive er en delmængde — sagt højt, fordi kravet er «prøvet på alle aktive arter».
    expect(AKTIVE_ARTER.filter((a) => a !== VIDEO_ART)).toEqual(["bekraeftelse", "fjorten_dage", "syv_dage", "en_time"]);
  });

  it("en_dag uden video er ren indsættelse væk: med = uden + én sammenhængende blok (HTML og tekst)", () => {
    for (const felt of ["html", "text"] as const) {
      const med = bygWebinarMail({ ...ARGS, art: "en_dag", video: VIDEO })[felt];
      const uden = bygWebinarMail({ ...ARGS, art: "en_dag", video: null })[felt];
      let p = 0;
      while (p < uden.length && med[p] === uden[p]) p++;
      let s = 0;
      while (s < uden.length - p && med[med.length - 1 - s] === uden[uden.length - 1 - s]) s++;
      expect(p + s, felt).toBe(uden.length);
      expect(med.length, felt).toBeGreaterThan(uden.length);
      expect(uden, felt).not.toContain("Mortens hilsen");
      expect(uden, felt).not.toContain(KLIK_BASIS);
    }
  });

  it("regel 6 holder også med video: ordet «optagelse» står i ingen aktiv art — og videoteksten nævner slet ikke at optage", () => {
    for (const art of AKTIVE_ARTER) {
      const m = bygWebinarMail({ ...ARGS, art, video: VIDEO });
      for (const del of [m.html, m.text, m.subject]) expect(del.toLowerCase(), art).not.toContain("optagelse");
    }
    const med = bygWebinarMail({ ...ARGS, art: "en_dag", video: VIDEO }).text;
    const uden = bygWebinarMail({ ...ARGS, art: "en_dag", video: null }).text;
    expect(med.toLowerCase().split("optag").length).toBe(uden.toLowerCase().split("optag").length);
  });

  it("konfigurationens titel escapes — den står i en attribut", () => {
    const d = laesVideoKonfig({ ...GYLDIG, titel: `Morten "siger" <hej> & farvel` });
    if (d.status !== "gyldig") throw new Error("burde være gyldig");
    const m = bygWebinarMail({ ...ARGS, art: "en_dag", video: mailVideo(d.konfig, KLIK_BASIS, MAIL_ID) });
    expect(m.html).toContain('alt="Morten &quot;siger&quot; &lt;hej&gt; &amp; farvel"');
    expect(m.html).not.toContain("<hej>");
  });
});
