import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, MessageSquare, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";

const Community = () => {
  const { user } = useAuth();

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["circle-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("circle_activity")
        .select("*")
        .eq("activity_type", "event")
        .order("activity_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ["circle-posts"],
    queryFn: async () => {
      const { data: activities, error } = await supabase
        .from("circle_activity")
        .select("*")
        .eq("activity_type", "post")
        .order("activity_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      if (!activities?.length) return [];

      const memberIds = [...new Set(activities.map((a) => a.circle_member_id))];
      let memberMap = new Map<number, string>();
      if (memberIds.length > 0) {
        const { data: members } = await supabase
          .from("circle_members")
          .select("circle_id, name, email")
          .in("circle_id", memberIds);
        memberMap = new Map(
          (members ?? []).map((m) => [m.circle_id, m.name || m.email?.split("@")[0] || "Ukendt"])
        );
      }
      return activities.map((a) => ({
        ...a,
        member_name: memberMap.get(a.circle_member_id) ?? "Ukendt",
      }));
    },
    enabled: !!user,
  });

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-8">
        <h1 className="text-2xl font-bold text-foreground">Community</h1>

        {/* Section 1: Kommende events */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Kommende events</h2>
          </div>
          {eventsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : !events?.length ? (
            <Card>
              <CardContent className="py-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ingen kommende events — tjek app.topix.dk for opdateringer
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href="https://app.topix.dk/c/calendar/" target="_blank" rel="noopener noreferrer">
                    Åbn kalender
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {events.map((event) => (
                <Card key={event.id}>
                  <CardContent className="py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{event.title ?? "Event"}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(event.activity_at), "d. MMMM yyyy", { locale: da })}
                      </p>
                    </div>
                    <a
                      href="https://app.topix.dk/c/calendar/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline whitespace-nowrap flex items-center gap-1"
                    >
                      Se event
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Community aktivitet */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Seneste i community</h2>
          </div>
          {postsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : !posts?.length ? (
            <p className="text-sm text-muted-foreground">Ingen aktivitet endnu</p>
          ) : (
            <div className="grid gap-3">
              {posts.map((post) => {
                const memberName = post.member_name;
                const preview =
                  post.content_preview && post.content_preview.length > 120
                  post.content_preview && post.content_preview.length > 120
                    ? post.content_preview.slice(0, 120) + "…"
                    : post.content_preview;
                return (
                  <Card key={post.id}>
                    <CardContent className="py-4 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{memberName}</span>
                        {post.space_name && (
                          <Badge variant="secondary" className="text-xs">
                            {post.space_name}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                          {formatDistanceToNow(new Date(post.activity_at), {
                            addSuffix: true,
                            locale: da,
                          })}
                        </span>
                      </div>
                      {post.title && (
                        <p className="font-medium text-foreground text-sm">{post.title}</p>
                      )}
                      {preview && (
                        <p className="text-xs text-muted-foreground">{preview}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 3: Link til community */}
        <section>
          <Card>
            <CardContent className="py-6 text-center space-y-3">
              <Button asChild className="bg-primary hover:bg-primary/90">
                <a href="https://app.topix.dk/c/" target="_blank" rel="noopener noreferrer">
                  Åbn The Boardroom community
                  <ExternalLink className="ml-1.5 h-4 w-4" />
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                Du skal være logget ind på app.topix.dk for at se indholdet.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </AppLayout>
  );
};

export default Community;
