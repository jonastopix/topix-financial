import { describe, expect, it } from "vitest";
import {
  pushMedie,
  rensSpotifyEpisodeUrl,
  spotifyEmbedUrl,
  spotifyEpisodeId,
  spotifyEpisodeIdAf,
  youtubeIdAf,
  youtubeNocookieEmbedUrl,
  youtubeThumbnailUrl,
} from "../pushMedie";

/* PR A «video i nyheden» (17/9): Jonas' eksempler er Nordea-episoden —
   YouTube https://youtu.be/ITqxuMt5ogQ og Spotify
   https://open.spotify.com/episode/03bBvemTcU8SQkP22NYXGC. */

const YT = "ITqxuMt5ogQ";
const SP = "03bBvemTcU8SQkP22NYXGC";

describe("youtubeIdAf — kun media_provider 'external' + en YouTube-URL", () => {
  it.each([
    [`https://youtu.be/${YT}`],
    [`https://youtu.be/${YT}?si=abc123XYZ`],
    [`https://www.youtube.com/watch?v=${YT}`],
    [`https://www.youtube.com/watch?v=${YT}&t=42s`],
    [`https://www.youtube-nocookie.com/embed/${YT}`],
    [`https://m.youtube.com/watch?v=${YT}`],
  ])("%s → id", (url) => {
    expect(youtubeIdAf({ media_provider: "external", external_url: url })).toBe(YT);
  });
  it.each([
    ["https://vimeo.com/123456789"],
    ["https://open.spotify.com/episode/" + SP],
    ["http://youtu.be/" + YT],
    ["https://youtu.be/forkort"],
    ["ikke en url"],
    [""],
    [null],
  ])("%s → null", (url) => {
    expect(youtubeIdAf({ media_provider: "external", external_url: url })).toBeNull();
  });
  it("kilden afgør: 'none'/'bunny'/'storage' giver null selv med en YouTube-URL", () => {
    for (const p of ["none", "bunny", "storage", null]) {
      expect(youtubeIdAf({ media_provider: p, external_url: `https://youtu.be/${YT}` })).toBeNull();
    }
  });
});

describe("spotifyEpisodeId — kun https://open.spotify.com/episode/<id>", () => {
  it.each([
    [`https://open.spotify.com/episode/${SP}`],
    [`https://open.spotify.com/episode/${SP}?si=1a2b3c4d5e`],
    [`https://open.spotify.com/episode/${SP}/`],
    [`  https://open.spotify.com/episode/${SP}?si=x&utm_source=oembed  `],
  ])("%s → id", (url) => {
    expect(spotifyEpisodeId(url)).toBe(SP);
    expect(rensSpotifyEpisodeUrl(url)).toBe(`https://open.spotify.com/episode/${SP}`);
  });
  it.each([
    [`https://open.spotify.com/show/${SP}`],
    [`https://open.spotify.com/track/${SP}`],
    [`https://open.spotify.com/playlist/${SP}`],
    [`https://open.spotify.com/embed/episode/${SP}`],
    [`spotify:episode:${SP}`],
    [`http://open.spotify.com/episode/${SP}`],
    [`https://spotify.com/episode/${SP}`],
    [`https://open.spotify.com/episode/forkort`],
    [`https://open.spotify.com/episode/${SP}/video`],
    ["https://youtu.be/" + YT],
    ["ikke en url"],
    [""],
    [null],
    [undefined],
  ])("%s → null", (url) => {
    expect(spotifyEpisodeId(url as string | null | undefined)).toBeNull();
    expect(rensSpotifyEpisodeUrl(url as string | null | undefined)).toBeNull();
  });
});

describe("spotifyEpisodeIdAf — metadata.spotify_url, tåler fejlformet metadata", () => {
  it("læser id'et fra metadata", () => {
    expect(spotifyEpisodeIdAf({ metadata: { spotify_url: `https://open.spotify.com/episode/${SP}?si=x` } })).toBe(SP);
  });
  it.each([[null], [undefined], ["streng"], [[1, 2]], [{}], [{ spotify_url: 42 }], [{ spotify_url: `https://open.spotify.com/show/${SP}` }]])(
    "metadata %j → null",
    (meta) => {
      expect(spotifyEpisodeIdAf({ metadata: meta })).toBeNull();
    },
  );
});

describe("pushMedie — samlet, og URL-formerne", () => {
  it("Nordea-episoden: begge id'er", () => {
    expect(
      pushMedie({ media_provider: "external", external_url: `https://youtu.be/${YT}`, metadata: { spotify_url: `https://open.spotify.com/episode/${SP}` } }),
    ).toEqual({ youtubeId: YT, spotifyEpisodeId: SP });
  });
  it("pushet uden medie: begge null", () => {
    expect(pushMedie({ media_provider: "none", external_url: null, metadata: { author: "Morten" } })).toEqual({ youtubeId: null, spotifyEpisodeId: null });
  });
  it("URL-formerne: nocookie m. autoplay=1, hqdefault-thumbnail, episode-embed", () => {
    expect(youtubeNocookieEmbedUrl(YT)).toBe(`https://www.youtube-nocookie.com/embed/${YT}?autoplay=1`);
    expect(youtubeThumbnailUrl(YT)).toBe(`https://i.ytimg.com/vi/${YT}/hqdefault.jpg`);
    expect(spotifyEmbedUrl(SP)).toBe(`https://open.spotify.com/embed/episode/${SP}`);
  });
});
