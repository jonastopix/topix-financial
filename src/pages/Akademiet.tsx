import "@/styles/hjemmebane.css";
import { useParams } from "react-router-dom";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { ForsideView } from "@/components/hjemmebane/akademi/views/ForsideView";
import { OmraadeView } from "@/components/hjemmebane/akademi/views/OmraadeView";
import { ElementView } from "@/components/hjemmebane/akademi/views/ElementView";

/** /akademiet — medlemsvisningen (C1 trin 3). Én side, tre dybder styret af
    params: forside (fortsæt hvor du slap) → område → element. Læsning gates
    af RLS's published-gate; dryp filtreres i app-laget (B6, D5/D6). */
const Akademiet = () => {
  const { area, slug } = useParams<{ area?: string; slug?: string }>();

  return (
    <HbMemberShell active="akademiet">
      {area && slug ? (
        <ElementView areaKey={area} slug={slug} />
      ) : area ? (
        <OmraadeView areaKey={area} />
      ) : (
        <ForsideView />
      )}
    </HbMemberShell>
  );
};

export default Akademiet;
