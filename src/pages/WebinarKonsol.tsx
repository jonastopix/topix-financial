import "@/styles/hjemmebane.css";
import { useParams } from "react-router-dom";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { WebinarKonsol as Konsol } from "@/components/hjemmebane/webinarMotor/WebinarKonsol";

/** /webinar/motor/session/:id (3/10-2026) — værtskonsollen, minimal (docs/webinarmotor.md §7.7).
    Gates af AdvisorRoute (App.tsx), i INGEN menu — nås fra sessionens række på /webinar/motor.
    Tynd wrapper i Hb-skallen, som /webinar/motor; fladen er WebinarKonsol, dommen lib/webinarMotorAdmin/konsol. */
const WebinarKonsol = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <HbMemberShell active="webinar">
      <Konsol sessionId={id} />
    </HbMemberShell>
  );
};

export default WebinarKonsol;
