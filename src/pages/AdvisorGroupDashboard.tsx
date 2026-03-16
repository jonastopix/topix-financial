import { Navigate, useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useAdvisorGroupDashboard } from "@/hooks/useAdvisorGroupDashboard";
import GroupDashboardContent from "@/components/GroupDashboardContent";

const AdvisorGroupDashboard = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { isAdvisor, loading } = useAuth();
  const { companies, aggregates, isLoading, error, groupName } = useAdvisorGroupDashboard(groupId);

  if (!loading && !isAdvisor) {
    return <Navigate to="/" replace />;
  }

  // RPC access denied → redirect
  if (error) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <GroupDashboardContent
        companies={companies}
        aggregates={aggregates}
        isLoading={isLoading}
        groupName={groupName}
      />
    </AppLayout>
  );
};

export default AdvisorGroupDashboard;
