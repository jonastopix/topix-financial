import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function GuidedTour({ onComplete }: { onComplete: () => void }) {
  const navigate = useNavigate();

  useEffect(() => {
    onComplete();
    navigate("/guide");
  }, []);

  return null;
}
