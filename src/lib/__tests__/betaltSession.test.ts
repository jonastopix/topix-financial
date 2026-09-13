import { describe, expect, it } from "vitest";
import { afgoerBetaltSession, afgoerSessionSpor, betaltSessionTekst, erBetalt, type BetaltBooking } from "@/lib/betaltSession";

// De betalte 1:1-sessioner (kort 76, 13/9): fladen siger det rækken VED —
// betalt og link sendt — og påstår aldrig «afholdt» uden en tid der er
// passeret. Tiden er beviset, ikke calendly_event_uri (ændret 13/9 aften):
// de to Rallysupport-rækker får start_tid sat i hånden fra Calendly, fordi
// deres links (juni) aldrig bar et booking-id og webhooken derfor ikke kan
// ramme dem (webhookens Morten-filter er åbnet 13/9 aften; nye køb får id i
// linket). Prod 11/9: tre booking_sent uden URI, ni pending, ingen
// paid/refunded.
//
// Betalingsdatoen er created_at (rettet 13/9 aften): updated_at stemples af
// trigger update_session_bookings_updated_at ved ENHVER update, også en
// admins rettelse i SQL editoren. Fixturen har derfor bevidst en updated_at
// der ligger en dag EFTER created_at — dommen må aldrig vælge den.

const NU = new Date("2026-09-13T12:00:00Z");
const b = (over: Partial<BetaltBooking> = {}): BetaltBooking => ({
  advisor: "jonas",
  status: "booking_sent",
  amount_dkk: 500,
  calendly_event_uri: null,
  start_tid: null,
  slut_tid: null,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-02T08:30:00Z",
  ...over,
});

describe("erBetalt — udledes af rækken alene", () => {
  it("koster penge OG forbi pending: betalt", () => {
    for (const status of ["paid", "booking_sent", "booked", "cancelled", "refunded"]) {
      expect(erBetalt(b({ status }))).toBe(true);
    }
  });
  it("pending er ikke betalt — en checkout der aldrig blev gennemført", () => {
    expect(erBetalt(b({ status: "pending" }))).toBe(false);
  });
  it("amount_dkk 0 er det gratis spor, aldrig betalt — uanset status", () => {
    expect(erBetalt(b({ amount_dkk: 0, status: "booking_sent" }))).toBe(false);
    expect(erBetalt(b({ amount_dkk: 0, status: "booked" }))).toBe(false);
    expect(erBetalt(null)).toBe(false);
  });
});

describe("afgoerBetaltSession — tilstanden", () => {
  it("booking_sent (prods tre rækker): betalt og link sendt, ingen afholdt-dom", () => {
    const dom = afgoerBetaltSession(b(), NU);
    expect(dom.tilstand).toBe("betalt_link_sendt");
    expect(dom.betalt?.toISOString()).toBe("2026-09-01T10:00:00.000Z");
  });
  it("pending (prods ni rækker): ikke gennemført, ingen linje", () => {
    const dom = afgoerBetaltSession(b({ status: "pending" }), NU);
    expect(dom.tilstand).toBe("ikke_gennemfoert");
    expect(betaltSessionTekst(dom)).toBeNull();
  });
  it("inkluderet spor (amount_dkk 0, Morten ELLER Jonas): hører til introSession, ingen linje her", () => {
    const morten = afgoerBetaltSession(b({ advisor: "morten", amount_dkk: 0, status: "booked", calendly_event_uri: "https://api.calendly.com/scheduled_events/x" }), NU);
    expect(morten.tilstand).toBe("gratis_spor");
    expect(betaltSessionTekst(morten)).toBeNull();
    // Jonas' inkluderede (13/9): samme dom — den er IKKE købt, uanset advisor.
    const jonas = afgoerBetaltSession(b({ advisor: "jonas", amount_dkk: 0, status: "booked" }), NU);
    expect(jonas.tilstand).toBe("gratis_spor");
    expect(betaltSessionTekst(jonas)).toBeNull();
  });
  it("ukendt spor ('morten' med en pris — ingen kode skriver den): ingen linje", () => {
    const dom = afgoerBetaltSession(b({ advisor: "morten", amount_dkk: 500 }), NU);
    expect(dom.tilstand).toBe("ukendt");
    expect(betaltSessionTekst(dom)).toBeNull();
  });
  it("paid (skrives ikke i dag): betalt uden link", () => {
    expect(afgoerBetaltSession(b({ status: "paid" }), NU).tilstand).toBe("betalt_uden_link");
  });
  it("booked UDEN nogen tid: ordet alene beviser intet — link sendt, uanset URI", () => {
    const uri = "https://api.calendly.com/scheduled_events/abc";
    expect(afgoerBetaltSession(b({ status: "booked", calendly_event_uri: null }), NU).tilstand).toBe("betalt_link_sendt");
    expect(afgoerBetaltSession(b({ status: "booked", calendly_event_uri: uri }), NU).tilstand).toBe("betalt_link_sendt");
    expect(afgoerBetaltSession(b({ status: "booked", calendly_event_uri: uri, start_tid: "ikke en dato" }), NU).tilstand).toBe("betalt_link_sendt");
  });
  it("booked MED tid: tiden er beviset — URI'en er ligegyldig (håndsatte rækker har ingen)", () => {
    const uri = "https://api.calendly.com/scheduled_events/abc";
    const passeret = { status: "booked", start_tid: "2026-09-03T09:00:00Z", slut_tid: "2026-09-03T09:45:00Z" };
    expect(afgoerBetaltSession(b({ ...passeret, calendly_event_uri: null }), NU).tilstand).toBe("afholdt");
    expect(afgoerBetaltSession(b({ ...passeret, calendly_event_uri: uri }), NU).tilstand).toBe("afholdt");
    const forude = { status: "booked", start_tid: "2026-09-20T09:00:00Z", slut_tid: "2026-09-20T09:45:00Z" };
    expect(afgoerBetaltSession(b({ ...forude, calendly_event_uri: null }), NU).tilstand).toBe("booket");
    expect(afgoerBetaltSession(b({ ...forude, calendly_event_uri: uri }), NU).tilstand).toBe("booket");
  });
  it("grænsen er slut_tid når den findes: nu >= slut er afholdt (som introSession.erAfholdt), start passeret men slut forude er booket", () => {
    expect(afgoerBetaltSession(b({ status: "booked", start_tid: "2026-09-13T11:15:00Z", slut_tid: "2026-09-13T12:00:00Z" }), NU).tilstand).toBe("afholdt");
    expect(afgoerBetaltSession(b({ status: "booked", start_tid: "2026-09-13T11:20:00Z", slut_tid: "2026-09-13T12:05:00Z" }), NU).tilstand).toBe("booket");
    expect(afgoerBetaltSession(b({ status: "booked", start_tid: null, slut_tid: "2026-09-13T12:00:00Z" }), NU).tilstand).toBe("afholdt");
  });
  it("afholdt UDEN slut_tid: start_tid er grænsen — en session der er startet, er begyndt; ingen opfundet varighed", () => {
    expect(afgoerBetaltSession(b({ status: "booked", start_tid: "2026-09-13T12:00:00Z", slut_tid: null }), NU).tilstand).toBe("afholdt");
    expect(afgoerBetaltSession(b({ status: "booked", start_tid: "2026-09-13T12:00:01Z", slut_tid: null }), NU).tilstand).toBe("booket");
    expect(afgoerBetaltSession(b({ status: "booked", start_tid: "2026-06-25T07:45:00Z", slut_tid: null }), NU).tilstand).toBe("afholdt");
  });
  it("booked med tid men status-ordet mangler: tiden alene flytter ikke booking_sent til afholdt", () => {
    expect(afgoerBetaltSession(b({ status: "booking_sent", start_tid: "2026-06-25T07:45:00Z" }), NU).tilstand).toBe("betalt_link_sendt");
  });
  it("cancelled / refunded / ukendt / null", () => {
    expect(afgoerBetaltSession(b({ status: "cancelled" }), NU).tilstand).toBe("aflyst");
    expect(afgoerBetaltSession(b({ status: "refunded" }), NU).tilstand).toBe("refunderet");
    expect(afgoerBetaltSession(b({ status: "noget_nyt" }), NU).tilstand).toBe("ukendt");
    expect(afgoerBetaltSession(null, NU).tilstand).toBe("ukendt");
  });
  it("betalt-datoen er created_at — i alle betalte tilstande, og null når ikke betalt", () => {
    for (const status of ["paid", "booking_sent", "booked", "cancelled", "refunded"]) {
      expect(afgoerBetaltSession(b({ status }), NU).betalt?.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    }
    expect(afgoerBetaltSession(b({ status: "pending" }), NU).betalt).toBeNull();
    expect(afgoerBetaltSession(b({ created_at: "ikke en dato" }), NU).betalt).toBeNull();
  });
  it("updated_at påvirker IKKE dommen — triggeren flytter den ved enhver admin-rettelse (Rallysupport 13/9)", () => {
    // Prod 13/9: køb fra 23. juni, company_id rettet i SQL editoren 13/9 →
    // triggeren satte updated_at = 2026-09-13 18:13:36. Fladen sagde
    // «Betalt 13. september». Datoen skal være købets.
    const rally = b({ created_at: "2026-06-23T10:25:43Z", updated_at: "2026-09-13T18:13:36Z" });
    expect(afgoerBetaltSession(rally, NU).betalt?.toISOString()).toBe("2026-06-23T10:25:43.000Z");
    expect(betaltSessionTekst(afgoerBetaltSession(rally, NU))).toBe("Betalt 23. juni · booking-link sendt");
    // Samme dom uanset om updated_at er sat, null, mangler eller er ugyldig.
    const forventet = "2026-09-01T10:00:00.000Z";
    expect(afgoerBetaltSession(b({ updated_at: "2026-12-31T23:59:59Z" }), NU).betalt?.toISOString()).toBe(forventet);
    expect(afgoerBetaltSession(b({ updated_at: null }), NU).betalt?.toISOString()).toBe(forventet);
    expect(afgoerBetaltSession(b({ updated_at: undefined }), NU).betalt?.toISOString()).toBe(forventet);
    expect(afgoerBetaltSession(b({ updated_at: "ikke en dato" }), NU).betalt?.toISOString()).toBe(forventet);
  });
});

describe("ordene — dansk tid, siger kun det rækken ved", () => {
  it("booking_sent: «Betalt 1. september · booking-link sendt» — created_at, ikke updated_at (2/9)", () => {
    expect(betaltSessionTekst(afgoerBetaltSession(b(), NU))).toBe("Betalt 1. september · booking-link sendt");
  });
  it("paid: «Betalt … · booking-link ikke sendt»", () => {
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "paid" }), NU))).toBe("Betalt 1. september · booking-link ikke sendt");
  });
  it("booked med tid: begge datoer, pengene først — «Betalt … · afholdt …» / «Betalt … · booket til …»", () => {
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "booked", start_tid: "2026-09-03T09:00:00Z", slut_tid: "2026-09-03T09:45:00Z" }), NU))).toBe("Betalt 1. september · afholdt 3. september");
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "booked", start_tid: "2026-09-20T09:00:00Z", slut_tid: "2026-09-20T09:45:00Z" }), NU))).toBe("Betalt 1. september · booket til 20. september kl. 11.00");
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "booked", start_tid: null, slut_tid: "2026-09-03T09:45:00Z" }), NU))).toBe("Betalt 1. september · afholdt 3. september");
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "booked" }), NU))).toBe("Betalt 1. september · booking-link sendt");
  });
  it("Rallysupport (Calendly 13/9, dansk tid): «Betalt 23. juni · afholdt 25. juni» og «Betalt 30. juni · afholdt 1. juli»", () => {
    // Betaling 23/6 14:18 CEST → created_at 12:18:15Z; «Event started 25 June at 09:45 (CEST)» → 07:45Z.
    const et = b({ status: "booked", calendly_event_uri: null, created_at: "2026-06-23T12:18:15Z", updated_at: "2026-09-13T18:13:36Z", start_tid: "2026-06-25T07:45:00Z", slut_tid: null });
    expect(betaltSessionTekst(afgoerBetaltSession(et, NU))).toBe("Betalt 23. juni · afholdt 25. juni");
    // Betaling 30/6 12:25 CEST → 10:25:43Z; «Event started 1 July at 08:30 (CEST)» → 06:30Z.
    const to = b({ status: "booked", calendly_event_uri: null, created_at: "2026-06-30T10:25:43Z", updated_at: "2026-09-13T18:13:36Z", start_tid: "2026-07-01T06:30:00Z", slut_tid: null });
    expect(betaltSessionTekst(afgoerBetaltSession(to, NU))).toBe("Betalt 30. juni · afholdt 1. juli");
  });
  it("aflyst / refunderet", () => {
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "cancelled" }), NU))).toBe("Betalt · aflyst");
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "refunded" }), NU))).toBe("Betalt · refunderet");
  });
  it("ordet «afholdt» forekommer KUN for booked med en tid der er passeret", () => {
    const alle = ["pending", "paid", "booking_sent", "booked", "cancelled", "refunded"];
    const uri = "https://api.calendly.com/scheduled_events/abc";
    // Ingen tid — uanset URI og status.
    for (const status of alle) {
      expect(betaltSessionTekst(afgoerBetaltSession(b({ status, calendly_event_uri: uri }), NU)) ?? "").not.toMatch(/afholdt/i);
    }
    // Tid forude.
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "booked", start_tid: "2026-09-20T09:00:00Z" }), NU)) ?? "").not.toMatch(/afholdt/i);
    // Tid passeret, men status er ikke booked.
    for (const status of alle.filter((x) => x !== "booked")) {
      expect(betaltSessionTekst(afgoerBetaltSession(b({ status, start_tid: "2026-01-05T09:00:00Z", slut_tid: "2026-01-05T09:45:00Z" }), NU)) ?? "").not.toMatch(/afholdt/i);
    }
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "booked", start_tid: "2026-01-05T09:00:00Z" }), NU))).toMatch(/afholdt/);
  });
});

// ── De tre spor (13/9, recon-de-tre-sessioner.md F10) ──────────────────────
//
// «jonas + 0» faldt før mellem to stole: amount 0 blev sendt til «gratis_spor»
// (læst som Mortens) og virksomhedssiden tog kun advisor 'morten' som den
// inkluderede linje. Sporet dømmes nu ét sted, og fladen fordeler efter det.

describe("afgoerSessionSpor — de tre spor kan skelnes", () => {
  it("Morten inkluderet: advisor 'morten' + amount_dkk 0", () => {
    expect(afgoerSessionSpor({ advisor: "morten", amount_dkk: 0 })).toBe("morten_inkluderet");
  });
  it("Jonas inkluderet: advisor 'jonas' + amount_dkk 0 — det spor der ikke fandtes før 13/9", () => {
    expect(afgoerSessionSpor({ advisor: "jonas", amount_dkk: 0 })).toBe("jonas_inkluderet");
  });
  it("Jonas købt: advisor 'jonas' + amount_dkk > 0", () => {
    expect(afgoerSessionSpor({ advisor: "jonas", amount_dkk: 500 })).toBe("jonas_koebt");
    expect(afgoerSessionSpor({ advisor: "jonas", amount_dkk: 1 })).toBe("jonas_koebt");
  });
  it("de tre spor er parvis forskellige — ingen række kan lande på to", () => {
    const spor = [
      afgoerSessionSpor({ advisor: "morten", amount_dkk: 0 }),
      afgoerSessionSpor({ advisor: "jonas", amount_dkk: 0 }),
      afgoerSessionSpor({ advisor: "jonas", amount_dkk: 500 }),
    ];
    expect(new Set(spor).size).toBe(3);
  });
  it("ukendt: 'morten' med pris, ukendt advisor, negativ/ugyldig pris, null", () => {
    expect(afgoerSessionSpor({ advisor: "morten", amount_dkk: 500 })).toBe("ukendt");
    expect(afgoerSessionSpor({ advisor: "Jonas", amount_dkk: 0 })).toBe("ukendt");
    expect(afgoerSessionSpor({ advisor: "", amount_dkk: 0 })).toBe("ukendt");
    expect(afgoerSessionSpor(null)).toBe("ukendt");
    expect(afgoerSessionSpor(undefined)).toBe("ukendt");
    // Ikke-positiv pris er «inkluderet» — NaN/negativ ender ikke som købt.
    expect(afgoerSessionSpor({ advisor: "jonas", amount_dkk: -1 })).toBe("jonas_inkluderet");
    expect(afgoerSessionSpor({ advisor: "jonas", amount_dkk: Number.NaN })).toBe("jonas_inkluderet");
  });
  it("betalt-dommen følger sporet: kun jonas_koebt får en betalt-tilstand", () => {
    expect(afgoerBetaltSession(b({ advisor: "jonas", amount_dkk: 500 }), NU).tilstand).toBe("betalt_link_sendt");
    expect(afgoerBetaltSession(b({ advisor: "jonas", amount_dkk: 0 }), NU).tilstand).toBe("gratis_spor");
    expect(afgoerBetaltSession(b({ advisor: "morten", amount_dkk: 0 }), NU).tilstand).toBe("gratis_spor");
    expect(afgoerBetaltSession(b({ advisor: "morten", amount_dkk: 500 }), NU).tilstand).toBe("ukendt");
  });
});
