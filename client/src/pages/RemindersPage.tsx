import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Conversation } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, Calendar, Clock, AlertCircle, CheckCircle2, Trash2, Loader2 } from "lucide-react";

type ReminderFilter = "all" | "overdue" | "today" | "upcoming";

export default function RemindersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ReminderFilter>("all");

  const { data: conversations = [], isLoading, refetch } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations", "reminders-page"],
    queryFn: async () => {
      const res = await fetch("/api/conversations");
      if (!res.ok) throw new Error("No se pudo cargar recordatorios");
      return res.json();
    },
  });

  const clearReminderMutation = useMutation({
    mutationFn: async (conversationId: number) => {
      const res = await fetch(`/api/conversations/${conversationId}/reminder`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error?.message || "Error al eliminar recordatorio");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", "reminders-page"] });
      toast({ title: "Recordatorio eliminado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const reminderGroups = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endToday = new Date(startToday);
    endToday.setDate(endToday.getDate() + 1);

    const all = conversations
      .filter((c) => !!c.reminderAt)
      .map((c) => ({
        ...c,
        reminderDate: new Date(c.reminderAt as Date | string),
      }))
      .filter((c) => !Number.isNaN(c.reminderDate.getTime()))
      .sort((a, b) => a.reminderDate.getTime() - b.reminderDate.getTime());

    const overdue = all.filter((c) => c.reminderDate < startToday);
    const today = all.filter((c) => c.reminderDate >= startToday && c.reminderDate < endToday);
    const upcoming = all.filter((c) => c.reminderDate >= endToday);

    return { all, overdue, today, upcoming };
  }, [conversations]);

  const visibleReminders = useMemo(() => {
    if (filter === "overdue") return reminderGroups.overdue;
    if (filter === "today") return reminderGroups.today;
    if (filter === "upcoming") return reminderGroups.upcoming;
    return reminderGroups.all;
  }, [filter, reminderGroups]);

  const formatReminder = (dateStr: string | Date | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleString("es-BO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-reminders">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Recordatorios</h1>
          <Link href="/follow-up">
            <Button variant="outline" size="sm" data-testid="button-go-followup">
              Seguimiento
            </Button>
          </Link>
          <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh-reminders-page">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <Card className="mb-5">
          <CardContent className="pt-4">
            <div className="flex gap-2 flex-wrap">
              <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")} data-testid="filter-reminders-all">
                <Calendar className="h-4 w-4 mr-2" />
                Todos ({reminderGroups.all.length})
              </Button>
              <Button variant={filter === "overdue" ? "default" : "outline"} size="sm" onClick={() => setFilter("overdue")} data-testid="filter-reminders-overdue">
                <AlertCircle className="h-4 w-4 mr-2" />
                Vencidos ({reminderGroups.overdue.length})
              </Button>
              <Button variant={filter === "today" ? "default" : "outline"} size="sm" onClick={() => setFilter("today")} data-testid="filter-reminders-today">
                <Clock className="h-4 w-4 mr-2" />
                Hoy ({reminderGroups.today.length})
              </Button>
              <Button variant={filter === "upcoming" ? "default" : "outline"} size="sm" onClick={() => setFilter("upcoming")} data-testid="filter-reminders-upcoming">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Proximos ({reminderGroups.upcoming.length})
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : visibleReminders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay recordatorios en esta vista</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleReminders.map((conv) => (
              <Card key={conv.id} data-testid={`reminder-card-${conv.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base">{conv.contactName || conv.waId}</CardTitle>
                    <Badge variant="outline" className="border-amber-500 text-amber-700">
                      {formatReminder(conv.reminderAt)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground break-words">
                    {conv.reminderNote?.trim() || "Sin nota"}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Link href="/">
                      <Button variant="outline" size="sm" data-testid={`button-open-chat-${conv.id}`}>
                        Ver chat
                      </Button>
                    </Link>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => clearReminderMutation.mutate(conv.id)}
                      disabled={clearReminderMutation.isPending}
                      data-testid={`button-clear-reminder-${conv.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
