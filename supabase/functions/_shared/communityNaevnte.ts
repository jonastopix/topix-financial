/**
 * communityNaevnte — hvem er @-nævnt i et community-dokument.
 *
 * Spejl af samlNaevnteBrugere i notify-community-naevnelse/index.ts:32-51
 * (den funktion må ikke røres, derfor en kopi her frem for en flytning).
 * Samme rekursion som motoren (communityDokument.ts følger kun
 * content-arrayet); bevidst ingen jsonpath. Ren funktion, ingen Deno.
 *
 * Bruges af notify-community-opslag til at holde de nævnte UDE af
 * opslags-notifikationen: de får allerede nævnelsen (important + mail),
 * og to beskeder for samme handling er støj — samme begrundelse som
 * nævnelsesfunktionen selv giver for trådens forfatter (:137-140).
 */
export function samlNaevnteBrugere(dok: unknown): string[] {
  const fundne = new Set<string>();
  const gaa = (node: unknown) => {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return;
    const n = node as Record<string, unknown>;
    if (n.type === "naevnelse") {
      const attrs =
        typeof n.attrs === "object" && n.attrs !== null && !Array.isArray(n.attrs)
          ? (n.attrs as Record<string, unknown>)
          : {};
      const id = attrs.userId ?? attrs.user_id;
      if (typeof id === "string" && id.trim() !== "") fundne.add(id.trim());
    }
    if (Array.isArray(n.content)) {
      for (const barn of n.content) gaa(barn);
    }
  };
  gaa(dok);
  return [...fundne];
}
