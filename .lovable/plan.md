

## Email System Audit — Resultater

### Status: 3 problemer fundet, 2 allerede løst, 1 åben

---

### Problem 1: Dobbelt chat-notifikation (`advisor_replied` + `chat_reply`) ✅ LØST
**Status:** Koden er deployeret og virker. Ingen nye `advisor_replied`-notifikationer siden deployment. Der er **1 stale `advisor_replied`** fra d. 7/4 kl. 18:41 (René Larsen) der stadig ikke er markeret — den vil blive plukket af næste cron-kørsel og aggregeret korrekt med hans chat-notifikationer.

**Anbefaling:** Ingen yderligere handling nødvendig. Cron-systemet håndterer den korrekt nu.

---

### Problem 2: `report_review_ready` / `report_error` duplikater ✅ IKKE ET PROBLEM
Duplikaterne skyldes **forskellige rapport-uploads** (unikke `reference_id`). Eksempel: Jonas test-virksomhed uploadede 7 rapporter d. 1/4 → 7 separate notifikationer. Sarah Fjeldgaard uploadede 8 gange med fejl → 8 `report_error`. **Dette er korrekt opførsel** — hver upload er en separat handling.

---

### Problem 3: `report-reminder` cron-job aldrig kaldt ✅ LØST
Fixet i forrige session ved at opdatere cron-jobbet med korrekt URL. Næste afsendelse: 15. april kl. 09:00.

---

### Problem 4: `report_committed` emails sendes til advisors ⚠️ ÅBEN
Jonas Herlev og Morten Larsen (begge advisors) har fået **17 `report_committed`-notifikationer** hver de seneste 14 dage. Selv om e-mails til advisors undertrykkes af `ADVISOR_EMAIL_DISABLED`, genereres der stadig in-app notifikationer. Det er ikke en fejl i sig selv (de kan bruges i advisor-dashboardet), men det oppuster `notifications`-tabellen.

**Anbefaling:** Ikke kritisk — notifikationerne undertrykkes korrekt for e-mail. Kan optimeres senere hvis ønsket.

---

### Problem 5: Stale `pending`-rækker i email_send_log ✅ LØST
Email-log-dashboardet deduplikerer nu korrekt på `message_id` og viser kun den seneste status.

---

### Opsummering

| System | Status |
|--------|--------|
| Chat-notifikationer | ✅ Fixet — ingen dobbelt-emails mere |
| Chat-aggregering | ✅ Virker — én samlet email per bruger |
| Rapport-notifikationer | ✅ Korrekt — én per upload |
| Rapport-påmindelser | ✅ Fixet — kører fra 15. april |
| Invitation-emails | ✅ Fungerer korrekt |
| Signup/recovery | ✅ Fungerer korrekt |
| Session-booking | ✅ Fungerer korrekt |
| Advisor email-suppression | ✅ Virker — advisors får ikke emails |
| DLQ (fejlede mails) | 8 invitationer + 1 signup i DLQ — sandsynligvis ugyldige adresser |

**Ingen yderligere kodeændringer er nødvendige.**

