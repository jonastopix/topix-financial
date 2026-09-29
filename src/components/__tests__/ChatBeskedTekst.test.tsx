/**
 * ChatBeskedTekst — boblens tekst (29/9-2026, «#» i chatten, trin 3).
 * Et gyldigt dokument tegnes som træ med klikbare mærker (react-router); ellers
 * tegnes content PRÆCIS som panerne gjorde før (samme element, samme DOMPurify).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import DOMPurify from "dompurify";
import { ChatBeskedTekst } from "../ChatBeskedTekst";

const AFTALE = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const EVENT = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });

afterEach(cleanup);

const Sted = () => {
  const l = useLocation();
  return <output data-testid="sted">{`${l.pathname}${l.search}`}</output>;
};
const vis = (el: JSX.Element) =>
  render(
    <MemoryRouter initialEntries={["/chat"]}>
      <Routes>
        <Route path="*" element={<>{el}<Sted /></>} />
      </Routes>
    </MemoryRouter>,
  );

/** Boblens element FØR trin 3, ordret fra panerne. */
const Foer = ({ content }: { content: string }) => (
  <div className="text-sm leading-relaxed chat-html-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content, { ALLOWED_TAGS: ['b','strong','i','em','ul','ol','li','a','p','br'], ALLOWED_ATTR: ['href','target','rel'] }) }} />
);

describe("uden dokument — content præcis som før", () => {
  const indhold = [
    "Hej med dig",
    "<p><strong>fed</strong> og <em>kursiv</em></p><ul><li><p>punkt</p></li></ul>",
    '<p><a href="https://topix.dk" target="_blank" rel="noopener noreferrer">link</a></p>',
    '<p>Hej</p><img src=x onerror="alert(1)"><script>alert(2)</script>',
    "a &lt; b",
    "🎥 Video",
  ];
  for (const content of indhold) {
    for (const dokument of [undefined, null, "tekst", { type: "doc", content: [] }, { type: "doc", content: [{ type: "heading", content: [] }] }]) {
      it(`${JSON.stringify(content).slice(0, 40)} · dokument ${JSON.stringify(dokument)}`, () => {
        const nu = render(<MemoryRouter><ChatBeskedTekst content={content} dokument={dokument} /></MemoryRouter>).container.innerHTML;
        cleanup();
        const foer = render(<Foer content={content} />).container.innerHTML;
        expect(nu).toBe(foer);
      });
    }
  }
});

describe("med dokument — træet, med klikbare mærker", () => {
  it("#-mærkerne er links til appens egne adresser — aftalens fra rabataftaleAdresse", () => {
    vis(<ChatBeskedTekst content="Se #Vækstdag og #Dinero" dokument={doc(p(
      { type: "text", text: "Se " },
      { type: "eventhenvisning", attrs: { eventId: EVENT, titel: "Vækstdag" } },
      { type: "text", text: " og " },
      { type: "rabathenvisning", attrs: { aftaleId: AFTALE, titel: "Dinero" } },
    ))} />);
    expect(screen.getByRole("link", { name: "#Vækstdag" }).getAttribute("href")).toBe(`/events/${EVENT}`);
    expect(screen.getByRole("link", { name: "#Dinero" }).getAttribute("href")).toBe(`/rabataftaler?aftaleId=${AFTALE}`);
    expect(screen.getByRole("link", { name: "#Dinero" }).getAttribute("target")).toBeNull();
  });

  it("et klik navigerer internt (react-router), ingen sideindlæsning", () => {
    vis(<ChatBeskedTekst content="#Dinero" dokument={doc(p({ type: "rabathenvisning", attrs: { aftaleId: AFTALE, titel: "Dinero" } }))} />);
    expect(screen.getByTestId("sted").textContent).toBe("/chat");
    fireEvent.click(screen.getByRole("link", { name: "#Dinero" }));
    expect(screen.getByTestId("sted").textContent).toBe(`/rabataftaler?aftaleId=${AFTALE}`);
  });

  it("markup i dokumentets tekst er TEKST — intet element, intet script", () => {
    const { container } = vis(<ChatBeskedTekst content="x" dokument={doc(p(
      { type: "text", text: '<img src=x onerror="alert(1)"> ' },
      { type: "eventhenvisning", attrs: { eventId: EVENT, titel: "<b>Vækstdag</b>" } },
    ))} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(screen.getByRole("link").textContent).toBe("#<b>Vækstdag</b>");
  });

  it("fed, kursiv, lister og eksterne links tegnes; et javascript:-link mister sit link, teksten består", () => {
    const { container } = vis(<ChatBeskedTekst content="x" dokument={doc(
      p(
        { type: "text", text: "fed", marks: [{ type: "bold" }] },
        { type: "hardBreak" },
        { type: "text", text: "ud", marks: [{ type: "link", attrs: { href: "https://topix.dk" } }] },
        { type: "text", text: " ond", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
      ),
      { type: "bulletList", content: [{ type: "listItem", content: [p({ type: "text", text: "punkt", marks: [{ type: "italic" }] })] }] },
    )} />);
    expect(container.querySelector("strong")?.textContent).toBe("fed");
    expect(container.querySelector("br")).not.toBeNull();
    expect(container.querySelector("ul li em")?.textContent).toBe("punkt");
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://topix.dk"]);
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer nofollow");
    expect(container.textContent).toContain(" ond");
    expect(container.firstElementChild?.className).toBe("text-sm leading-relaxed chat-html-content");
  });
});
