/**
 * linkKort — dommen over hvilke links der bliver til kort (17/9, Jonas:
 * «forhåndsvisning af tingene i opslaget fremfor bare link», valg A: KUN
 * YouTube, Spotify og platformens eget indhold).
 *
 * Låser: de fem arter og deres id-udtræk (inkl. ?si=-sporingsmærker og
 * Spotifys /intl-xx/-præfiks); at ALT andet giver null — fremmede
 * domæner, http, tracks/albums, spotify.link-kortlinks, ugyldige id'er,
 * platform-stier uden for hvidlisten; og at linkKortIDokument giver ét
 * kort pr. unik nøgle, placeret ved den topblok der bærer det første
 * link, og at #-noder giver samme kort som links.
 */
import { describe, expect, it } from "vitest";
import { linkKort, linkKortIDokument, PLATFORM_HOST } from "../linkKort";
import { parseCommunityDokument } from "../communityDokument";

const YT = "ITqxuMt5ogQ";
const EP = "03bBvemTcU8SQkP22NYXGC";
const SHOW = "4T8krtMFTkRgF21bkNsQ6Q";
const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("linkKort — YouTube (Jonas' eksempel 17/9)", () => {
  it.each([
    [`https://youtu.be/${YT}?si=Jwj5vxngk6RuYwxY`],
    [`https://youtu.be/${YT}`],
    [`https://www.youtube.com/watch?v=${YT}`],
    [`https://www.youtube.com/watch?v=${YT}&t=42s`],
    [`https://m.youtube.com/watch?v=${YT}`],
    [`https://www.youtube-nocookie.com/embed/${YT}`],
    [`  https://youtu.be/${YT}  `],
  ])("%s → youtube-kort", (url) => {
    expect(linkKort(url)).toEqual({ art: "youtube", noegle: `youtube:${YT}`, videoId: YT });
  });
});

describe("linkKort — Spotify (Jonas' eksempel 17/9)", () => {
  it("episode med ?si= → episode-kort uden sporingsmærket", () => {
    expect(linkKort(`https://open.spotify.com/episode/${EP}?si=VXDlfsOERO2st8stLs86kg`)).toEqual({
      art: "spotify",
      noegle: `spotify:episode:${EP}`,
      slags: "episode",
      id: EP,
    });
  });
  it("showet (podcastens adresse) → show-kort", () => {
    expect(linkKort(`https://open.spotify.com/show/${SHOW}`)).toEqual({
      art: "spotify",
      noegle: `spotify:show:${SHOW}`,
      slags: "show",
      id: SHOW,
    });
  });
  it("intl-da-præfikset ignoreres", () => {
    expect(linkKort(`https://open.spotify.com/intl-da/episode/${EP}`)?.art).toBe("spotify");
  });
  it.each([
    ["track", `https://open.spotify.com/track/${EP}`],
    ["album", `https://open.spotify.com/album/${EP}`],
    ["playlist", `https://open.spotify.com/playlist/${EP}`],
    ["for kort id", "https://open.spotify.com/episode/abc"],
    ["id med bindestreg", "https://open.spotify.com/episode/03bBvemTcU8SQkP22NYX-C"],
    ["kortlink (kræver hentning)", "https://spotify.link/abc123"],
    ["http", `http://open.spotify.com/episode/${EP}`],
    ["play.spotify.com", `https://play.spotify.com/episode/${EP}`],
  ])("%s → null", (_navn, url) => {
    expect(linkKort(url)).toBeNull();
  });
});

describe("linkKort — platformens eget indhold", () => {
  it("lektion /akademiet/{area}/{slug} (hvidlistet area) → lektion-kort", () => {
    expect(linkKort(`https://${PLATFORM_HOST}/akademiet/classroom/system-foer-superhelt`)).toEqual({
      art: "lektion",
      noegle: "lektion:classroom:system-foer-superhelt",
      area: "classroom",
      slug: "system-foer-superhelt",
    });
  });
  it("event /events/{uuid} → event-kort", () => {
    expect(linkKort(`https://${PLATFORM_HOST}/events/${UUID}`)).toEqual({
      art: "event",
      noegle: `event:${UUID}`,
      eventId: UUID,
    });
  });
  it("opslag /community/{uuid} → opslag-kort (uuid i store bogstaver: nøglen er lille)", () => {
    expect(linkKort(`https://${PLATFORM_HOST}/community/${UUID.toUpperCase()}`)).toEqual({
      art: "opslag",
      noegle: `opslag:${UUID}`,
      traadId: UUID.toUpperCase(),
    });
  });
  it.each([
    ["push er ikke et hvidlistet område", `https://${PLATFORM_HOST}/akademiet/push/ugens-push`],
    ["ugens_video er forsidens eget område", `https://${PLATFORM_HOST}/akademiet/ugens_video/x`],
    ["slug med store bogstaver", `https://${PLATFORM_HOST}/akademiet/classroom/System`],
    ["slug med punktum", `https://${PLATFORM_HOST}/akademiet/classroom/a.b`],
    ["akademiet uden slug", `https://${PLATFORM_HOST}/akademiet/classroom`],
    ["event uden uuid", `https://${PLATFORM_HOST}/events/123`],
    ["community-feedet", `https://${PLATFORM_HOST}/community`],
    ["medlemsprofil", `https://${PLATFORM_HOST}/medlemmer/${UUID}`],
    ["forsiden", `https://${PLATFORM_HOST}/`],
    ["http", `http://${PLATFORM_HOST}/events/${UUID}`],
    ["andet domæne, samme sti", `https://theboardroom.dk/events/${UUID}`],
    ["preview-domæne", `https://preview.app.theboardroom.dk/events/${UUID}`],
    ["localhost", `https://localhost:5173/events/${UUID}`],
  ])("%s → null", (_navn, url) => {
    expect(linkKort(url)).toBeNull();
  });
});

describe("linkKort — alt andet er et almindeligt link", () => {
  it.each([
    ["vilkårlig hjemmeside", "https://www.nordea.dk/erhverv"],
    ["vimeo", "https://vimeo.com/123456789"],
    ["mailto", "mailto:jonas@topix.dk"],
    ["javascript:", "javascript:alert(1)"],
    ["tom", ""],
    ["ikke en url", "bare tekst"],
  ])("%s → null", (_navn, url) => {
    expect(linkKort(url)).toBeNull();
  });
  it("null/undefined → null, kaster aldrig", () => {
    expect(linkKort(null)).toBeNull();
    expect(linkKort(undefined)).toBeNull();
  });
});

describe("linkKortIDokument — kort pr. topblok, unikke, #-noder tæller med", () => {
  const link = (text: string, href: string) => ({ type: "text", text, marks: [{ type: "link", attrs: { href } }] });
  const p = (...content: unknown[]) => ({ type: "paragraph", content });
  const doc = (...content: unknown[]) => parseCommunityDokument({ type: "doc", content });

  it("et afsnit med et YouTube-link → kortet står ved afsnit 0; afsnit uden links får tom liste", () => {
    const noder = doc(
      p({ type: "text", text: "Se " }, link("videoen", `https://youtu.be/${YT}`)),
      p({ type: "text", text: "Ingen links her." }),
    );
    expect(linkKortIDokument(noder)).toEqual([[{ art: "youtube", noegle: `youtube:${YT}`, videoId: YT }], []]);
  });

  it("samme link to gange (også i en senere blok) → ét kort, det første vinder", () => {
    const noder = doc(
      p(link("a", `https://youtu.be/${YT}`), link("b", `https://www.youtube.com/watch?v=${YT}`)),
      p(link("c", `https://youtu.be/${YT}?si=x`)),
    );
    const kort = linkKortIDokument(noder);
    expect(kort[0]).toHaveLength(1);
    expect(kort[1]).toEqual([]);
  });

  it("et link i en nestet liste hører til listen som topblok", () => {
    const noder = doc({
      type: "bulletList",
      content: [{ type: "listItem", content: [p(link("ep", `https://open.spotify.com/episode/${EP}`))] }],
    });
    expect(linkKortIDokument(noder)[0]).toEqual([
      { art: "spotify", noegle: `spotify:episode:${EP}`, slags: "episode", id: EP },
    ]);
  });

  it("#-noder giver samme kort som links: henvisning → lektion, eventhenvisning → event, opslaghenvisning → opslag", () => {
    const noder = doc(
      p(
        { type: "henvisning", attrs: { area: "academy", slug: "budget", titel: "Budget" } },
        { type: "eventhenvisning", attrs: { eventId: UUID, titel: "Vækstdag" } },
        { type: "opslaghenvisning", attrs: { traadId: UUID, titel: "Hej" } },
      ),
    );
    expect(linkKortIDokument(noder)[0]).toEqual([
      { art: "lektion", noegle: "lektion:academy:budget", area: "academy", slug: "budget" },
      { art: "event", noegle: `event:${UUID}`, eventId: UUID },
      { art: "opslag", noegle: `opslag:${UUID}`, traadId: UUID },
    ]);
  });

  it("en #-henvisning OG et link til samme lektion → ét kort", () => {
    const noder = doc(
      p(
        { type: "henvisning", attrs: { area: "academy", slug: "budget", titel: "Budget" } },
        link("læs", `https://${PLATFORM_HOST}/akademiet/academy/budget`),
      ),
    );
    expect(linkKortIDokument(noder)[0]).toHaveLength(1);
  });

  it("almindelige links (nordea.dk) giver intet kort", () => {
    const noder = doc(p(link("Nordea", "https://www.nordea.dk/erhverv")));
    expect(linkKortIDokument(noder)).toEqual([[]]);
  });

  it("tomt dokument → tom liste", () => {
    expect(linkKortIDokument([])).toEqual([]);
  });
});
