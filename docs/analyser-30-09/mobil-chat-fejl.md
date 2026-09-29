# Mobil-chat: hvorfor den er «dårligt skåret» — målt og læst i koden

Dato 29/9-2026. Grundlag: origin/main 2928d3d. Ingen kildefiler rørt, intet committet.
Metode: (a) læst kode med fil:linje, (b) Playwright/Chromium (touch, dsf 3) mod et harness i
`/tmp/claude-0/-home-claude/0bc80b6c-ee29-52bd-beb8-eb7b1c75be19/scratchpad/h/` (vite + repoets
Tailwind-config og index.css). Harnessen bruger de RIGTIGE komponenter HbNav, ChatRichInput,
ChatBeskedTekst, SvarerPaaBanner og NoegletalChipBanner. Sendefeltets ramme, headerne, boblerne og
tjeklistepillen er kopieret ORDRET (klasser) fra panerne; de er ikke selve panerne (de kræver
Supabase/auth). Manrope/Fraunces kunne ikke hentes offline (fallback-skrift), så tekstbredder er
omtrentlige; alle højder og bredder nedenfor kommer af faste klasser (padding, ikoner) og er robuste.
IKKE målt: iOS Safari og Android Chrome på rigtige enheder, samt faktisk tastatur. Et Chromium-viewport
skrumpet med tastaturhøjden efterligner KUN Android (interactive-widget=resizes-content).

## 0. Rettelser til den tidligere recon

| Recon sagde | Koden/målingen viser |
|---|---|
| Værktøjslinjen står på mobil uden wrap og kan skubbe siden | FALSK. `isCompact = compact ?? isMobile` (ChatRichInput.tsx:216) og `{editor && !isCompact && <Toolbar/>}` (:425). Målt: ingen «Formater:» på mobil. |
| Lange ord/URL'er bryder ikke (`word-break: normal`) | FALSK. `.chat-html-content { overflow-wrap:anywhere }` (index.css:151-156). Målt 375/390: lang URL og 43-tegns ord bryder; ingen element uden for kanten. |
| Højdekæden bruger 100vh/h-screen | FALSK for chatten. `.h-screen-safe` = 100vh med `100dvh` som override (index.css:213-216); HbMemberShell.tsx:190 bruger den. `h-screen` findes kun i HbSidebar.tsx:272, som er `hidden … lg:flex`. |
| Medlemmet har liste/samtale-skift på mobil | FALSK. `showMessages` deklareres (MemberChatPane.tsx:104) og sættes (:481) men læses aldrig. Se fund 6. |
| Editoren mangler safe-area | Safe-area ligger på ydre ramme (MemberChatPane.tsx:948-951, CompanyChatPane.tsx:2056-2059). Ikke en fejl. |
| Vedhæftninger/video for brede | Målt: `max-w-[280px]`/`max-w-[360px]` inde i boble på max 88 %; ingen overflow (ChatAttachments.tsx:131, ChatVideoBesked.tsx:100). |
| Tabeller/pre i beskeder | Umuligt: DOMPurify tillader kun b,strong,i,em,ul,ol,li,a,p,br (ChatBeskedTekst.tsx:18). |

## 1. Højden (kæde fra rod til beskedliste)

App.tsx:229-292 (ingen wrapper med højde) -> ChatShell.tsx:104/:126 (`HbMemberShell layout="fuld"`) ->
HbMemberShell.tsx:190 `h-screen-safe` (100dvh) -> :191 `flex h-full overflow-hidden` -> :193 kolonne
`flex flex-col overflow-hidden` -> HbNav (:194) -> HbVisningSom (:199; kun rådgiver med virksomhedsvalg) ->
`<main flex min-h-0 flex-1 flex-col>` (:215) -> ChatShell-wrapper `h-full min-h-0 overflow-hidden` ->
[medlem: faner, ChatShell.tsx:~131-152] -> pane-rod `flex flex-1 min-h-0 overflow-hidden`
(MemberChatPane.tsx:557, CompanyChatPane.tsx:1262) -> header -> beskedliste `flex-1 overflow-y-auto`
(MemberChatPane.tsx:588, CompanyChatPane.tsx:1672) -> sendefelt `shrink-0` (:948 / :2056).

- Kæden er bundet med dvh hele vejen; beskedlisten er eneste scroll-container. Android Chrome: højden følger
  tastaturet (index.html:5 `interactive-widget=resizes-content`). Kæden er IKKE årsagen til «skåret» på Android;
  beskedlisten mister plads til faste blokke (fund 3).
- iOS Safari: `dvh` reagerer på adresselinjen, IKKE på tastaturet, og `interactive-widget` er så vidt jeg kan se
  ikke understøttet i Safari endnu (WebKit har det først nu, bram.us 11/9-2026). 100dvh forbliver 812, sendefeltet
  ligger i bunden af en boks tastaturet dækker, og Safari scroller siden op for at afsløre fokusfeltet, så
  nav/faner/header kan forsvinde over kanten. ChatRichInput.tsx:331-342 kalder desuden `scrollIntoView({block:"end"})`
  efter 300 ms, som scroller ALLE scrollbare forfædre (også overflow:hidden); kommentaren dér antager at viewporten skrumper.
  STATUS: udledt af kode og dokumentation, IKKE målt (kun Chromium installeret). Kræver enhed.
- MemberChatPane.tsx:377 bruger stadig `messagesEndRef.scrollIntoView` ved hver `messages`-ændring; CompanyChatPane.tsx:755
  blev rettet til `el.scrollTo` (kommentar :725-750, «recon-chat-hop»). Samme fejl er stadig i medlemspanen. Ikke målt at den hopper.

## 2. Bredden

- Siden kan ikke skubbes vandret: `html, body, #root { overflow-x:hidden }` (index.css:109-111). Målt
  `documentElement.scrollWidth` = viewport (360/375/390) i alle scenarier; ingen element uden for kanten.
- Boble `max-w-[88%]` af (viewport - 24): 322 px ved 390 (målt). Ingen fejl.
- To-kolonne: ingen på mobil; liste ELLER samtale (`showSidebar`/`showMessageArea`, CompanyChatPane.tsx:1168-1169).
- Eneste vandrette risiko: HbMenu (CompanyChatPane.tsx:128-160) er `w-56` absolut fra ⋯-knappen. Ikke målt.

## 3. Sendefeltet — regnestykket (375 x 812, tastatur 320 => Android layout-viewport 492 px)

Målt i harness (px): HbNav 65 (h-16 = 64 + 1 border, HbNav.tsx:13-14) | faner 36 | medlemsheader 57
(py-2.5 = 20 + avatar 36 + 1) | rådgiverheader 54,8 | sendefelt 99 | «Svarer på»-banner 48 |
nøgletal-chip-banner 74 (2-3 linjer ved 375) | tjeklistepille 46 (fixed).
Sendefelt 99 = 8 (pt-2) + 1 (border-t) + 2 (editor-ramme) + 80 (`min-h-[80px]`, ChatRichInput.tsx:271) + 8 (pb-2; + safe-area).

MEDLEM, tastatur åbent (492 px):
- Fast: 65 + 36 + 57 + 99 = 257 -> beskedliste 492 - 257 = 235 px (48 %). Målt 235.
- + Svarer på (48): 492 - 305 = 187. Målt 187.
- + nøgletal-chip (74): 492 - 331 = 161. Målt 161.
- + begge + tjeklistepille: sendefelt 99+48+74 = 221; 492 - 65 - 36 - 57 - 221 = 113 px (23 %). Målt 113.
  Pillen (46 px, fixed bottom-0, z-40) ligger OVEN PÅ de nederste 46 af de 221.
- Tastatur 300: +20; tastatur 340: -20 i alle linjer.
RÅDGIVER: 65 + 54,8 + 99 = 218,8 -> 492 - 218,8 = 273 px (55 %). Med «Du ser {virksomhed}»-linjen (HbVisningSom, 37): 236.
Med Svarer på: 188. iPhone uden tastatur lægger `env(safe-area-inset-bottom)` (~34) oven i de 99.
Uden tastatur, medlem: 812 - 257 = 555 px (68 %); nav+faner+header æder 158 px (19 %).
En enkelt linje tekst bruger 99 px sendefelt, fordi editoren altid er 80 (tre linjer, Jonas 10/9, kommentar ChatRichInput.tsx:264-270).

## 4. Headeren i samtalen

MEDLEM (MemberChatPane.tsx:563-585): 57 px, tre elementer; navnet skæres ikke. Tilbage-pilen (:566) er død (fund 6).

RÅDGIVER (CompanyChatPane.tsx:1467-1655), én række `flex items-center gap-3` med 7 børn:
tilbage 32 + avatar 32 + navn (flex-1) + «Se tal» ~68 (:1511-1522) + «Afventer»-chip 30 (kun ikon; teksten er `hidden sm:inline`, :1528)
+ ⋯ 28 (:1533) + prev/next 58 (:1637-1654) + 6 gaps x 12 = 72 + px-3 24.
Fast = 32+32+68+30+28+58+72+24 = 344 px.
- 375 px: navnet får 375 - 344 = 31 px. MÅLT 30,8. 360 px: 15,8 (målt).
- Uden «Afventer»-chip: 375 - (344 - 30 - 12) = 73 px. MÅLT 72,8. Stadig kun «Bl…».
Dette er det mest konkrete svar på «dårligt skåret» for Jonas som rådgiver: virksomhedens navn og medlemmernes navne
(:1481-1490) kan reelt ikke læses. Chippen er kun et ikon uden tekst på mobil.
⋯-menuen (:1533-1635) rummer en formular med input/select/textarea i `text-xs` og er ca. 300+ px høj i en container med
`overflow-hidden` (rod :1262); med tastatur oppe kan den afskæres. Ikke målt.

## 5. Ting der kun virker med mus / usynlige handlinger

- Hover-handlinger på bobler er slået fra på mobil (`!isMobile`; desktop-pin MemberChatPane.tsx:771, CompanyChatPane.tsx:1890)
  og erstattet af langt tryk 500 ms (MobileMessageActionDrawer.tsx:13,55-64): Svar, Redigér, Slet, reaktion.
  Ingen synlig antydning af at man kan trykke længe. Langt tryk er den ENESTE vej til «Svar».
- To langtryks-systemer kører SAMTIDIG på samme boble: `longPressHandlers` (MemberChatPane.tsx:508-519 + :755;
  CompanyChatPane.tsx:1200-1210 + :1874) og MobileMessageActionDrawer. Begge udløses efter 500 ms: bundskuffen åbner OG en
  emoji-pille (`absolute -top-10`, MemberChatPane.tsx:756-763 / CompanyChatPane.tsx:1876-1882) tegnes over boblen.
  Pillen har ingen luk (`setLongPressedMessageId(null)` kun ved tryk på en af tre knapper, :759-761) og klippes af
  beskedlistens `overflow-y-auto` for de øverste bobler. 📋 kopierer rå HTML (`msg.content`).
- Pin findes ikke i mobilskuffen. På almindelige bobler er pin kun desktop. På systemlinjer er pin
  `opacity-0 group-hover/msg:opacity-100` (MemberChatPane.tsx:675, CompanyChatPane.tsx:1739): usynlig på touch.
- `userSelect:none` på hele boblen (MobileMessageActionDrawer.tsx:106): tekst kan ikke markeres.
- Fjern-knappen på vedhæftnings-forhåndsvisning er `opacity-0 group-hover:opacity-100` (ChatAttachments.tsx:63).
- Berøringsflader: tilbage 32, send 36, vedhæft 32, ⋯ 28, prev/next 28 px: under 44.

## 6. Øvrigt

- Medlemmets tilbage-pil (MemberChatPane.tsx:566-571) kalder `handleBackToList` = `setShowMessages(false)` (:480-482);
  `showMessages` læses ingen steder. Knappen gør intet.
- iOS zoomer ved fokus på felter under 16 px. Målt computed font-size: editor 14 px (ChatRichInput.tsx:262 `text-sm`),
  søgefelt 15 px (`hbControlClasses`, HbField.tsx:10, brugt CompanyChatPane.tsx:1277), menuens felter 12 px (:1600-1625).
  Ingen `maximum-scale` eller 16px-regel (index.html:5, index.css). Zoom ved tryk i feltet er derfor meget sandsynlig på
  iPhone; ikke målt på enhed.
- useIsMobile er `false` ved første render (use-mobile.tsx:5,13): desktop-gren et øjeblik. Kosmetisk.

## 7. Onboarding-tjeklisten dækker sendefeltet (medlemmer)

HbMemberShell.tsx:221-234 monterer `HbOnboardingTjekliste` for alle ikke-rådgivere på alle sider. Den sammenfoldede pille er
`fixed inset-x-0 bottom-0 z-40` under lg (HbOnboardingTjekliste.tsx:414-416, :344-364). Pillen trækker sig kun på forsiden
(`pillenTraekkerSig`: `active === "boardroom"`, ankomst.ts:59), ikke på chatten. Resultat: 46 px fast bjælke over de nederste
46 af sendefeltets 99 (målt pill=46, composer=99; send-knappen ligger 30-66 px fra bunden, så ~16 px af den er dækket).
Foldes den ud, får `main` `pb-[72vh]` (HbMemberShell.tsx:98,215), også i layout="fuld": 812 - 65 - 585 = 162 px til
faner+header+sendefelt (36+57+99 = 192): beskedlisten forsvinder og sendefeltet klippes. Rammer kun medlemmer med
uafsluttet tjekliste (ikke Jonas som rådgiver, medmindre «Se som medlem»).

## Prioriteret rettelsesliste

| # | Fil:linje | Ændring | Effekt | Bevis uden skærm? |
|---|---|---|---|---|
| 1 | CompanyChatPane.tsx:1511-1522, :1523-1531, :1637-1654 | På mobil: flyt «Se tal» og prev/next ind i ⋯-menuen (:1533); «Afventer»-chippen bliver en prik på avataren. Efterlad tilbage + avatar + navn + ⋯. | Navn fra 31 px til 375 - (32+32+28 + 3x12 + 24) = 223 px | Ja: harness (`[data-name]` bredde >= 150 ved 360/375/390), ren geometri |
| 2 | HbMemberShell.tsx:221 og :98/:215; ankomst.ts:59 | Montér ikke tjeklisten når `active === "chat"` (eller udvid `pillenTraekkerSig` til chat); `tjeklisteBundluft` aldrig i `fuld` (:215). | Sendefeltet frit: 46 px bjælke væk, ingen 72vh-klemning | Ja: test af hjælpefunktion + harness (`pill` null) |
| 3 | ChatRichInput.tsx:262 (`text-sm` -> `text-base` når `isCompact`); HbField.tsx:10 (`text-[15px]` -> `max-md:text-base`); CompanyChatPane.tsx:1600-1625 (`text-xs` -> `max-md:text-base`) | 16 px i chatfelter på mobil: iOS zoomer ikke ved fokus | Ingen viewport-zoom | Delvis: computed font-size >= 16 kan måles; selve zoom kun på iPhone |
| 4 | ChatRichInput.tsx:271 (`min-h-[80px]` -> mobil `min-h-[44px]`, vokser med indhold); ChatNoegletalChip.tsx:51 (`truncate`, som SvarerPaaBanner) | Sendefelt 99 -> 63 (-36); chip-banner 74 -> 48 (-26). Medlem, tastatur 320: 235 -> 271; med svar+chip 113 -> 175. Kræver Jonas' OK (han valgte tre linjer 10/9; her kun mobil). | +36 til +62 px beskedliste ved tastatur | Ja: harness-mål af `[data-composer]` og `#msgs` |
| 5 | HbNav.tsx:14 (`h-16`) og HbMemberShell.tsx:194 | I layout="fuld" på mobil: `h-12` (48) eller skjul nav mens en samtale er åben (rådgiver har tilbage-pil). | +16 px (h-12) eller +65 px (skjult) | Ja: harness |
| 6 | MemberChatPane.tsx:566-571 | Fjern den døde tilbage-pil (medlem har én samtale) eller gør den til `navigate(-1)`. | Ingen dødt tryk | Ja: kodelæsning + test |
| 7 | MemberChatPane.tsx:508-519, :755-763; CompanyChatPane.tsx:1200-1210, :1874-1882; MobileMessageActionDrawer.tsx:106 | Fjern `longPressHandlers` + emoji-pillen (skuffen dækker reaktion/svar/redigér/slet); tilføj «Kopiér» og «Fastgør» i skuffen (:132-172); fjern `userSelect:none`. Overvej synlig «⋯» pr. boble. | Ét entydigt tryk-mønster; pin og kopiér når touch | Delvis: antal langtryks-handlere kan låses med guard-test; UX kun på enhed |
| 8 | ChatAttachments.tsx:63 | `opacity-0 group-hover:opacity-100` -> `max-md:opacity-100` | Fil kan fjernes på touch | Ja: klasse-guard |
| 9 | HbMemberShell.tsx:190-191 + ny hook (`visualViewport`); ChatRichInput.tsx:331-342; MemberChatPane.tsx:377 | iOS: `--vvh = visualViewport.height` (resize/scroll), `height: var(--vvh, 100dvh)` i layout="fuld"; erstat `scrollIntoView` med `el.scrollTo` (som CompanyChatPane.tsx:755). | Sendefelt og header bliver i billedet med iOS-tastatur | NEJ: kræver iPhone (WebKit ikke installeret her) |
| 10 | CompanyChatPane.tsx:128-160 (HbMenu) | På mobil: bundskuffe (Drawer, som «Se tal» :2147) frem for `absolute w-56` | Formularen afskæres ikke af `overflow-hidden` med tastatur | Delvis: harness kan måle klipning; ikke bygget |

Genkør målinger: `cd .../scratchpad/h && node_modules/.bin/vite --config vite.config.mjs &` og `python3 sum.py`.
