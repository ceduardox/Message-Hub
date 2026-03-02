import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Bot, BotOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

export default function AgentAiPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ isAiAutoReplyEnabled: boolean }>({
    queryKey: ["/api/agents/me/settings"],
    queryFn: async () => {
      const res = await fetch("/api/agents/me/settings", { credentials: "include" });
      if (!res.ok) throw new Error("No se pudo cargar la configuración de IA");
      return res.json();
    },
    retry: false,
  });

  const toggleMutation = useMutation({
    mutationFn: async (isAiAutoReplyEnabled: boolean) => {
      const res = await fetch("/api/agents/me/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAiAutoReplyEnabled }),
      });
      if (!res.ok) throw new Error("No se pudo actualizar la configuración de IA");
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/agents/me/settings"], updated);
      toast({
        title: updated.isAiAutoReplyEnabled ? "IA global activada" : "IA global desactivada",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const enabled = data?.isAiAutoReplyEnabled !== false;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-slate-300" data-testid="button-back-agent-ai">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">IA Global del Agente</h1>
        </div>

        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {enabled ? <Bot className="h-5 w-5 text-emerald-400" /> : <BotOff className="h-5 w-5 text-amber-400" />}
              <div>
                <p className="text-sm font-medium">Respuesta IA automática</p>
                <p className="text-xs text-slate-400">{enabled ? "Activada" : "Desactivada"}</p>
              </div>
            </div>
            <Switch
              checked={enabled}
              disabled={isLoading || toggleMutation.isPending}
              onCheckedChange={(checked) => toggleMutation.mutate(checked)}
              data-testid="switch-agent-global-ai"
            />
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Esta configuración aplica a todos tus chats asignados. Si está desactivada, la IA no responderá
            automáticamente y podrás responder manualmente.
          </p>
        </div>
      </div>
    </div>
  );
}
