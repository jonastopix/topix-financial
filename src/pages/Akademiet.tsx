import "@/styles/hjemmebane.css";
import { useParams } from "react-router-dom";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { ForsideView } from "@/components/hjemmebane/akademi/views/ForsideView";
import { OmraadeView } from "@/components/hjemmebane/akademi/views/OmraadeView";
import { ElementView } from "@/components/hjemmebane/akademi/views/ElementView";
import { KursusView } from "@/components/hjemmebane/akademi/views/KursusView";
import { useAkademiData } from "@/components/hjemmebane/akademi/useAkademiData";

/** Element eller kursus? Items slås op FØRST: item- og collection-slugs
    bor i adskilte tabeller uden kryds-constraint, så det samme slug kan
    i teorien findes begge steder — og elementet vinder, så et element
    aldrig skygges af en samling. Findes slug'en kun blandt samlingerne,
    vises KursusView; findes den ingen steder, viser ElementView sin
    bløde ikke-fundet-tekst som hidtil. Under indlæsning falder vi også
    til ElementView, som selv viser "Henter…". */
const ElementEllerKursusView = ({ areaKey, slug }: { areaKey: string; slug: string }) => {
  const data = useAkademiData();
  if (!data.loading && !data.bySlug.has(slug) && data.collectionBySlug.has(slug)) {
    return <KursusView areaKey={areaKey} slug={slug} />;
  }
  return <ElementView areaKey={areaKey} slug={slug} />;
};

/** /akademiet — medlemsvisningen (C1 trin 3). Én side, fire dybder styret
    af params: forside (fortsæt hvor du slap) → område → element ELLER
    kursus. Læsning gates af RLS's published-gate; dryp filtreres i
    app-laget (B6, D5/D6). */
const Akademiet = () => {
  const { area, slug } = useParams<{ area?: string; slug?: string }>();

  return (
    <HbMemberShell active="akademiet">
      {area && slug ? (
        <ElementEllerKursusView areaKey={area} slug={slug} />
      ) : area ? (
        <OmraadeView areaKey={area} />
      ) : (
        <ForsideView />
      )}
    </HbMemberShell>
  );
};

export default Akademiet;
