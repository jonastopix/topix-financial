/**
 * driftModtager — HVEM får en mail, når noget går galt i driften (Jonas 21/9-2026:
 * «når noget går galt, skal kun være Jonas»).
 *
 * ÉT STED. Alarmerne (gensenderen klaviyo-gensend-cron, profil-cronen
 * klaviyo-profil-cron og klokkemailens ALARM i klokke-mail-cron) sender hertil —
 * IKKE til raadgiverModtager, som er ansøgningskøens rådgiveradresse (kontakt@)
 * og skifter tilbage til kontakt@ 19/10-2026 af sig selv. En driftsalarm skal
 * ikke følge med det skift.
 *
 * Adressen er jonas@theboardroom.dk — samme domæne som afsenderen
 * (notify.theboardroom.dk), bekræftet virkende 18/9 (raadgiverModtager.ts).
 * Kildeværnet klokkeMail.guard låser, at adressen som streng kun står her og i
 * raadgiverModtager.ts (den midlertidige omvej), og at de tre alarmer kalder
 * driftModtager().
 */
export const DRIFT_MODTAGER = "jonas@theboardroom.dk";

/** Driftsalarmernes modtager. Ren; tager ingen tid ind — der er intet skift at regne på. */
export function driftModtager(): string {
  return DRIFT_MODTAGER;
}
