import "@/styles/hjemmebane.css";
import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HB_EYEBROW, HB_H1, HB_RAMME } from "@/components/hjemmebane/hbFormKlasser";

/* 404 — Hjemmebane (indgangen-overhaling §7.6). Kort og roligt: hvad der
   skete, og én vej tilbage. Loglinjen er bevaret som før. Er man ikke
   logget ind, sender «Til forsiden» videre til /auth via ruten. */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className={HB_RAMME}>
      <div className="mx-auto max-w-md space-y-8">
        <div className="space-y-3 text-center">
          <p className={HB_EYEBROW}>The Boardroom</p>
          <h1 className={HB_H1}>Siden findes ikke</h1>
          <p className="text-hb-ink-soft">
            Adressen peger på noget, der ikke er her — måske er linket gammelt, eller stien stavet forkert.
          </p>
        </div>
        <div className="text-center">
          <Link to="/">
            <HbButton variant="secondary">Til forsiden</HbButton>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
