/** Bunny-mediehjælpere (delt — forsiden nu, Akademiet senere).
    Auto-thumbnailet er bevist tilgængeligt USIGNERET (2026-08-09):
    200 image/jpeg m. Referer fra app.theboardroom.dk, 403 uden
    (hotlink-beskyttelse i Bunny). Et <img> fra vores eget domæne
    sender referrer automatisk — ingen signering, ingen edge-funktion. */

/** Pull zone-hostnavnet er et OFFENTLIGT CDN-hostnavn (står i enhver
    afspillet video-URL) — ikke en hemmelighed. Adgangen styres af
    tilladte referrers i Bunny, ikke af at navnet er skjult. */
export const BUNNY_PULL_ZONE_HOST = "vz-00a6a87d-5cd.b-cdn.net";

/** Bunnys auto-genererede thumbnail for en Stream-video.
    Tomt/manglende id → null (kalderen beholder sin egen fallback). */
export function bunnyThumbnailUrl(videoId: string | null): string | null {
  const id = videoId?.trim();
  if (!id) return null;
  return `https://${BUNNY_PULL_ZONE_HOST}/${id}/thumbnail.jpg`;
}
