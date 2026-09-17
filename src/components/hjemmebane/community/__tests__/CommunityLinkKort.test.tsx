/**
 * Link-kortene i Community (17/9) — komponenten og dens plads i
 * CommunityDokument.
 *
 * Låser: intet iframe før klik (cover + play-knap), og efter klik PRÆCIS
 * youtube-nocookie.com/embed/{id}?autoplay=1 hhv.
 * open.spotify.com/embed/{episode|show}/{id}; titel fra oEmbed og
 * fald-tilbage uden oEmbed; interne kort læser lektion/event/opslag og
 * linker til /akademiet/…, /events/…, /community/…; «ingen række» → intet
 * kort; og at CommunityDokument sætter kortet under afsnittet med linket
 * mens linkteksten består, og renderer #opslaghenvisning som link.
 *
 * linkKortApi, akademiApi og communityApi er mocket — ingen netværk.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  hentOembed: vi.fn(),
  hentLektionKort: vi.fn(),
  getEvent: vi.fn(),
  hentTraad: vi.fn(),
}));
vi.mock("@/lib/hjemmebane/linkKortApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/hjemmebane/linkKortApi")>();
  return { ...original, hentOembed: api.hentOembed, hentLektionKort: api.hentLektionKort };
});
vi.mock("@/lib/hjemmebane/akademiApi", () => ({ getEvent: api.getEvent }));
vi.mock("@/lib/hjemmebane/communityApi", () => ({
  hentTraad: api.hentTraad,
  hentBilledUrl: vi.fn(),
  hentFilUrl: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { CommunityLinkKortListe } from "../CommunityLinkKort";
import { CommunityDokument } from "../CommunityDokument";
import type { LinkKort } from "@/lib/hjemmebane/linkKort";

const YT = "ITqxuMt5ogQ";
const EP = "03bBvemTcU8SQkP22NYXGC";
const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

const vis = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  api.hentOembed.mockReset();
  api.hentLektionKort.mockReset();
  api.getEvent.mockReset();
  api.hentTraad.mockReset();
});
afterEach(cleanup);

describe("YouTube-kortet", () => {
  const kort: LinkKort = { art: "youtube", noegle: `youtube:${YT}`, videoId: YT };

  it("titel fra oEmbed, cover fra oEmbed, ingen iframe før klik — og PRÆCIS nocookie-adressen efter", async () => {
    api.hentOembed.mockResolvedValue({
      titel: "PengePulsen: Her er de bedste råd til nye iværksættere",
      thumbnailUrl: `https://i.ytimg.com/vi/${YT}/hqdefault.jpg`,
    });
    const { container } = vis(<CommunityLinkKortListe kort={[kort]} />);
    expect(await screen.findByText("PengePulsen: Her er de bedste råd til nye iværksættere")).toBeInTheDocument();
    expect(screen.getByText("YouTube")).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
    const knap = screen.getByRole("button", { name: /Afspil PengePulsen/ });
    expect(container.querySelector("img")).toHaveAttribute("src", `https://i.ytimg.com/vi/${YT}/hqdefault.jpg`);

    fireEvent.click(knap);
    const iframe = container.querySelector("iframe")!;
    expect(iframe).toHaveAttribute("src", `https://www.youtube-nocookie.com/embed/${YT}?autoplay=1`);
    expect(iframe).toHaveAttribute("allow", "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture");
    expect(iframe).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    expect(screen.queryByRole("button", { name: /Afspil/ })).toBeNull();

    const link = screen.getByRole("link", { name: /PengePulsen/ });
    expect(link).toHaveAttribute("href", `https://www.youtube.com/watch?v=${YT}`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
  });

  it("uden oEmbed (blokeret/fejlet): fald-tilbage-titel og i.ytimg-cover — kortet lever af id'et", async () => {
    api.hentOembed.mockResolvedValue({ titel: null, thumbnailUrl: null });
    const { container } = vis(<CommunityLinkKortListe kort={[kort]} />);
    expect(await screen.findByText("Video på YouTube")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("src", `https://i.ytimg.com/vi/${YT}/hqdefault.jpg`);
  });
});

describe("Spotify-kortet", () => {
  it("episode: titel fra oEmbed; klik → PRÆCIS open.spotify.com/embed/episode/{id}, 352 px", async () => {
    api.hentOembed.mockResolvedValue({
      titel: "Her er de bedste råd til nye iværksættere",
      thumbnailUrl: "https://image-cdn-fa.spotifycdn.com/image/abc",
    });
    const kort: LinkKort = { art: "spotify", noegle: `spotify:episode:${EP}`, slags: "episode", id: EP };
    const { container } = vis(<CommunityLinkKortListe kort={[kort]} />);
    expect(await screen.findByText("Her er de bedste råd til nye iværksættere")).toBeInTheDocument();
    expect(screen.getByText("Spotify")).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Afspil/ }));
    const iframe = container.querySelector("iframe")!;
    expect(iframe).toHaveAttribute("src", `https://open.spotify.com/embed/episode/${EP}`);
    expect(iframe).toHaveAttribute("height", "352");
    expect(screen.getByRole("link", { name: /bedste råd/ })).toHaveAttribute(
      "href",
      `https://open.spotify.com/episode/${EP}`,
    );
  });

  it("show uden oEmbed: «Podcast på Spotify», klik → /embed/show/{id}", async () => {
    api.hentOembed.mockResolvedValue({ titel: null, thumbnailUrl: null });
    const kort: LinkKort = { art: "spotify", noegle: "spotify:show:4T8krtMFTkRgF21bkNsQ6Q", slags: "show", id: "4T8krtMFTkRgF21bkNsQ6Q" };
    const { container } = vis(<CommunityLinkKortListe kort={[kort]} />);
    expect(await screen.findByText("Podcast på Spotify")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Afspil/ }));
    expect(container.querySelector("iframe")).toHaveAttribute(
      "src",
      "https://open.spotify.com/embed/show/4T8krtMFTkRgF21bkNsQ6Q",
    );
  });
});

describe("interne kort — læst med medlemmets egen adgang", () => {
  it("lektion: eyebrow «Lektion · Kursus», titel, varighed, link til /akademiet/{area}/{slug}", async () => {
    api.hentLektionKort.mockResolvedValue({
      id: "i1",
      area: "academy",
      slug: "budget",
      title: "Budgettet",
      description: null,
      durationSeconds: 600,
      publishedAt: null,
      coverUrl: "https://signed/c.jpg",
    });
    const kort: LinkKort = { art: "lektion", noegle: "lektion:academy:budget", area: "academy", slug: "budget" };
    const { container } = vis(<CommunityLinkKortListe kort={[kort]} />);
    expect(await screen.findByText("Budgettet")).toBeInTheDocument();
    expect(screen.getByText("Lektion · Kursus")).toBeInTheDocument();
    expect(screen.getByText("10 min")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/akademiet/academy/budget");
    expect(container.querySelector("img")).toHaveAttribute("src", "https://signed/c.jpg");
    expect(api.hentLektionKort).toHaveBeenCalledWith("academy", "budget");
  });

  it("lektion uden række (RLS/ikke fundet) → intet kort, ingen fejl", async () => {
    api.hentLektionKort.mockResolvedValue(null);
    const kort: LinkKort = { art: "lektion", noegle: "lektion:academy:x", area: "academy", slug: "x" };
    const { container } = vis(<CommunityLinkKortListe kort={[kort]} />);
    await waitFor(() => expect(api.hentLektionKort).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("[aria-hidden]")).toBeNull());
    expect(container.querySelector("a")).toBeNull();
  });

  it("event: «Event · dato», titel, link til /events/{id}; aflyst mærkes", async () => {
    api.getEvent.mockResolvedValue({
      id: UUID,
      title: "Vækstdag",
      starts_at: "2026-09-24T08:00:00Z",
      ends_at: null,
      status: "cancelled",
    });
    const kort: LinkKort = { art: "event", noegle: `event:${UUID}`, eventId: UUID };
    vis(<CommunityLinkKortListe kort={[kort]} />);
    expect(await screen.findByText("Vækstdag")).toBeInTheDocument();
    expect(screen.getByText(/^Event · /)).toBeInTheDocument();
    expect(screen.getByText(/Aflyst/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", `/events/${UUID}`);
    expect(api.getEvent).toHaveBeenCalledWith(UUID);
  });

  it("event der ikke må ses → intet kort", async () => {
    api.getEvent.mockResolvedValue(null);
    const kort: LinkKort = { art: "event", noegle: `event:${UUID}`, eventId: UUID };
    const { container } = vis(<CommunityLinkKortListe kort={[kort]} />);
    await waitFor(() => expect(api.getEvent).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("[aria-hidden]")).toBeNull());
    expect(container.querySelector("a")).toBeNull();
  });

  it("opslag: «Opslag · forfatter», titel, svar-tal, link til /community/{id}", async () => {
    api.hentTraad.mockResolvedValue({
      id: UUID,
      titel: "Hej, jeg er Mette",
      forfatter_navn: "Mette Hansen",
      forfatter_avatar_url: null,
      antal_svar: 3,
      created_at: "2026-09-12T10:00:00Z",
    });
    const kort: LinkKort = { art: "opslag", noegle: `opslag:${UUID}`, traadId: UUID };
    vis(<CommunityLinkKortListe kort={[kort]} />);
    expect(await screen.findByText("Hej, jeg er Mette")).toBeInTheDocument();
    expect(screen.getByText("Opslag · Mette Hansen")).toBeInTheDocument();
    expect(screen.getByText(/3 svar/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", `/community/${UUID}`);
    expect(api.hentTraad).toHaveBeenCalledWith(UUID);
  });

  it("tom liste → intet i DOM'en", () => {
    const { container } = vis(<CommunityLinkKortListe kort={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("CommunityDokument — kortet under afsnittet, linkteksten består", () => {
  it("et afsnit med et YouTube-link: teksten og linket står, og YouTube-kortet står under", async () => {
    api.hentOembed.mockResolvedValue({ titel: "Nordea-podcasten", thumbnailUrl: null });
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Se " },
            { type: "text", text: "videoen", marks: [{ type: "link", attrs: { href: `https://youtu.be/${YT}?si=x` } }] },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "Uden links." }] },
      ],
    };
    const { container } = vis(<CommunityDokument doc={doc} />);
    expect(await screen.findByText("Nordea-podcasten")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "videoen" })).toHaveAttribute("href", `https://youtu.be/${YT}?si=x`);
    // Rækkefølgen: afsnit 1 → kort → afsnit 2.
    const boern = Array.from(container.firstElementChild!.children);
    expect(boern[0].tagName).toBe("P");
    expect(boern[1].textContent).toContain("YouTube");
    expect(boern[2].tagName).toBe("P");
    expect(boern[2].textContent).toBe("Uden links.");
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("et almindeligt link (nordea.dk) giver intet kort", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nordea", marks: [{ type: "link", attrs: { href: "https://www.nordea.dk/x" } }] }],
        },
      ],
    };
    const { container } = vis(<CommunityDokument doc={doc} />);
    expect(container.firstElementChild!.children).toHaveLength(1);
    expect(api.hentOembed).not.toHaveBeenCalled();
  });

  it("#opslaghenvisning renderes som rust-link til /community/{id} — og giver et opslag-kort", async () => {
    api.hentTraad.mockResolvedValue({
      id: UUID,
      titel: "Den anden tråd",
      forfatter_navn: "Bo",
      forfatter_avatar_url: null,
      antal_svar: 0,
      created_at: "2026-09-12T10:00:00Z",
    });
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Se " },
            { type: "opslaghenvisning", attrs: { traadId: UUID, titel: "Den anden tråd" } },
          ],
        },
      ],
    };
    vis(<CommunityDokument doc={doc} />);
    const inline = screen.getByRole("link", { name: "#Den anden tråd" });
    expect(inline).toHaveAttribute("href", `/community/${UUID}`);
    expect(inline.className).toContain("text-hb-rust");
    expect(await screen.findByText("Opslag · Bo")).toBeInTheDocument();
  });
});
