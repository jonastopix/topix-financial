/**
 * supabase/functions/_shared/isoUge.ts
 *
 * DEN kanoniske ISO-8601-uge-nøgle for edge functions — én delt kilde
 * (hændelsen 2026-08-25, BACKLOG: agentens mandags-ankrede kopi skrev
 * 42 rækker én uge bagud over fire måneder; ingen blev nogensinde vist,
 * og hver upsert overskrev cron'ens kort for den forrige uge).
 *
 * Kilden er generate-weekly-focus/index.ts:12-19 — torsdags-ankeret;
 * funktions-KROPPEN er flyttet ordret, ingen omskrivning. Kun den gamle
 * misvisende kommentarlinje ("Monday-based") er bevidst erstattet.
 * Paritet med den gamle lokale kopi
 * OG med frontendens src/lib/hjemmebane/week.ts (samme aritmetik)
 * håndhæves af src/lib/__tests__/isoUge.test.ts, som også fejler hvis
 * en edge function igen beregner en uge-nøgle inline.
 *
 * Nul imports, så filen kan læses af både Deno og Vitest.
 */

// ISO-8601 uge-nøgle, format "YYYY-WNN". Ankeret er ugens TORSDAG —
// ISO-uge 1 er ugen der indeholder årets første torsdag, og både uge-år
// og ugenummer aflæses af torsdagen. Et mandags-anker giver forkert
// nummer i de fleste år og forkert ÅR omkring årsskiftet (hændelsen
// 2026-08-25).
export function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
