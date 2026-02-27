

## Profilbillede-upload og visning i chat

### Oversigt
Brugere (og advisors) kan uploade et profilbillede fra Indstillinger-siden. Billedet vises ved siden af beskeder i chatten, så det er tydeligt hvem der skriver -- specielt nyttigt med flere advisors og teammedlemmer i samme trad.

### Hvad der bliver lavet

**1. Ny storage bucket til profilbilleder**
- Opretter en public `avatars` bucket via SQL-migration
- RLS-politikker sa brugere kun kan uploade/overskrive deres eget billede

**2. Profilbillede-upload i Indstillinger**
- Tilfojer en avatar-upload sektion i profil-kortet pa Settings-siden
- Viser nuvaerende billede (eller initialer som fallback) med en "Upload billede" knap
- Gemmer URL i `profiles.avatar_url` feltet (som allerede eksisterer i databasen)

**3. Avatars i chat-beskeder**
- Viser afsenderens profilbillede ved siden af hver besked i chatten
- Bruger initialer som fallback hvis intet billede er uploadet
- Fungerer for bade medlemmer og advisors

### Tekniske detaljer

**Database**:
- SQL-migration: Opret `avatars` storage bucket med RLS-politikker (authenticated users kan uploade til deres egen mappe)

**Settings.tsx**:
- Tilfojer avatar-preview (rund cirkel) + upload-knap i profil-sektionen
- Upload-logik: upload til `avatars/{user_id}/avatar`, gem public URL i `profiles.avatar_url`

**Chat.tsx**:
- `profilesMap` udvides til ogsa at inkludere `avatar_url`
- Ved rendering af beskeder: vis lille rundt profilbillede til venstre for indkommende beskeder (og til hojre for egne)
- Participants-listen bruger allerede `avatar_url` -- dette fortsaetter uaendret

