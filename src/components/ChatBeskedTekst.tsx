import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import DOMPurify from "dompurify";
import { henvisningsAdresse, parseChatDokument, type ChatNode } from "@/lib/chatDokument";

/** Boblens tekst i begge chatpaner (29/9-2026, «#» i chatten, trin 3).

    Har beskeden et gyldigt dokument (indhold_json → parseChatDokument giver
    noder), tegnes TRÆET som React-elementer: #-henvisningerne er klikbare
    mærker, der navigerer internt med react-router (<Link>), og alt andet er
    det, motoren har hvidlistet. Dokumentet går ALDRIG gennem
    dangerouslySetInnerHTML.

    Ellers — alle gamle beskeder, alle andre skrivere, og en besked hvis
    dokument ikke overlever hvidlisten — tegnes content PRÆCIS som før:
    samme element, samme klasser, samme DOMPurify-liste. */

const TILLADTE_TAGS = ["b", "strong", "i", "em", "ul", "ol", "li", "a", "p", "br"];
const TILLADTE_ATTR = ["href", "target", "rel"];

function renderTekst(node: Extract<ChatNode, { type: "text" }>): ReactNode {
  let element: ReactNode = node.text;
  for (const mark of node.marks) {
    if (mark.type === "bold") element = <strong>{element}</strong>;
    else if (mark.type === "italic") element = <em>{element}</em>;
  }
  const link = node.marks.find((m) => m.type === "link");
  if (link !== undefined && link.type === "link") {
    // Samme rel/target som sendefeltets Link-udvidelse (ChatRichInput) + nofollow
    // som Community: linket er skrevet af en bruger, ikke af os.
    element = (
      <a href={link.href} target="_blank" rel="noopener noreferrer nofollow">
        {element}
      </a>
    );
  }
  return element;
}

function renderNode(node: ChatNode, key: number): ReactNode {
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{renderIndhold(node.content as ChatNode[])}</p>;
    case "bulletList":
      return <ul key={key}>{renderIndhold(node.content as ChatNode[])}</ul>;
    case "orderedList":
      return <ol key={key}>{renderIndhold(node.content as ChatNode[])}</ol>;
    case "listItem":
      return <li key={key}>{renderIndhold(node.content as ChatNode[])}</li>;
    case "hardBreak":
      return <br key={key} />;
    case "text":
      return <Fragment key={key}>{renderTekst(node)}</Fragment>;
    case "henvisning":
    case "eventhenvisning":
    case "opslaghenvisning":
    case "rabathenvisning":
      // Mærket: rust som Community's #-henvisninger. Adressen er
      // henvisningsAdresse (aftalen: rabataftaleAdresse) — ruterne gater selv.
      return (
        <Link
          key={key}
          to={henvisningsAdresse(node)}
          data-henvisning={node.type}
          className="font-medium text-hb-rust"
        >
          #{node.titel}
        </Link>
      );
  }
}

function renderIndhold(noder: ChatNode[]): ReactNode[] {
  return noder.map((node, index) => renderNode(node, index));
}

export function ChatBeskedTekst({ content, dokument }: { content: string; dokument?: unknown }) {
  const noder = dokument == null ? [] : parseChatDokument(dokument);
  if (noder.length > 0) {
    return <div className="text-sm leading-relaxed chat-html-content">{renderIndhold(noder)}</div>;
  }
  return (
    <div
      className="text-sm leading-relaxed chat-html-content"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content, { ALLOWED_TAGS: TILLADTE_TAGS, ALLOWED_ATTR: TILLADTE_ATTR }) }}
    />
  );
}
