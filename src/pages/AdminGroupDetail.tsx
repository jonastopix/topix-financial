import { Navigate, useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useAdminGroupDashboard } from "@/hooks/useAdminGroupDashboard";
import GroupDashboardContent from "@/components/GroupDashboardContent";
import { ArrowLeft } from "lucide-react";

const AdminGroupDetail = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const { companies, aggregates, isLoading, error, groupName } = useAdminGroupDashboard(groupId);

  if (!loading && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (error) {
    return <Navigate to="/admin/groups" replace />;
  }

  return (
    <AppLayout>
      <button
        onClick={() => navigate("/admin/groups")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Tilbage til koncernoversigt
      </button>
      <GroupDashboardContent
        companies={companies}
        aggregates={aggregates}
        isLoading={isLoading}
        groupName={groupName}
      />
    </AppLayout>
  );
};

export default AdminGroupDetail;
