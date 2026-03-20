import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/use-auth";

type PushSettings = {
  notifyNewMessages: boolean;
  notifyPending: boolean;
  reminderLeadMinutes: number[];
};

export default function PushSettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [diagPermission, setDiagPermission] = useState("desconocido");
  const [diagBrowser, setDiagBrowser] = useState("desconocido");
  const [diagOs, setDiagOs] = useState("desconocido");
  const [diagHost, setDiagHost] = useState("desconocido");
  const [diagSecure, setDiagSecure] = useState("No");
  const [reminderMinutesInput, setReminderMinutesInput] = useState("30,15");

  const refreshDiagnostics = () => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const browser = /Edg\//.test(ua)
      ? "Edge"
      : /Chrome|Chromium/.test(ua)
        ? "Chrome"
        : /Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)
          ? "Safari"
          : /Firefox/.test(ua)
            ? "Firefox"
            : "desconocido";
    const os = /Macintosh|Mac OS X/.test(ua)
      ? "macOS"
      : /Windows NT/.test(ua)
        ? "Windows"
        : /Android/.test(ua)
          ? "Android"
          : /iPhone|iPad|iPod/.test(ua)
            ? "iOS"
            : "desconocido";
    const permission = typeof Notification !== "undefined" ? Notification.permission : "no-soportado";
    const host = typeof window !== "undefined" ? window.location.hostname : "desconocido";
    const secure = typeof window !== "undefined" && window.isSecureContext ? "Si" : "No";

    setDiagBrowser(browser);
    setDiagOs(os);
    setDiagPermission(permission);
    setDiagHost(host || "desconocido");
    setDiagSecure(secure);
  };

  useEffect(() => {
    refreshDiagnostics();
  }, []);

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

  useEffect(() => {
    if (!pushSettings?.reminderLeadMinutes?.length) return;
    setReminderMinutesInput(pushSettings.reminderLeadMinutes.join(","));
  }, [pushSettings?.reminderLeadMinutes]);

  const parseReminderMinutesInput = (value: string) => {
    const parsed = value
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n) && Number.isInteger(n) && n >= 1 && n <= 1440);
    const unique = Array.from(new Set(parsed)).sort((a, b) => b - a).slice(0, 8);
    return unique;
  };

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

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2" data-testid="push-diagnostics">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-amber-100">Diagnostico rapido (este dispositivo)</p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-amber-400/40 text-amber-100 hover:bg-amber-500/20"
                onClick={refreshDiagnostics}
                data-testid="button-refresh-push-diagnostics"
              >
                Refrescar
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-1 text-xs text-amber-50/90">
              <p>Permiso: <span className="font-semibold">{diagPermission}</span></p>
              <p>Navegador: <span className="font-semibold">{diagBrowser}</span></p>
              <p>Sistema: <span className="font-semibold">{diagOs}</span></p>
              <p>Dominio: <span className="font-semibold">{diagHost}</span></p>
              <p>Contexto seguro (HTTPS): <span className="font-semibold">{diagSecure}</span></p>
            </div>
            <p className="text-[11px] text-amber-100/80">
              Si Permiso = denied, debe habilitarse manualmente en el navegador/SO para este dominio.
            </p>
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

          <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-3 space-y-2">
            <div>
              <p className="text-sm font-medium text-white">Recordatorios (minutos antes)</p>
              <p className="text-xs text-slate-400">Ejemplo: 30,15 o 10,5. Max 8 valores.</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={reminderMinutesInput}
                onChange={(e) => setReminderMinutesInput(e.target.value)}
                placeholder="30,15"
                className="bg-slate-900/50 border-slate-600 text-white"
                data-testid="input-reminder-lead-minutes"
              />
              <Button
                size="sm"
                onClick={() => {
                  const minutes = parseReminderMinutesInput(reminderMinutesInput);
                  if (!minutes.length) {
                    toast({
                      title: "Formato invalido",
                      description: "Use minutos separados por coma. Ej: 30,15",
                      variant: "destructive",
                    });
                    return;
                  }
                  updatePushSettingsMutation.mutate({ reminderLeadMinutes: minutes });
                }}
                disabled={isLoading || updatePushSettingsMutation.isPending}
                data-testid="button-save-reminder-lead-minutes"
              >
                Guardar
              </Button>
            </div>
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
