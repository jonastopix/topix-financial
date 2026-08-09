import { describe, expect, it } from "vitest";
import { parseDurationSeconds, parsePodcastFeed } from "../podcastRss";
import { PODCAST_FEED_FIXTURE } from "./podcastFeedFixture";

describe("parsePodcastFeed — felt-udtræk mod rigtig fixture", () => {
  const episodes = parsePodcastFeed(PODCAST_FEED_FIXTURE);

  it("finder alle tre items", () => {
    expect(episodes).toHaveLength(3);
  });

  it("item 1 (ordret fra feedet): alle felter udtrækkes inkl. CDATA-titel", () => {
    expect(episodes[0]).toEqual({
      guid: "77b961d7-c835-4151-820d-1cd388d92fa5",
      title: "Når livet rammer: Iværksætteri, sorg og nye begyndelser med Kasper Bisgaard",
      description: "<p>I denne samtale dykker vi ned i Kasper Bisgaards rejse fra skibums til iværksætter.</p>",
      link: "https://podcasters.spotify.com/pod/show/topixdk/episodes/Nr-livet-rammer-Ivrkstteri--sorg-og-nye-begyndelser-med-Kasper-Bisgaard-e38b63n",
      audioUrl: "https://anchor.fm/s/101a8bd38/podcast/play/108418615/episode1.mp3",
      durationSeconds: 47 * 60 + 10,
      imageUrl: "https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_episode/43128030/episode1.jpg",
      publishedAt: new Date("Wed, 17 Sep 2025 07:10:31 GMT").toISOString(),
      season: 2,
      episode: 2,
      episodeType: "full",
    });
  });

  it("item 2: MM:SS-varighed parses", () => {
    expect(episodes[1].durationSeconds).toBe(32 * 60 + 5);
  });

  it("item 3 (sparsomt): manglende felter → graceful null, audioUrl består", () => {
    expect(episodes[2]).toMatchObject({
      title: "Sparsomt afsnit uden metadata",
      guid: null,
      description: null,
      link: null,
      durationSeconds: null,
      imageUrl: null,
      publishedAt: null,
      audioUrl: "https://anchor.fm/s/101a8bd38/podcast/play/107000000/episode3.mp3",
      season: null,
      episode: null,
      episodeType: null,
    });
  });
});

describe("parsePodcastFeed — robusthed (kaster aldrig)", () => {
  it("ugyldig XML → tom liste", () => {
    expect(parsePodcastFeed("<rss><channel><item>")).toEqual([]);
    expect(parsePodcastFeed("ikke xml overhovedet")).toEqual([]);
    expect(parsePodcastFeed("")).toEqual([]);
  });

  it("gyldig XML uden items → tom liste", () => {
    expect(parsePodcastFeed('<?xml version="1.0"?><rss><channel></channel></rss>')).toEqual([]);
  });
});

describe("parseDurationSeconds", () => {
  it.each([
    ["00:47:10", 2830],
    ["1:02:03", 3723],
    ["47:10", 2830],
    ["32:05", 1925],
    ["90", 90],
  ])("%s → %d", (raw, expected) => {
    expect(parseDurationSeconds(raw)).toBe(expected);
  });

  it.each([["abc"], ["1:2:3:4"], ["12:"], [":30"], [""], [null], [undefined]])(
    "%s → null",
    (raw) => {
      expect(parseDurationSeconds(raw as string | null | undefined)).toBeNull();
    },
  );
});
