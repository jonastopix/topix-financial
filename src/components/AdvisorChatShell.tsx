import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CompanyChatPane from "@/components/CompanyChatPane";
import AdvisorGroupChatPane from "@/components/AdvisorGroupChatPane";
import { MessageCircle, Layers } from "lucide-react";

/**
 * Advisor chat shell: two tabs — Virksomheder (company chat) and Koncerner (group chat).
 * Rendered inside ChatShell for advisors.
 */
const AdvisorChatShell = () => {
  return (
    <Tabs defaultValue="companies" className="flex flex-col h-full">
      <TabsList className="mx-4 mt-2 mb-0 self-start">
        <TabsTrigger value="companies" className="flex items-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5" />
          Virksomheder
        </TabsTrigger>
        <TabsTrigger value="groups" className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          Koncerner
        </TabsTrigger>
      </TabsList>

      <TabsContent value="companies" className="flex-1 flex flex-col min-h-0 mt-0">
        <CompanyChatPane />
      </TabsContent>

      <TabsContent value="groups" className="flex-1 flex flex-col min-h-0 mt-0">
        <AdvisorGroupChatPane />
      </TabsContent>
    </Tabs>
  );
};

export default AdvisorChatShell;
