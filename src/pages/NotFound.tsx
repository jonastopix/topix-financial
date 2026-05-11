import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div data-canary="update-2026-05-11" className="flex min-h-screen items-start justify-center bg-background p-4 pt-8 pb-safe overflow-y-auto">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold text-foreground">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Siden blev ikke fundet</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Gå til forsiden
        </a>
        <p className="mt-8 text-xs text-muted-foreground/40">canary: update-2026-05-11</p>
      </div>
    </div>
  );
};

export default NotFound;
