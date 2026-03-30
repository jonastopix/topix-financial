import { Navigate, useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useAdvisorGroupDashboard } from "@/hooks/useAdvisorGroupDashboard";
import GroupDashboardContent from "@/components/GroupDashboardContent";

const AdvisorGroupDashboard = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { isAdvisor, loading, setCompanyOverride } = useAuth();
  const { companies, aggregates, isLoading, error, groupName } = useAdvisorGroupDashboard(groupId);
  const navigate = useNavigate();

  if (!loading && !isAdvisor) {
    return <Navigate to="/" replace />;
  }

  // RPC access denied → redirect
  if (error) {
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

  return (
    <AppLayout>
      <GroupDashboardContent
        companies={companies}
        aggregates={aggregates}
        isLoading={isLoading}
        groupName={groupName}
        onCompanyClick={handleCompanyClick}
        onUploadClick={handleUploadClick}
      />
    </AppLayout>
  );
};

export default AdvisorGroupDashboard;
