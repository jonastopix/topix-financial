

# Fjern email-whitelist fra send-report-reminder

## Hvad aendres

I filen `supabase/functions/send-report-reminder/index.ts` fjernes den hardcodede `EMAIL_WHITELIST` og den tilhoerende filtreringslogik, sa rapport-pamindelser sendes til alle medlemmer af aktive virksomheder der mangler rapporter.

## Teknisk plan

**Fil:** `supabase/functions/send-report-reminder/index.ts`

1. Fjern `EMAIL_WHITELIST`-arrayet (linje ~97)
2. Fjern whitelist-checket i for-loopet (linje ~119-123) der blokkerer emails til adresser uden for listen
3. Behold `EMAIL_SENDING_ENABLED`-togglen som sikkerhedsnet -- nar den er `false`, logges emails stadig uden at blive sendt (test-mode)
4. Nar `EMAIL_SENDING_ENABLED` er `true`, sendes emails til alle relevante modtagere

Resultatet er at den eneste "gate" for afsendelse bliver `EMAIL_SENDING_ENABLED`-secret'en, som allerede er konfigureret i backend.

