import { createContext, useContext, useState, useCallback } from "react";

interface ViewModeContext {
  /** True when an advisor is previewing as a member */
  viewingAsMember: boolean;
  toggleViewMode: () => void;
}

const ViewModeContext = createContext<ViewModeContext>({
  viewingAsMember: false,
  toggleViewMode: () => {},
});

export const useViewMode = () => useContext(ViewModeContext);

export const ViewModeProvider = ({ children }: { children: React.ReactNode }) => {
  const [viewingAsMember, setViewingAsMember] = useState(false);
  const toggleViewMode = useCallback(() => setViewingAsMember((v) => !v), []);

  return (
    <ViewModeContext.Provider value={{ viewingAsMember, toggleViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
};
