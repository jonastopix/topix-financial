import "@/styles/hjemmebane.css";
import { useParams } from "react-router-dom";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { EventDetailView } from "@/components/hjemmebane/events/EventDetailView";

/** /events/:id — eventsiden (Events-miljøets trin 2). Akademiet-
    mønstret: parameteren læses HER og gives som prop; ikke-fundet
    håndteres blødt i view'et. */
const EventDetail = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <HbMemberShell active="events">
      <EventDetailView eventId={id ?? ""} />
    </HbMemberShell>
  );
};

export default EventDetail;
