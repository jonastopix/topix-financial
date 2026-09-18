import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for «flyt event» (UDKAST 18/9-2026, recon-event-aendring.md §7).
// Målt: en datoændring var en almindelig UPDATE — ingen besked. Fem ting låses
// ved kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret):
//   1. flyt-event: modtagerne er de TILMELDTE (response attending, cancelled_at
//      null), læst FØR opdateringen; UPDATE FØR writeNotificationToMany;
//      beskeden er flyttetBesked (type event_flyttet, dedup med ny starttid);
//      en kladde får ingen besked; aflyst afvises.
//   2. Editoren sender aldrig starts_at/ends_at til updateEvent for et
//      publiceret event: gem-vejen er gemEventEllerFlyt → planlaegGem, hvor
//      tiden går til flytEvent og kun resten til updateEvent.
//   3. event-reminders' dedup-nøgler for A og B bærer dagen; C bærer
//      starttidspunktet (omEnTimeBesked) — rettet 18/9.
//   4. config.toml: flyt-event med verify_jwt = true (Bucket A-reglen).
//   5. flyttetBesked's dedup_key bærer den nye starttid (ellers spærrer den
//      første flytning for den næste).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const FUNKTION = "supabase/functions/flyt-event/index.ts";
const API = "src/lib/hjemmebane/adminContentApi.ts";
const EDITOR = "src/components/hjemmebane/admin/editors/EventEditor.tsx";
const REMINDERS = "supabase/functions/event-reminders/index.ts";
const MAILS = "supabase/functions/_shared/eventMails.ts";

const fn = udenKommentarer(laes(FUNKTION));
const api = udenKommentarer(laes(API));
const editor = udenKommentarer(laes(EDITOR));
const reminders = udenKommentarer(laes(REMINDERS));
const mails = udenKommentarer(laes(MAILS));

/** 1: funktionens rækkefølge og modtagerregel. */
export function funktionDom(k: string): string[] {
  const fejl: string[] = [];
  const auth = k.indexOf("authenticateUser(");
  const client = k.indexOf("createClient(");
  const regs = k.indexOf('.from("event_registrations")');
  const update = k.indexOf('.from("events").update(patch)');
  const besked = k.indexOf("writeNotificationToMany(");
  if (auth < 0 || client < 0 || auth > client) fejl.push("authenticateUser står ikke før createClient");
  if (!/_role|user_roles/.test(k) || !k.includes('.in("role", ["advisor", "admin"])')) fejl.push("ingen advisor/admin-gate");
  if (regs < 0 || update < 0 || besked < 0) fejl.push("modtagere, update eller besked mangler");
  if (!(regs < update && update < besked)) fejl.push("rækkefølgen er ikke modtagere → UPDATE → besked");
  const regsKaede = k.slice(regs, regs + 260);
  if (!regsKaede.includes('.eq("response", "attending")') || !regsKaede.includes('.is("cancelled_at", null)')) fejl.push("modtagerne er ikke tilmeldte (attending, ikke afmeldt)");
  if (!k.includes("flyttetBesked(")) fejl.push("beskeden er ikke flyttetBesked");
  if (!/if \(event\.status !== "published"\) \{[\s\S]{0,300}return json\(/.test(k)) fejl.push("en kladde ville få besked");
  if (!k.includes('event.status === "cancelled"')) fejl.push("aflyst afvises ikke");
  if (!k.includes("erFlytning(event, patch)")) fejl.push("uændret tid er ikke en no-op");
  return fejl;
}

/** 2: editoren og API'et — tiden går aldrig til updateEvent for et publiceret event. */
export function editorDom(editorK: string, apiK: string): string[] {
  const fejl: string[] = [];
  const mut = editorK.slice(editorK.indexOf("const mutation = useMutation({"), editorK.indexOf("const persist = ("));
  if (!mut.includes("gemEvent: () => gemEventEllerFlyt(event, patch),")) fejl.push("mutationFn går ikke gennem gemEventEllerFlyt");
  if (/await updateEvent\(|updateEvent\(event\.id, patch\)/.test(mut)) fejl.push("mutationFn kalder updateEvent direkte");
  const gem = apiK.slice(apiK.indexOf("export async function gemEventEllerFlyt("));
  const krop = gem.slice(0, gem.indexOf("\n}\n") + 3);
  if (!krop.includes("const plan = planlaegGem(event, patch as Record<string, unknown>);")) fejl.push("gemEventEllerFlyt dømmer ikke med planlaegGem");
  if (!krop.includes("await updateEvent(event.id, plan.rest as")) fejl.push("resten går ikke til updateEvent");
  if (!krop.includes("if (plan.flytning) await flytEvent(event.id, plan.flytning);")) fejl.push("flytningen går ikke til flytEvent");
  if (/updateEvent\(event\.id, patch\b/.test(krop)) fejl.push("hele patchen sendes til updateEvent");
  if (krop.indexOf("await updateEvent(") > krop.indexOf("await flytEvent(")) fejl.push("flytningen står før resten (beskeden ville bære den gamle titel)");
  if (!/functions\.invoke\("flyt-event"/.test(apiK)) fejl.push("flytEvent kalder ikke flyt-event");
  return fejl;
}

/** 3: dedup-nøglerne A og B bærer dagen; C bærer starttidspunktet. */
export function remindersDom(k: string, mailsK: string): string[] {
  const fejl: string[] = [];
  if (!k.includes("dedup_key: `event_reminder:${event.id}:a:${eventDay}`,")) fejl.push("A-nøglen bærer ikke dagen");
  if (!k.includes("dedup_key: `event_reminder:${event.id}:b:${eventDay}`,")) fejl.push("B-nøglen bærer ikke dagen");
  if (/event_reminder:\$\{event\.id\}:[ab]`/.test(k)) fejl.push("en gammel nøgle uden dag står stadig");
  const c = mailsK.slice(mailsK.indexOf("export function omEnTimeBesked("));
  if (!c.includes("const startIso = new Date(e.starts_at).toISOString();") || !c.includes("dedup_key: `event_reminder:${e.id}:c:${startIso}`,")) fejl.push("C-nøglen bærer ikke starttidspunktet");
  if (!k.includes("notifiedC += await writeNotificationToMany(admin, recipients, omEnTimeBesked(event));")) fejl.push("C sendes ikke gennem omEnTimeBesked");
  return fejl;
}

/** 5: beskedens dedup bærer den nye starttid. */
export function beskedDom(k: string): string | null {
  const b = k.slice(k.indexOf("export function flyttetBesked("));
  if (!b.includes('type: "event_flyttet"')) return "typen er ikke event_flyttet";
  if (!b.includes("dedup_key: `event_flyttet:${e.id}:${nyIso}`,")) return "dedup bærer ikke den nye starttid";
  if (!b.includes("const nyIso = new Date(e.starts_at).toISOString();")) return "starttiden normaliseres ikke til ISO";
  return null;
}

describe("flytEvent.guard — flyt-event, editoren, reminders, config og beskeden", () => {
  it("1: funktionen — tilmeldte læses før, UPDATE før besked, kladde tavs, aflyst afvist, uændret no-op", () => expect(funktionDom(fn)).toEqual([]));
  it("2: editoren sender aldrig tiden til updateEvent for et publiceret event; resten før flytningen", () => expect(editorDom(editor, api)).toEqual([]));
  it("3: reminders' A- og B-nøgler bærer dagen, C bærer starttidspunktet", () => expect(remindersDom(reminders, mails)).toEqual([]));
  it("4: config.toml har flyt-event med verify_jwt = true", () => {
    expect(laes("supabase/config.toml")).toMatch(/\[functions\.flyt-event\]\s*\n\s*verify_jwt = true/);
  });
  it("5: flyttetBesked's dedup bærer den nye starttid", () => expect(beskedDom(mails)).toBeNull());
});

describe("selvbevis — hvert prædikat fælder en muteret kopi", () => {
  it("1: besked før UPDATE, eller modtagere uden attending-filter, falder", () => {
    const foer = fn.replace('.from("events").update(patch)', '.from("events").select("id")') + '\nawait admin.from("events").update(patch).eq("id", eventId);\n';
    expect(funktionDom(foer)).not.toEqual([]);
    expect(funktionDom(fn.replace('.eq("response", "attending")', ""))).not.toEqual([]);
    expect(funktionDom(fn.replace('if (event.status !== "published") {', "if (false) {"))).not.toEqual([]);
  });
  it("2: den gamle mutationFn (updateEvent direkte), eller en gemEventEllerFlyt der sender hele patchen, falder", () => {
    expect(editorDom(editor.replace("gemEvent: () => gemEventEllerFlyt(event, patch),", "gemEvent: () => updateEvent(event.id, patch),"), api)).not.toEqual([]);
    expect(editorDom(editor, api.replace("await updateEvent(event.id, plan.rest as Tables[\"events\"][\"Update\"])", "await updateEvent(event.id, patch)"))).not.toEqual([]);
    expect(editorDom(editor, api.replace("if (plan.flytning) await flytEvent(event.id, plan.flytning);", ""))).not.toEqual([]);
  });
  it("3: en nøgle uden dag, eller en C-nøgle uden tid, falder", () => {
    expect(remindersDom(reminders.replace("dedup_key: `event_reminder:${event.id}:b:${eventDay}`,", "dedup_key: `event_reminder:${event.id}:b`,"), mails)).not.toEqual([]);
    expect(remindersDom(reminders, mails.replace("dedup_key: `event_reminder:${e.id}:c:${startIso}`,", "dedup_key: `event_reminder:${e.id}:c`,"))).not.toEqual([]);
  });
  it("5: en dedup uden starttid falder", () => {
    expect(beskedDom(mails.replace("dedup_key: `event_flyttet:${e.id}:${nyIso}`,", "dedup_key: `event_flyttet:${e.id}`,"))).not.toBeNull();
  });
});
