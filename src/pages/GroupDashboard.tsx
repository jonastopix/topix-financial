import { Navigate, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useGroupDashboard } from "@/hooks/useGroupDashboard";
import GroupDashboardContent from "@/components/GroupDashboardContent";
import { MessageCircle, Calculator } from "lucide-react";

const GroupDashboard = () => {
  const { isGroupUser, isAdvisor, loading } = useAuth();
  const { companies, aggregates, isLoading, groupName } = useGroupDashboard();
  const navigate = useNavigate();

  // Page-level guard: member-only, group-only
  if (!loading && !isGroupUser) {
    return <Navigate to="/" replace />;
  }

  const actions = (
    <>
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
      <GroupDashboardContent
        companies={companies}
        aggregates={aggregates}
        isLoading={isLoading}
        groupName={groupName}
        actions={actions}
      />
    </AppLayout>
  );
};

export default GroupDashboard;
