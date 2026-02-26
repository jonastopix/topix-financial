import { Skeleton } from "@/components/ui/skeleton";

export function KPICardSkeleton() {
  return (
    <div className="rounded-xl border border-border/30 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>
      <Skeleton className="h-7 w-28" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-14" />
      </div>
      <Skeleton className="h-8 w-full rounded" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-[200px] w-full rounded-lg" />
    </div>
  );
}

export function WidgetSkeleton() {
  return (
    <div className="glass-card rounded-xl p-5 space-y-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-8 w-full rounded mt-2" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Greeting */}
      <div className="mb-8">
        <Skeleton className="h-9 w-64 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>

      {/* KPI cards – month */}
      <div>
        <Skeleton className="h-3 w-32 mb-3" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <KPICardSkeleton />
          <KPICardSkeleton />
          <KPICardSkeleton />
          <KPICardSkeleton />
        </div>
      </div>

      {/* KPI cards – YTD */}
      <div>
        <Skeleton className="h-3 w-28 mb-3" />
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <KPICardSkeleton />
          <KPICardSkeleton />
          <KPICardSkeleton />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4">
          <ChartSkeleton />
        </div>
        <div className="lg:col-span-8">
          <ChartSkeleton />
        </div>
      </div>

      {/* Widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <WidgetSkeleton />
        <WidgetSkeleton />
        <WidgetSkeleton />
        <WidgetSkeleton />
      </div>
    </div>
  );
}
