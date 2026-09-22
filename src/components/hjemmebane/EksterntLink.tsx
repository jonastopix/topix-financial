import { eksterntHref } from "@/lib/eksterntLink";

/**
 * En værdi, brugeren har skrevet, vist som link når — og kun når — den er en
 * http(s)-adresse (22/9-2026). Ellers står den som ren tekst.
 *
 * TEKSTEN ER BRUGERENS, HREF'EN ER VORES. «zanco-group.dk» vises præcis
 * sådan, men peger på «https://zanco-group.dk» — ellers ville <a> læse den
 * som en relativ sti og lande på app.theboardroom.dk/ansoegninger/zanco-group.dk.
 * Dommen om hvad der overhovedet må blive et href, bor i eksterntHref; her
 * tegnes kun. Et href må ALDRIG bygges af en rå værdi på kaldestedet —
 * kildeværnet src/lib/__tests__/eksterntLink.guard.test.ts fælder det.
 *
 * target="_blank" med rel="noopener noreferrer": en fremmed side må hverken
 * få fat i vores `window.opener` eller se, hvilken side brugeren kom fra.
 */
export const EksterntLink = ({ vaerdi }: { vaerdi: string }) => {
  const href = eksterntHref(vaerdi);
  if (href === null) return <>{vaerdi}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-hb-evergreen underline-offset-4 hover:underline"
      data-eksternt-link
    >
      {vaerdi}
    </a>
  );
};
