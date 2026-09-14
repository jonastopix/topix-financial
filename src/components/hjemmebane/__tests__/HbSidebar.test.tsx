/**
 * HbSidebar — podcasten på Spotify (15/9, beslutning 17: podcasten ud af
 * platformen). Låser: linket findes kun når skallen giver `spotifyLink`
 * (medlemmer og abonnenter — rådgiveren får det ikke), det er et eksternt
 * link i ny fane med noopener, og det er IKKE et menupunkt (står uden for
 * <nav>). Adressen er den rene show-URL uden Spotifys «?si=»-sporingsmærke
 * (Jonas 14/9) og bor ét sted: lib/hjemmebane/podcastSpotify.ts.
 *
 * Rendres i en MemoryRouter fordi menupunkterne er Links.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HbSidebar, HbSidebarDrawer } from "../HbSidebar";
import { PODCAST_SPOTIFY_TEKST, PODCAST_SPOTIFY_URL } from "@/lib/hjemmebane/podcastSpotify";

afterEach(cleanup);

const nav = [{ label: "Akademiet", to: "/akademiet" }];
const spotifyLink = { href: PODCAST_SPOTIFY_URL, tekst: PODCAST_SPOTIFY_TEKST };

describe("adressen — én konstant, ét sted", () => {
  it("er showets rene URL på open.spotify.com uden ?si= eller anden query", () => {
    expect(PODCAST_SPOTIFY_URL).toMatch(/^https:\/\/open\.spotify\.com\/show\/[A-Za-z0-9]+$/);
    expect(PODCAST_SPOTIFY_URL).not.toContain("?");
  });
  it("teksten er beslutning 17's ordlyd", () => {
    expect(PODCAST_SPOTIFY_TEKST).toBe("Lyt til Iværksætterlivet på Spotify");
  });
});

describe("HbSidebar — Spotify-linket nederst", () => {
  it("med spotifyLink: ét eksternt link i ny fane, uden for menuen", () => {
    render(
      <MemoryRouter>
        <HbSidebar nav={nav} spotifyLink={spotifyLink} />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: PODCAST_SPOTIFY_TEKST });
    expect(link).toHaveAttribute("href", PODCAST_SPOTIFY_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.closest("nav")).toBeNull();
    expect(screen.getAllByRole("link", { name: /spotify/i })).toHaveLength(1);
  });
  it("uden spotifyLink (rådgiveren, previewen): intet link — og intet menupunkt hedder Podcast", () => {
    render(
      <MemoryRouter>
        <HbSidebar nav={nav} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: /spotify/i })).toBeNull();
    expect(screen.queryByText(/podcast/i)).toBeNull();
  });
  it("draweren (mobil) tegner det samme link", () => {
    render(
      <MemoryRouter>
        <HbSidebarDrawer open onClose={() => {}} nav={nav} spotifyLink={spotifyLink} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: PODCAST_SPOTIFY_TEKST })).toHaveAttribute("href", PODCAST_SPOTIFY_URL);
  });
});
