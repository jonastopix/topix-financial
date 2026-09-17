/**
 * linkKortApi — hentningen bag link-kortene (17/9).
 *
 * Låser: oEmbed-adressen bygges af id'et alene mod de to faste hosts;
 * hentOembed kaster ALDRIG (ikke-ok, netværksfejl, ugyldigt JSON → tomt
 * svar), sender en AbortSignal og Accept: application/json; thumbnails fra
 * andre hosts end udbydernes CDN'er kasseres; titlen renses. Og at
 * hentLektionKort læser content_items med status=published, signerer
 * cover_path og falder tilbage til Bunnys thumbnail — og giver null uden
 * række (RLS sagde nej eller slug findes ikke).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => {
  const kaede = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  kaede.select.mockReturnValue(kaede);
  kaede.eq.mockReturnValue(kaede);
  return { kaede, from: vi.fn(() => kaede) };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: supabaseMock.from } }));
const preview = vi.hoisted(() => ({ getAssetPreviewUrl: vi.fn() }));
vi.mock("@/lib/hjemmebane/adminContentApi", () => ({ getAssetPreviewUrl: preview.getAssetPreviewUrl }));

import { hentLektionKort, hentOembed, OEMBED_TIMEOUT_MS, oembedUrl } from "../linkKortApi";
import type { LinkKort } from "../linkKort";

const YT: Extract<LinkKort, { art: "youtube" }> = { art: "youtube", noegle: "youtube:ITqxuMt5ogQ", videoId: "ITqxuMt5ogQ" };
const EP: Extract<LinkKort, { art: "spotify" }> = {
  art: "spotify",
  noegle: "spotify:episode:03bBvemTcU8SQkP22NYXGC",
  slags: "episode",
  id: "03bBvemTcU8SQkP22NYXGC",
};

const svar = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

describe("oembedUrl — faste hosts, kun id'et sendes", () => {
  it("YouTube", () => {
    expect(oembedUrl(YT)).toBe(
      "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DITqxuMt5ogQ&format=json",
    );
  });
  it("Spotify-episode", () => {
    expect(oembedUrl(EP)).toBe(
      "https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Fepisode%2F03bBvemTcU8SQkP22NYXGC",
    );
  });
  it("Spotify-show", () => {
    expect(oembedUrl({ ...EP, slags: "show", noegle: "spotify:show:x" })).toBe(
      "https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Fshow%2F03bBvemTcU8SQkP22NYXGC",
    );
  });
  it("timeout er 5 sekunder", () => {
    expect(OEMBED_TIMEOUT_MS).toBe(5000);
  });
});

describe("hentOembed — YouTubes faktiske svar (målt 17/9)", () => {
  it("title og thumbnail_url (i.ytimg.com) → titel og thumbnailUrl", async () => {
    const fetchFn = vi.fn(async () =>
      svar({
        title: "PengePulsen: Her er de bedste råd til nye iværksættere",
        thumbnail_url: "https://i.ytimg.com/vi/ITqxuMt5ogQ/hqdefault.jpg",
        html: "<iframe …></iframe>",
      }),
    );
    await expect(hentOembed(YT, fetchFn)).resolves.toEqual({
      titel: "PengePulsen: Her er de bedste råd til nye iværksættere",
      thumbnailUrl: "https://i.ytimg.com/vi/ITqxuMt5ogQ/hqdefault.jpg",
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(oembedUrl(YT));
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toEqual({ Accept: "application/json" });
  });

  it("Spotifys thumbnail-host (image-cdn-fa.spotifycdn.com) slipper igennem", async () => {
    const fetchFn = vi.fn(async () =>
      svar({
        title: "Her er de bedste råd til nye iværksættere",
        thumbnail_url: "https://image-cdn-fa.spotifycdn.com/image/ab6772ab000015be7feb418824a5db5cc9ecaf52",
      }),
    );
    const data = await hentOembed(EP, fetchFn);
    expect(data.thumbnailUrl).toBe(
      "https://image-cdn-fa.spotifycdn.com/image/ab6772ab000015be7feb418824a5db5cc9ecaf52",
    );
  });

  it.each([
    ["fremmed host", "https://evil.example/x.jpg"],
    ["http", "http://i.ytimg.com/vi/x/hqdefault.jpg"],
    ["ikke en url", "hqdefault.jpg"],
    ["tal", 42],
  ])("thumbnail_url %s → null (titlen består)", async (_navn, thumb) => {
    const fetchFn = vi.fn(async () => svar({ title: "T", thumbnail_url: thumb }));
    await expect(hentOembed(YT, fetchFn)).resolves.toEqual({ titel: "T", thumbnailUrl: null });
  });

  it("titlen renses: kontroltegn væk, 200 tegn, tom → null", async () => {
    const lang = "x".repeat(300);
    expect((await hentOembed(YT, vi.fn(async () => svar({ title: "\u0000Hej\u001F" })))).titel).toBe("Hej");
    expect((await hentOembed(YT, vi.fn(async () => svar({ title: lang })))).titel).toHaveLength(200);
    expect((await hentOembed(YT, vi.fn(async () => svar({ title: "   " })))).titel).toBeNull();
    expect((await hentOembed(YT, vi.fn(async () => svar({ title: 7 })))).titel).toBeNull();
  });

  it.each([
    ["ikke-ok svar", vi.fn(async () => svar({ title: "T" }, false))],
    ["netværksfejl", vi.fn(async () => { throw new TypeError("Failed to fetch"); })],
    ["afbrudt (AbortError)", vi.fn(async () => { throw new DOMException("aborted", "AbortError"); })],
    ["ugyldigt JSON", vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError("x"); } }) as unknown as Response)],
    ["JSON der ikke er et objekt", vi.fn(async () => svar("streng"))],
    ["JSON null", vi.fn(async () => svar(null))],
  ])("%s → { null, null } — kaster aldrig", async (_navn, fetchFn) => {
    await expect(hentOembed(YT, fetchFn as unknown as typeof fetch)).resolves.toEqual({ titel: null, thumbnailUrl: null });
  });
});

describe("hentLektionKort — medlemmets egen RLS, cover med fald-tilbage", () => {
  const raekke = {
    id: "i1",
    area: "academy",
    slug: "budget",
    title: "Budgettet",
    description: "Kort om budget",
    duration_seconds: 600,
    published_at: "2026-09-10T00:00:00Z",
    cover_path: null as string | null,
    media_provider: "none",
    bunny_video_id: null as string | null,
  };

  beforeEach(() => {
    supabaseMock.from.mockClear();
    supabaseMock.kaede.select.mockClear();
    supabaseMock.kaede.eq.mockClear();
    supabaseMock.kaede.maybeSingle.mockReset();
    preview.getAssetPreviewUrl.mockReset();
  });

  it("læser content_items med area, slug og status=published", async () => {
    supabaseMock.kaede.maybeSingle.mockResolvedValue({ data: raekke, error: null });
    const kort = await hentLektionKort("academy", "budget");
    expect(supabaseMock.from).toHaveBeenCalledWith("content_items");
    expect(supabaseMock.kaede.eq.mock.calls).toEqual([
      ["area", "academy"],
      ["slug", "budget"],
      ["status", "published"],
    ]);
    expect(kort).toEqual({
      id: "i1",
      area: "academy",
      slug: "budget",
      title: "Budgettet",
      description: "Kort om budget",
      durationSeconds: 600,
      publishedAt: "2026-09-10T00:00:00Z",
      coverUrl: null,
    });
  });

  it("cover_path → signeret URL fra content-assets", async () => {
    supabaseMock.kaede.maybeSingle.mockResolvedValue({ data: { ...raekke, cover_path: "covers/i1/c.jpg" }, error: null });
    preview.getAssetPreviewUrl.mockResolvedValue("https://signed/c.jpg");
    expect((await hentLektionKort("academy", "budget"))?.coverUrl).toBe("https://signed/c.jpg");
    expect(preview.getAssetPreviewUrl).toHaveBeenCalledWith("covers/i1/c.jpg");
  });

  it("signering fejler + Bunny-video → Bunnys auto-thumbnail; uden Bunny → null", async () => {
    supabaseMock.kaede.maybeSingle.mockResolvedValue({
      data: { ...raekke, cover_path: "covers/i1/c.jpg", media_provider: "bunny", bunny_video_id: "guid-1" },
      error: null,
    });
    preview.getAssetPreviewUrl.mockRejectedValue(new Error("nej"));
    expect((await hentLektionKort("academy", "budget"))?.coverUrl).toBe(
      "https://vz-00a6a87d-5cd.b-cdn.net/guid-1/thumbnail.jpg",
    );
    preview.getAssetPreviewUrl.mockRejectedValue(new Error("nej"));
    supabaseMock.kaede.maybeSingle.mockResolvedValue({ data: { ...raekke, cover_path: "covers/i1/c.jpg" }, error: null });
    expect((await hentLektionKort("academy", "budget"))?.coverUrl).toBeNull();
  });

  it("ingen række (RLS sagde nej eller slug findes ikke) → null; fejl → kaster", async () => {
    supabaseMock.kaede.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(hentLektionKort("academy", "findes-ikke")).resolves.toBeNull();
    supabaseMock.kaede.maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(hentLektionKort("academy", "budget")).rejects.toThrow("boom");
  });
});
