import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { X, Info } from "lucide-react";

const TABS = [
  { value: "events", label: "Events", src: "https://app.topix.dk/c/calendar/?iframe=true" },
  { value: "community", label: "Community", src: "https://app.topix.dk/c/community/?iframe=true" },
  { value: "classroom", label: "Classroom", src: "https://app.topix.dk/c/classroom/?iframe=true" },
] as const;

const Community = () => {
  const [activeTab, setActiveTab] = useState<string>("events");
  const [iframeLoading, setIframeLoading] = useState<Record<string, boolean>>({});
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem("circle_banner_dismissed") === "true"
  );

  const dismissBanner = () => {
    localStorage.setItem("circle_banner_dismissed", "true");
    setBannerDismissed(true);
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Community</h1>

        {!bannerDismissed && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
            <Info className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm text-foreground flex-1">
              Du skal være logget ind på app.topix.dk for at se indholdet herunder.
            </span>
            <a
              href="https://app.topix.dk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-amber-700 hover:text-amber-800 whitespace-nowrap"
            >
              Åbn app.topix.dk
            </a>
            <button
              onClick={dismissBanner}
              className="p-1 rounded hover:bg-amber-500/20 transition-colors"
              aria-label="Luk"
            >
              <X className="h-4 w-4 text-amber-600" />
            </button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              <div className="relative">
                {iframeLoading[tab.value] !== false && activeTab === tab.value && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ height: "calc(100vh - 200px)" }}>
                    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  </div>
                )}
                {activeTab === tab.value && (
                  <iframe
                    src={tab.src}
                    style={{ border: 0, width: "100%", height: "calc(100vh - 200px)" }}
                    onLoad={() => setIframeLoading((prev) => ({ ...prev, [tab.value]: false }))}
                  />
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Community;
