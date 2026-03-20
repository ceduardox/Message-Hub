import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Conversation } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  RefreshCw,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Pencil,
  Loader2,
  ClipboardList,
  List,
  CalendarDays,
} from "lucide-react";

type ReminderFilter = "all" | "overdue" | "today" | "upcoming";
type ReminderView = "list" | "calendar";

type ReminderConversation = Conversation & { reminderDate: Date };

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export default function RemindersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ReminderFilter>("all");
  const [view, setView] = useState<ReminderView>("list");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [editingReminder, setEditingReminder] = useState<ReminderConversation | null>(null);
  const [editReminderAtInput, setEditReminderAtInput] = useState("");
  const [editReminderNoteInput, setEditReminderNoteInput] = useState("");

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

  const updateReminderMutation = useMutation({
    mutationFn: async ({ conversationId, reminderAt, reminderNote }: { conversationId: number; reminderAt: string; reminderNote?: string }) => {
      const reminderDate = new Date(reminderAt);
      if (Number.isNaN(reminderDate.getTime())) {
        throw new Error("Fecha de recordatorio invalida");
      }
      const res = await fetch(`/api/conversations/${conversationId}/reminder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminderAt: reminderDate.toISOString(),
          reminderNote: reminderNote?.trim() || null,
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error?.message || "Error al actualizar recordatorio");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", "reminders-page"] });
      setEditingReminder(null);
      toast({ title: "Recordatorio actualizado" });
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

  const visibleReminders = useMemo<ReminderConversation[]>(() => {
    if (filter === "overdue") return reminderGroups.overdue;
    if (filter === "today") return reminderGroups.today;
    if (filter === "upcoming") return reminderGroups.upcoming;
    return reminderGroups.all;
  }, [filter, reminderGroups]);

  const remindersByDay = useMemo(() => {
    const grouped = new Map<string, ReminderConversation[]>();
    for (const reminder of visibleReminders) {
      const key = dayKey(reminder.reminderDate);
      const list = grouped.get(key) || [];
      list.push(reminder);
      grouped.set(key, list);
    }
    return grouped;
  }, [visibleReminders]);

  const reminderDates = useMemo(() => {
    const dates: Date[] = [];
    for (const reminder of visibleReminders) {
      dates.push(new Date(reminder.reminderDate.getFullYear(), reminder.reminderDate.getMonth(), reminder.reminderDate.getDate()));
    }
    return dates;
  }, [visibleReminders]);

  const selectedDayReminders = useMemo(() => {
    const key = dayKey(selectedDate);
    return remindersByDay.get(key) || [];
  }, [selectedDate, remindersByDay]);

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

  const formatTimeOnly = (dateStr: string | Date | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleTimeString("es-BO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const toDateTimeLocalValue = (value?: string | Date | null) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const tzOffset = parsed.getTimezoneOffset() * 60_000;
    return new Date(parsed.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const openEditReminder = (conv: ReminderConversation) => {
    setEditingReminder(conv);
    setEditReminderAtInput(toDateTimeLocalValue(conv.reminderAt));
    setEditReminderNoteInput(conv.reminderNote || "");
  };

  const renderReminderCard = (conv: ReminderConversation, compact = false) => (
    <Card
      key={conv.id}
      data-testid={`reminder-card-${conv.id}`}
      className={cn(
        "border-slate-700/60 bg-slate-900/55 backdrop-blur-sm shadow-[0_10px_28px_rgba(2,6,23,.35)]",
        compact ? "ring-1 ring-emerald-500/15" : "hover:border-slate-600/80 transition-colors",
      )}
    >
      <CardHeader className={compact ? "pb-2 pt-4" : "pb-2"}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base text-slate-100">{conv.contactName || conv.waId}</CardTitle>
          <Badge variant="outline" className="border-amber-400/70 bg-amber-500/10 text-amber-300 font-semibold">
            {compact ? formatTimeOnly(conv.reminderAt) : formatReminder(conv.reminderAt)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-slate-300 break-words">{conv.reminderNote?.trim() || "Sin nota"}</p>
        <div className="mt-3 flex gap-2">
          <Link href={`/?conversationId=${conv.id}`}>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-500/80 bg-slate-800/70 text-slate-100 hover:bg-slate-700/80"
              data-testid={`button-open-chat-${conv.id}`}
            >
              Ver chat
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="border-cyan-500/50 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
            onClick={() => openEditReminder(conv)}
            data-testid={`button-edit-reminder-${conv.id}`}
          >
            <Pencil className="h-4 w-4 mr-1" />
            Editar
          </Button>
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
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Link href="/">
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-300 hover:text-white hover:bg-slate-800/70"
              data-testid="button-back-reminders"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Recordatorios</h1>
          <Link href="/follow-up">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-600/70 bg-slate-900/40 text-slate-100 hover:bg-slate-800/70"
              data-testid="button-go-followup"
            >
              <ClipboardList className="h-4 w-4 mr-2" />
              Seguimiento
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-300 hover:text-white hover:bg-slate-800/70"
            onClick={() => refetch()}
            data-testid="button-refresh-reminders-page"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant={view === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("list")}
              className={cn(
                view === "list"
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-400 shadow-[0_8px_20px_rgba(16,185,129,.3)]"
                  : "border-slate-600/70 bg-slate-900/40 text-slate-100 hover:bg-slate-800/70",
              )}
              data-testid="button-reminders-view-list"
            >
              <List className="h-4 w-4 mr-2" />
              Lista
            </Button>
            <Button
              variant={view === "calendar" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("calendar")}
              className={cn(
                view === "calendar"
                  ? "bg-cyan-500 hover:bg-cyan-600 text-white border-cyan-400 shadow-[0_8px_20px_rgba(6,182,212,.3)]"
                  : "border-slate-600/70 bg-slate-900/40 text-slate-100 hover:bg-slate-800/70",
              )}
              data-testid="button-reminders-view-calendar"
            >
              <CalendarDays className="h-4 w-4 mr-2" />
              Calendario
            </Button>
          </div>
        </div>

        <Card className="mb-5 border-slate-700/60 bg-slate-900/55 backdrop-blur-sm shadow-[0_10px_28px_rgba(2,6,23,.35)]">
          <CardContent className="pt-4">
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={filter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("all")}
                className={cn(
                  filter === "all"
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-400"
                    : "border-slate-600/70 bg-slate-900/30 text-slate-100 hover:bg-slate-800/70",
                )}
                data-testid="filter-reminders-all"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Todos ({reminderGroups.all.length})
              </Button>
              <Button
                variant={filter === "overdue" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("overdue")}
                className={cn(
                  filter === "overdue"
                    ? "bg-rose-500 hover:bg-rose-600 text-white border-rose-400"
                    : "border-slate-600/70 bg-slate-900/30 text-slate-100 hover:bg-slate-800/70",
                )}
                data-testid="filter-reminders-overdue"
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Vencidos ({reminderGroups.overdue.length})
              </Button>
              <Button
                variant={filter === "today" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("today")}
                className={cn(
                  filter === "today"
                    ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-400"
                    : "border-slate-600/70 bg-slate-900/30 text-slate-100 hover:bg-slate-800/70",
                )}
                data-testid="filter-reminders-today"
              >
                <Clock className="h-4 w-4 mr-2" />
                Hoy ({reminderGroups.today.length})
              </Button>
              <Button
                variant={filter === "upcoming" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("upcoming")}
                className={cn(
                  filter === "upcoming"
                    ? "bg-indigo-500 hover:bg-indigo-600 text-white border-indigo-400"
                    : "border-slate-600/70 bg-slate-900/30 text-slate-100 hover:bg-slate-800/70",
                )}
                data-testid="filter-reminders-upcoming"
              >
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
          <Card className="border-slate-700/60 bg-slate-900/55 backdrop-blur-sm">
            <CardContent className="py-12 text-center text-slate-400">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-60" />
              <p>No hay recordatorios en esta vista</p>
            </CardContent>
          </Card>
        ) : view === "list" ? (
          <div className="space-y-3">{visibleReminders.map((conv) => renderReminderCard(conv))}</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(320px,400px)_1fr]">
            <Card className="h-fit border-slate-700/60 bg-slate-900/55 backdrop-blur-sm shadow-[0_10px_28px_rgba(2,6,23,.35)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-slate-100">Calendario</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="rounded-xl border border-slate-600/60 bg-slate-800/55 p-1">
                  <CalendarPicker
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => setSelectedDate(date || new Date())}
                    modifiers={{ hasReminders: reminderDates }}
                    modifiersClassNames={{
                      hasReminders:
                        "relative after:absolute after:bottom-1 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-emerald-400",
                    }}
                    classNames={{
                      caption_label: "text-sm font-semibold text-slate-100",
                      head_cell: "text-slate-400 rounded-md w-9 font-medium text-[0.78rem]",
                      day: "h-9 w-9 p-0 font-medium text-slate-200 aria-selected:opacity-100 hover:bg-slate-700/70",
                      day_selected: "bg-emerald-500 text-white hover:bg-emerald-500 focus:bg-emerald-500",
                      day_today: "bg-cyan-500/20 text-cyan-300",
                      nav_button: "h-7 w-7 bg-slate-800 border border-slate-600/70 text-slate-200 opacity-100 hover:bg-slate-700",
                    }}
                    className="w-full"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-700/60 bg-slate-900/55 backdrop-blur-sm shadow-[0_10px_28px_rgba(2,6,23,.35)]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base text-slate-100">
                    Agenda del dia: {selectedDate.toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" })}
                  </CardTitle>
                  <Badge variant="secondary" className="bg-slate-700/70 text-slate-100 border border-slate-600/70">
                    {selectedDayReminders.length} recordatorio(s)
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {selectedDayReminders.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">No hay recordatorios para este dia en el filtro actual.</div>
                ) : (
                  <div className="space-y-3">{selectedDayReminders.map((conv) => renderReminderCard(conv, true))}</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      <Dialog open={!!editingReminder} onOpenChange={(open) => !open && setEditingReminder(null)}>
        <DialogContent className="sm:max-w-md border-slate-700 bg-slate-900 text-slate-100">
          <DialogHeader>
            <DialogTitle>Editar recordatorio</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-reminder-datetime">Fecha y hora</Label>
              <Input
                id="edit-reminder-datetime"
                type="datetime-local"
                value={editReminderAtInput}
                onChange={(e) => setEditReminderAtInput(e.target.value)}
                className="bg-slate-800/70 border-slate-600/70 text-slate-100"
                data-testid="input-edit-reminder-datetime"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-reminder-note">Nota</Label>
              <Textarea
                id="edit-reminder-note"
                rows={3}
                value={editReminderNoteInput}
                onChange={(e) => setEditReminderNoteInput(e.target.value)}
                className="bg-slate-800/70 border-slate-600/70 text-slate-100"
                data-testid="textarea-edit-reminder-note"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setEditingReminder(null)}
                className="border-slate-600/70 bg-slate-800/60 text-slate-100 hover:bg-slate-700/80"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (!editingReminder) return;
                  if (!editReminderAtInput) {
                    toast({ title: "Fecha requerida", description: "Seleccione fecha y hora", variant: "destructive" });
                    return;
                  }
                  updateReminderMutation.mutate({
                    conversationId: editingReminder.id,
                    reminderAt: editReminderAtInput,
                    reminderNote: editReminderNoteInput,
                  });
                }}
                disabled={updateReminderMutation.isPending}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                data-testid="button-save-edit-reminder"
              >
                {updateReminderMutation.isPending ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
