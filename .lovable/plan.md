

## Problem

Du lander på `/onboarding` selv som aktiv onboardet bruger. Der er to årsager:

### 1. `/onboarding` er en ubeskyttet route (hovedårsag)

I `src/App.tsx` linje 138:
```tsx
<Route path="/onboarding" element={<Onboarding />} />
```

Den har **ingen guard** — hverken auth eller "er du allerede onboardet?". Det betyder:
- Hvis du har et browser-tab åbent på `/onboarding` og refresher, bliver du der
- Hvis et gammelt link, notifikation eller bookmark peger på `/onboarding`, åbnes siden uanset hvad
- Hvis du manuelt skriver `/onboarding`, ser du altid onboarding-flowet

### 2. `Onboarding.tsx` tjekker ikke om brugeren allerede er onboardet

Komponenten viser blot formularen ved mount uden at kigge på `profile?.onboarded_at`.

### 3. Mindre race-risiko (sekundær)

I `useAuth.tsx` sætter `fetchUserData` `setLoading(false)` i `finally`-blokken efter `setNeedsOnboarding(...)`. React batcher disse, så det er normalt fint — men hvis profil-querien fejler (linje 327 `catch`), bliver `loading=false` og `needsOnboarding=false` (initial værdi), hvilket vil sende dig til `/` snarere end `/onboarding`. Så bug 1+2 er den reelle årsag.

## Løsning

**Fix 1 — Beskyt `/onboarding`-routen med en guard.**

Tilføj en `OnboardingRoute`-wrapper i `src/App.tsx` der:
- Viser spinner mens `loading` er true
- Sender ikke-loggede til `/auth`
- Sender advisors til `/`
- Sender brugere der **allerede er onboardet** (`!needsOnboarding`) til `/`
- Ellers viser `<Onboarding />`

```tsx
const OnboardingRoute = ({ children }) => {
  const { user, loading, needsOnboarding, isAdvisor } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/auth" replace />;
  if (isAdvisor) return <Navigate to="/" replace />;
  if (!needsOnboarding) return <Navigate to="/" replace />;
  return <>{children}</>;
};
```

Og opdater route:
```tsx
<Route path="/onboarding" element={<OnboardingRoute><Onboarding /></OnboardingRoute>} />
```

**Fix 2 — Sikkerhedsnet i `Onboarding.tsx`.**

Tilføj en `useEffect` der ved mount kalder `navigate("/", { replace: true })` hvis `profile?.onboarded_at` allerede findes. Dette beskytter mod fremtidige guard-regressioner.

**Fix 3 — Sikrere `loading`-håndtering i `useAuth.tsx` (hærdning).**

I `fetchUserData`s `catch`-blok: hvis profilen ikke kan hentes, sæt **ikke** `needsOnboarding=false` automatisk. I dag forbliver den på initial `false`. Bedre adfærd: lad `loading` forblive `true` ikke ved fejl, men vis i stedet spinner indtil retry. Minimal ændring: bare logge fejl og lade UI håndtere det. Ingen breaking change.

## Filer der ændres

- `src/App.tsx` — tilføj `OnboardingRoute` guard, brug den på `/onboarding`-route
- `src/pages/Onboarding.tsx` — tilføj mount-tjek der redirecter onboardede brugere til `/`

## Hvad ændres ikke

- `useAuth.tsx`'s overordnede flow (kun evt. minimal log-ændring)
- Eksisterende guards (`ProtectedRoute`, `MemberRoute`, `AdvisorRoute`, `AdminRoute`)
- Onboarding-formularens UX for nye brugere

## Forventet resultat

Efter fix:
- Aktive brugere kan ikke længere lande på `/onboarding`. Hvis de tilgår URL'en direkte, bliver de sendt til `/`
- Nye brugere uden `onboarded_at` ser stadig onboarding-flowet som normalt
- Advisors sendes altid til `/` hvis de prøver `/onboarding`

