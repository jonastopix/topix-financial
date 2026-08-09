import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { EventsView } from "@/components/hjemmebane/events/EventsView";

/** /events — Events-miljøets trin 1: medlemmets eventliste (Handout.tsx-
    mønstret: tynd wrapper i Hb-medlemsskallen). Tilmelding og eventsider
    er trin 2/3. */
const Events = () => (
  <HbMemberShell active="events">
    <EventsView />
  </HbMemberShell>
);

export default Events;
