import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { WebinarMotorOpsaetning } from "@/components/hjemmebane/webinarMotor/WebinarMotorOpsaetning";

/** /webinar/motor (skive 3, 30/9-2026) — rådgiverens opsætning af webinarmotoren:
    webinar, sessioner (intern ja/nej) og tidslinjen. Gates af AdvisorRoute
    (App.tsx), i INGEN menu endnu (Jonas 30/9). Tynd wrapper i Hb-skallen, som
    /webinar; fladen er WebinarMotorOpsaetning, dommen lib/webinarMotorAdmin. */
const WebinarMotor = () => (
  <HbMemberShell active="webinar">
    <WebinarMotorOpsaetning />
  </HbMemberShell>
);

export default WebinarMotor;
