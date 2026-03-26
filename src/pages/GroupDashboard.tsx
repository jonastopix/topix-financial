import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useGroupDashboard } from "@/hooks/useGroupDashboard";
import GroupDashboardContent from "@/components/GroupDashboardContent";
import GroupWelcomeBanner from "@/components/GroupWelcomeBanner";
import CreateGroupCompanyDialog from "@/components/CreateGroupCompanyDialog";
import CommunityProgress from "@/components/CommunityProgress";
import { MessageCircle, Calculator, Plus } from "lucide-react";

const GroupDashboard = () => {
  const { isGroupUser, isGroupOwner, isAdvisor, loading, groupId } = useAuth();
  const { companies, aggregates, isLoading, groupName } = useGroupDashboard();
  const navigate = useNavigate();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Page-level guard: member-only, group-only
  if (!loading && !isGroupUser) {
    return <Navigate to="/" replace />;
  }

  const actions = (
    <>
      {isGroupOwner && (
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Opret selskab
        </button>
      )}
      {!isAdvisor && (
        <button
          onClick={() => navigate("/group/budget")}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <Calculator className="h-4 w-4" />
          Budget
        </button>
      )}
      <button
        onClick={() => navigate("/chat")}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <MessageCircle className="h-4 w-4" />
        Chat
      </button>
    </>
  );

  return (
    <AppLayout>
      <GroupWelcomeBanner variant="full" />
      <GroupDashboardContent
        companies={companies}
        aggregates={aggregates}
        isLoading={isLoading}
        groupName={groupName}
        actions={actions}
      />
      {groupId && (
        <CreateGroupCompanyDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          groupId={groupId}
        />
      )}
    </AppLayout>
  );
};

export default GroupDashboard;
