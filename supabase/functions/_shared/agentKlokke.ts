// Agentens klokke til rådgiverne — ren dom, Deno-fri (testes fra src/lib/__tests__/agentKlokke.test.ts).
//
// Tildeling af rådgiver er fjernet fra platformen (1/10-2026: «Rådgiverne er sammen om alle
// medlemmer»), så `notify_advisor` ringer klokken hos HVER rådgiver — ikke kun hos
// `conversations.assigned_advisor_id`. Tjenestekonti er med med vilje: klokker skrives stadig til
// dem (CLAUDE.md «Tjenestekonti» — kontoen skal se alt); det er personlisterne, der filtrerer.

export const AGENT_TYPE = "agent_insight";
export const AGENT_REFERENCE = "agent";

export interface AgentKlokkeFelter {
  title: string;
  body: string;
  company_id: string;
  /** Medlemmet samtalen hører til; falder tilbage på rådgiveren selv (som før), når samtalen ingen har. */
  member_id: string | null;
}

export interface AgentKlokkeRaekke {
  type: typeof AGENT_TYPE;
  title: string;
  body: string;
  company_id: string;
  member_id: string;
  advisor_id: string;
  reference_type: typeof AGENT_REFERENCE;
}

/** Én række pr. UNIK rådgiver-id (tomme/ikke-tekst id'er tabes; rækkefølgen fra første forekomst). */
export function klokkeRaekker(raadgiverIds: readonly (string | null | undefined)[], felter: AgentKlokkeFelter): AgentKlokkeRaekke[] {
  const unikke: string[] = [];
  for (const id of raadgiverIds) {
    if (typeof id === "string" && id.length > 0 && !unikke.includes(id)) unikke.push(id);
  }
  return unikke.map((id) => ({
    type: AGENT_TYPE,
    title: felter.title,
    body: felter.body,
    company_id: felter.company_id,
    member_id: felter.member_id || id,
    advisor_id: id,
    reference_type: AGENT_REFERENCE,
  }));
}
