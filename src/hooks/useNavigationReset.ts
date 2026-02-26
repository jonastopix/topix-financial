import { useLocation } from "react-router-dom";

export function useNavigationReset(): number | null {
  const location = useLocation();
  return (location.state as any)?.resetKey || null;
}
