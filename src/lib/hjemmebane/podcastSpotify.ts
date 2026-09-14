/**
 * src/lib/hjemmebane/podcastSpotify.ts
 *
 * Podcasten er UDE af platformen (Jonas 11/9, beslutning 17; bygget 15/9):
 * «podcasten ikke giver mening lige nu … linke ind til vores podcast på
 * Spotify et sted, hvor der er elegant … Det er for alle. Så det skal ikke
 * fylde så meget.» Showet er IVÆRKSÆTTERLIVET (Topix; værter Morten Larsen
 * og Jonas Herlev) — 18 episoder, nyeste 17/9 2025. Et nyt medlem skal ikke
 * finde et års gammelt indhold bag et menupunkt i sin første uge.
 *
 * ÉN konstant ÉT sted (Jonas 14/9), så adressen kan skiftes uden at lede.
 * Den rene show-URL uden «?si=» — det parameter er Spotifys sporingsmærke
 * fra en deling og hører ikke i koden. Verificeret 15/9: 200, <title>
 * «IVÆRKSÆTTERLIVET | Podcast on Spotify».
 *
 * Linket tegnes af HbSidebar (ét stille tekstlink nederst, over
 * profilblokken) og gives kun til medlemmer og abonnenter af
 * HbMemberShell — ikke rådgivere. Det er IKKE et menupunkt (hbNav.ts):
 * podcasten er ikke en flade i huset længere.
 */

export const PODCAST_SPOTIFY_URL = "https://open.spotify.com/show/4T8krtMFTkRgF21bkNsQ6Q";

/** Beslutning 17's ordlyd. Showets navn staves som på Spotify-siden. */
export const PODCAST_SPOTIFY_TEKST = "Lyt til Iværksætterlivet på Spotify";
