/** YouTube-id-udtræk som REN funktion (forside bølge 1, PR 3): bruges af
    "Denne uges video"-kortet til at afgøre om en ekstern URL kan afspilles
    inline mod youtube-nocookie.com. Genkendte former:
      https://www.youtube.com/watch?v=<id>   (+ øvrige query-params)
      https://youtu.be/<id>
      https://www.youtube.com/embed/<id>     (også youtube-nocookie)
    Alt andet (fremmede domæner, ugyldige id'er, ikke-https) → null —
    kortet falder da tilbage til "Åbn"-knappen i nyt vindue. */

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  const host = parsed.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return YT_ID.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parsed.pathname === "/watch") {
      const id = parsed.searchParams.get("v") ?? "";
      return YT_ID.test(id) ? id : null;
    }
    const embedMatch = parsed.pathname.match(/^\/embed\/([^/]+)/);
    if (embedMatch && YT_ID.test(embedMatch[1])) return embedMatch[1];
  }

  return null;
}
