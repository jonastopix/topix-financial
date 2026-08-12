import { Fragment, type ReactNode } from "react";
import {
  parseCommunityDokument,
  type CommunityNode,
} from "@/lib/hjemmebane/communityDokument";

/** Visningen af et community-dokument (indhold_json fra community_traade).
    Motoren — parseCommunityDokument — har allerede hvidlistet nodetyper,
    placering, marks, links og billedkilder. Denne komponent træffer INGEN
    sikkerhedsbeslutninger: alt den modtager er færdighvidlistet, og dens
    eneste job er at oversætte træet til semantisk HTML i Hb-typografien.

    Ingen ydre bredde eller margen — komponenten skal kunne stå både i et
    feed-uddrag og på en trådside; containeren ejer layoutet. */

/** Tekstnodens marks lægges på indefra og ud: strong/em inderst, link
    yderst, så et fedt link bliver <a><strong>…</strong></a>. */
function renderTekst(node: Extract<CommunityNode, { type: "text" }>): ReactNode {
  let element: ReactNode = node.text;
  for (const mark of node.marks) {
    if (mark.type === "bold") {
      element = <strong className="font-semibold">{element}</strong>;
    } else if (mark.type === "italic") {
      element = <em>{element}</em>;
    }
  }
  const link = node.marks.find((mark) => mark.type === "link");
  if (link !== undefined) {
    /* target="_blank" + rel="noopener noreferrer nofollow" på ALLE links:
       noopener afskærer den åbnede side fra window.opener, og linket er
       skrevet af et medlem, ikke af os — det skal hverken kunne styre vores
       vindue, se hvor det kom fra eller låne sidens søge-autoritet. */
    element = (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="font-medium text-hb-evergreen underline underline-offset-2 transition-colors hover:text-hb-ink"
      >
        {element}
      </a>
    );
  }
  return element;
}

function renderNode(node: CommunityNode, key: number): ReactNode {
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{renderIndhold(node.content)}</p>;

    case "heading":
      /* Motoren tvinger level til 2, men på fladen er opslagets titel
         allerede dokumentets h2 — en overskrift INDE i opslaget hører derfor
         hjemme ét niveau under, som h3. */
      return (
        <h3 key={key} className="pt-2 font-editorial text-xl font-medium leading-tight text-hb-ink">
          {renderIndhold(node.content)}
        </h3>
      );

    case "bulletList":
      return (
        <ul key={key} className="list-disc space-y-2 pl-5 marker:text-hb-ink-soft">
          {renderIndhold(node.content)}
        </ul>
      );

    case "orderedList":
      return (
        <ol key={key} className="list-decimal space-y-2 pl-5 marker:text-hb-ink-soft">
          {renderIndhold(node.content)}
        </ol>
      );

    case "listItem":
      return (
        <li key={key} className="space-y-2 pl-1">
          {renderIndhold(node.content)}
        </li>
      );

    case "blockquote":
      /* Citat som redaktionelt greb: venstre hairline i hb-line og
         indrykning, teksten dæmpet i hb-ink-soft — ikke en grå kasse. */
      return (
        <blockquote key={key} className="space-y-3 border-l-2 border-hb-line pl-4 text-hb-ink-soft">
          {renderIndhold(node.content)}
        </blockquote>
      );

    case "hardBreak":
      return <br key={key} />;

    case "text":
      return <Fragment key={key}>{renderTekst(node)}</Fragment>;

    case "image":
      /* alt kommer fra noden — tom streng er gyldigt og korrekt for et
         dekorativt billede. max-w-full + h-auto: billedet må aldrig
         sprænge sin container. */
      return (
        <img
          key={key}
          src={node.src}
          alt={node.alt}
          loading="lazy"
          className="h-auto max-w-full rounded-hb border border-hb-line"
        />
      );
  }
}

function renderIndhold(noder: CommunityNode[]): ReactNode[] {
  return noder.map((node, index) => renderNode(node, index));
}

export function CommunityDokument({ doc }: { doc: unknown }) {
  const noder = parseCommunityDokument(doc);
  if (noder.length === 0) return null;

  /* Brødteksten arves fra wrapperen: Manrope (font-body), 15px, rummelig
     linjehøjde og luft mellem blokkene — samme snit som EventDetailViews
     beskrivelses-afsnit. */
  return (
    <div className="space-y-4 font-body text-[15px] leading-relaxed text-hb-ink">
      {renderIndhold(noder)}
    </div>
  );
}
