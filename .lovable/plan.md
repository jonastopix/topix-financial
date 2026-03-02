

## Login-aktivitetslog for brugere

### Hvad bygges
En ny `user_login_log` tabel der automatisk registrerer hvert login, samt en visning i Members-siden hvor advisors kan se hvornår brugere sidst loggede ind og hvor ofte.

### Database-ændringer

**Ny tabel: `user_login_log`**
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `logged_in_at` (timestamptz, default now())
- `ip_address` (text, nullable) -- for fremtidig brug
- RLS: Advisors kan SELECT alle rækker. Ingen INSERT/UPDATE/DELETE via klient.

**Ny database-funktion: `log_user_login`**
- SECURITY DEFINER funktion der indsætter en række i `user_login_log`
- Kaldes fra klienten via `supabase.rpc('log_user_login')` ved login

### Kode-ændringer

**1. `src/hooks/useAuth.tsx`**
- I `onAuthStateChange`: Når event er `SIGNED_IN`, kald `supabase.rpc('log_user_login')` for at registrere login-tidspunktet.

**2. `src/pages/Members.tsx`**
- Hent seneste login og antal logins per bruger fra `user_login_log` (via en join/lookup)
- Vis "Sidst aktiv" og "Antal logins" kolonne/info i virksomhedskortene
- Advisors kan hurtigt se hvem der er aktive og hvem der aldrig har logget ind

### Teknisk detalje

```text
Tabel: user_login_log
+------------+--------------+
| user_id    | logged_in_at |
+------------+--------------+
| uuid       | timestamptz  |
+------------+--------------+

Funktion: log_user_login()
- Indsætter (auth.uid(), now())
- SECURITY DEFINER for at omgå RLS
```

Flowet:
1. Bruger logger ind -> `onAuthStateChange` fanger `SIGNED_IN`
2. Kalder `supabase.rpc('log_user_login')`
3. Advisor ser data aggregeret på Members-siden

### Sikkerhed
- RLS på tabellen: kun advisors kan læse, ingen kan skrive via klient (kun via SECURITY DEFINER funktion)
- Ingen ændring af eksisterende funktionalitet

