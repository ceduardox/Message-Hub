import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/use-auth";

type PushSettings = {
  notifyNewMessages: boolean;
  notifyPending: boolean;
};

export default function PushSettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const { data: pushSettings, isLoading } = useQuery<PushSettings>({
    queryKey: ["/api/push-settings"],
    queryFn: async () => {
      const res = await fetch("/api/push-settings", { credentials: "include" });
      if (!res.ok) throw new Error("No se pudo cargar la configuracion de push");
      return res.json();
    },
    retry: false,
  });

  const updatePushSettingsMutation = useMutation({
    mutationFn: async (data: Partial<PushSettings>) => {
      const res = await fetch("/api/push-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("No se pudo guardar la configuracion");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push-settings"] });
      toast({ title: "Preferencias de push guardadas" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-slate-300" data-testid="button-back-push-settings">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Notificaciones Push</h1>
        </div>

        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4 space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/50 p-3">
            <div>
              <p className="text-sm font-medium">Suscripcion del dispositivo</p>
              <p className="text-xs text-slate-400">Activa permisos push en este movil/navegador</p>
            </div>
            <NotificationBell />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/50 p-3">
            <div>
              <p className="text-sm font-medium text-white">Nuevos</p>
              <p className="text-xs text-slate-400">Push cuando entra mensaje nuevo</p>
            </div>
            <Switch
              checked={pushSettings?.notifyNewMessages ?? true}
              onCheckedChange={(checked) => updatePushSettingsMutation.mutate({ notifyNewMessages: checked })}
              disabled={isLoading || updatePushSettingsMutation.isPending}
              data-testid="switch-push-new-messages-page"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/50 p-3">
            <div>
              <p className="text-sm font-medium text-white">Esperando confirmacion</p>
              <p className="text-xs text-slate-400">Push cuando pasa a Proceso/Pending</p>
            </div>
            <Switch
              checked={pushSettings?.notifyPending ?? true}
              onCheckedChange={(checked) => updatePushSettingsMutation.mutate({ notifyPending: checked })}
              disabled={isLoading || updatePushSettingsMutation.isPending}
              data-testid="switch-push-pending-page"
            />
          </div>

          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
            <p className="text-xs text-cyan-100">
              <BellRing className="inline-block h-3.5 w-3.5 mr-1" />
              {isAdmin
                ? "Estas preferencias aplican globalmente para todo el panel."
                : "Estas preferencias son globales del panel y tambien afectan a admin y otros agentes."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

