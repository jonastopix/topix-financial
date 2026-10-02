// monday-webhook — SLUKKET. Svarer 410 Gone på alt.
//
// Jonas 1/10-2026 kl. 22:18: «Vi bruger ikke Monday mere. Det er opsagt.
// Så kald fra Monday skal bare væk.»
//
// HVORFOR 410 OG IKKE EN SLETTET MAPPE: en slettet mappe i repoet fjerner
// IKKE den udrullede function hos Lovable — den gamle bundle (værn, Monday-
// API, service-role, virksomhedsoprettelse, dag 0-mail) ville køre videre på
// ethvert «Godkendt», Monday eller make.com stadig måtte sende, indtil nogen
// fjerner den eksplicit. Denne fil ERSTATTER den kørende kode med én
// eksplicit udrulning og beviser sig selv ved et kald: 410 er et svar, KUN
// den nye kode giver (den gamle svarede 400/401/500 eller 200 {challenge}).
//
// HVAD DEN IKKE GØR — og værnet mondayVaek.guard låser det: ingen parsing
// af body (hverken req.json eller req.text), ingen Deno.env, ingen
// service-role-klient, ingen database, ingen fetch, ingen Monday-secret.
// Derfor er den uden auth-prædikat: der er intet at beskytte. CI-værnet
// (scripts/check-edge-function-auth.ts) springer den over som
// «skip-no-sr», og det er rigtigt. verify_jwt = false i config.toml med
// begrundelse: bag verify_jwt = true ville gatewayen svare 401, og 410-
// beviset kunne aldrig måles.
//
// Historikken (værnet med to veje, kolonne-id'erne, dedup på monday_item_id,
// gennemkørslen 14/9) står i docs/OVERLEVERING.md og git-historikken for
// denne fil (sidst `d02669a0`). Kolonnen company_betalingslink.monday_item_id
// og dens indeks er DATA og røres ikke.

const BESKED = {
  error: "gone",
  besked: "Monday-integrationen er nedlagt (2/10-2026). Denne webhook tager ikke imod kald.",
} as const;

Deno.serve((_req) => {
  return new Response(JSON.stringify(BESKED), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  });
});
