/**
 * htmlEscape — én escaper til al brugerskrevet tekst der lægges ind i
 * mail-HTML (opslagsmail 3/9). Før den fandtes kun en privat kopi i
 * indgangsMail.ts; send-notification-email lagde `title` og `body` ind
 * råt (index.ts:101-102, :502, :507), så en trådtitel eller en
 * broadcast-tekst med «<» nåede indbakken som markup.
 *
 * Ren funktion, ingen Deno — testet fra src/lib/__tests__/opslagsMail.test.ts.
 */

/** &, <, >, " og ' escapes. Linjeskift bevares som tegn (ingen <br>). */
export function escHtml(tekst: string | null | undefined): string {
  return String(tekst ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Som escHtml, men \n bliver til <br> — til brødtekst der må have afsnit. */
export function escHtmlMedLinjeskift(tekst: string | null | undefined): string {
  return escHtml(tekst).replace(/\r?\n/g, "<br>");
}
