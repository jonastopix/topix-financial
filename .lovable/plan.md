
Mest sandsynligt er det ikke “klassisk cache” fra en service worker, fordi projektet ikke registrerer nogen service worker i koden. Den nye onboarding-guard er allerede på plads begge steder:

- `src/App.tsx` beskytter `/onboarding` med `OnboardingRoute`
- `src/pages/Onboarding.tsx` har også et redirect-sikkerhedsnet

Det betyder, at hvis du stadig bliver hængende på `/onboarding` på mobil, er de mest sandsynlige forklaringer:

1. Mobilen kører en ældre bundle/webview-version
- Især på iPhone/hjemskærms-app kan en gammel JS-bundle leve videre lidt længere end forventet.
- Der er PWA-manifest og standalone-mode, så installeret app/webview kan opføre sig mere “sticky” end desktop-browseren.

2. Mobilen genåbner sidste route
- iOS standalone eller mobilbrowser kan genoptage sidste side (`/onboarding`) ved app-åbning.
- Med den nye kode bør den straks sende videre til `/`, men kun hvis den faktisk kører den nyeste bundle.

3. Der findes stadig et edge-case i auth/opstart
- `useAuth` sætter `loading=false` efter `fetchUserData`.
- Hvis mobil-sessionen genoptages under særlige timing-forhold, kan en gammel route blive vist længere end ønsket, eller redirect-logikken kan blive for sen.

Plan for at afklare og lukke hullet helt:

1. Verificér om problemet er “gammel klient” eller reel kodefejl
- Sammenlign adfærden på:
  - mobil i browser
  - mobil fra hjemskærm
  - desktop
- Hvis kun hjemskærms-versionen rammes, peger det stærkt på gammel klient/webview-state.

2. Instrumentér onboarding-redirects midlertidigt
- Tilføj let debug-logging eller telemetry i:
  - `OnboardingRoute`
  - `Onboarding.tsx`
  - `useAuth.tsx`
- Log:
  - nuværende path
  - `loading`
  - `user`
  - `needsOnboarding`
  - `isAdvisor`
  - om redirect blev trigget
- Så kan vi se, om mobilen faktisk kører den nye guard, eller om den aldrig rammer den.

3. Hærd redirecten mod “last route restore”
- Tilføj en ekstra klient-sikring tidligt i app-opstart:
  - hvis path er `/onboarding`
  - og brugeren er logget ind
  - og profil viser `onboarded_at`
  - så redirect straks til `/`
- Målet er at gøre redirect mere aggressiv helt tidligt i lifecycle, så mobil restore ikke føles som en landing på onboarding.

4. Tilføj versions-/build-markør for at afsløre stale klienter
- Indbyg en lille build-version i frontend.
- Ved app-start kan klienten sammenligne loaded version med seneste deploy-version.
- Hvis version er gammel, vis “Appen er opdateret – genindlæs” eller tvungen reload.
- Det er den mest robuste måde at eliminere tvivl om cache/stale bundle på mobil.

5. Hærd installeret mobil-app specifikt
- Hvis appen kører i standalone, tilføj et ekstra reload-check ved resume/visibility:
  - lyt på `visibilitychange` / `pageshow`
  - hvis appen genåbnes på `/onboarding` og brugeren ikke behøver onboarding, redirect direkte
- Det matcher eksisterende mobil/PWA-mønstre i projektet.

6. Bekræft domæne-konsistens
- Sikr at både `app.theboardroom.dk` og `www.app.theboardroom.dk` peger på samme aktuelle buildoplevelse.
- Der er allerede redirect fra `topix.lovable.app`, men ikke tilsvarende klient-redirect mellem `www.app...` og `app...`.
- Hvis mobilen åbner en anden host end forventet, kan det forklare oplevet “gammel” adfærd.

Filer der mest sandsynligt skal opdateres
- `src/hooks/useAuth.tsx` — ekstra early-state/redirect robustness eller debug
- `src/App.tsx` — tidlig guard/hærdning omkring `/onboarding`
- `src/pages/Onboarding.tsx` — stærkere mount-redirect eller telemetry
- `src/main.tsx` — evt. build-version check og/eller host-normalisering
- evt. `index.html` — version-markør hvis vi vælger cache-diagnostik

Forventet resultat
- Vi kan afgøre, om det er gammel mobilklient eller reel bug
- Installeret mobil-app og mobilbrowser holder op med at “lande” på `/onboarding`
- Allerede onboardede brugere bliver sendt videre konsekvent, også efter resume/genåbning på mobil
