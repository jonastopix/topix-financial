/**
 * scrollRamme.guard — Jonas 30/9: «to scrollers i højre side … hvis man scroller forbi bunden».
 * Årsagen (målt 30/9 22:55, 1440×900): Hb-skallens scrollende indholdskolonne
 * havde ingen positioneret forfader, så `sr-only`-tekster (position: absolute)
 * blev placeret i dokumentet og gjorde det højere end vinduet. Værnet kræver
 * `relative` på de scrollende kolonner i skallen og i sidebaren.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const laes = (p: string) => readFileSync(p, "utf8");

export const kolonnenErPositioneret = (shell: string): boolean =>
  /className=\{`relative min-w-0 flex-1 \$\{fuld \? "flex flex-col overflow-hidden" : "lg:overflow-y-auto"\}`\}/.test(shell);
export const sidebarenErPositioneret = (sidebar: string): boolean =>
  /<aside className="relative hidden h-screen[^"]*overflow-y-auto/.test(sidebar);

describe("scrollRamme.guard", () => {
  const shell = laes("src/components/hjemmebane/HbMemberShell.tsx");
  const sidebar = laes("src/components/hjemmebane/HbSidebar.tsx");
  it("indholdskolonnen har relative", () => expect(kolonnenErPositioneret(shell)).toBe(true));
  it("sidebaren har relative", () => expect(sidebarenErPositioneret(sidebar)).toBe(true));
  it("fælder uden relative", () => {
    expect(kolonnenErPositioneret(shell.replace("relative min-w-0 flex-1", "min-w-0 flex-1"))).toBe(false);
    expect(sidebarenErPositioneret(sidebar.replace('<aside className="relative hidden', '<aside className="hidden'))).toBe(false);
  });
});
