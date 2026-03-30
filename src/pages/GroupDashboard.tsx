import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useGroupDashboard } from "@/hooks/useGroupDashboard";
import GroupDashboardContent from "@/components/GroupDashboardContent";
import GroupWelcomeBanner from "@/components/GroupWelcomeBanner";
import CreateGroupCompanyDialog from "@/components/CreateGroupCompanyDialog";
import CommunityProgress from "@/components/CommunityProgress";
import GroupSettings from "@/components/GroupSettings";
import GroupLeaderboard from "@/components/GroupLeaderboard";
import { MessageCircle, Calculator, Plus, Settings } from "lucide-react";

const GroupDashboard = () => {
  const { isGroupUser, isGroupOwner, isAdvisor, loading, groupId, user, setCompanyOverride } = useAuth();
  const { companies, aggregates, isLoading, groupName } = useGroupDashboard();
  const navigate = useNavigate();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Page-level guard: member-only, group-only
  if (!loading && !isGroupUser) {
    return <Navigate to="/" replace />;
  }

  const handleCompanyClick = (companyId: string, companyName: string) => {
    setCompanyOverride(companyId, companyName);
    navigate("/kpis");
  };

  const handleUploadClick = (companyId: string, companyName: string) => {
    setCompanyOverride(companyId, companyName);
    navigate("/reports");
  };

  const handleBudgetClick = (companyId: string, companyName: string) => {
    setCompanyOverride(companyId, companyName);
    navigate("/budget");
  };

  const actions = (
    <>
      {isGroupOwner && (
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <Settings className="h-4 w-4" />
          Indstillinger
        </button>
      )}
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
        onCompanyClick={handleCompanyClick}
        onUploadClick={handleUploadClick}
      />
      {isGroupOwner && showSettings && groupId && user && (
        <div className="mt-6">
          <GroupSettings
            groupId={groupId}
            groupName={groupName}
            companies={companies}
            userId={user.id}
          />
        </div>
      )}
      {companies.length > 1 && (
        <div className="mt-6">
          <GroupLeaderboard companies={companies} />
        </div>
      )}
      <div className="mt-6">
        <CommunityProgress />
      </div>
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
