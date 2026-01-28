import { useState, useEffect } from "react";
import { Bell, BellOff, BellRing, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

declare global {
  interface Window {
    subscribeToNotifications: () => Promise<{ success: boolean; subscribed?: boolean; reason?: string; message?: string }>;
    getNotificationStatus: () => { ready: boolean; permission: boolean; subscribed: boolean };
    oneSignalReady: boolean;
  }
}

type NotificationState = "loading" | "subscribed" | "unsubscribed" | "denied";

export function NotificationBell() {
  const [status, setStatus] = useState<NotificationState>("loading");
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const { toast } = useToast();

  const checkStatus = () => {
    if (window.getNotificationStatus) {
      const result = window.getNotificationStatus();
      console.log("[NotificationBell] Status check:", result);
      
      if (!result.ready) {
        setStatus("loading");
        return;
      }
      
      if (result.subscribed) {
        setStatus("subscribed");
      } else if (Notification.permission === "denied") {
        setStatus("denied");
      } else {
        setStatus("unsubscribed");
      }
    } else {
      setStatus("loading");
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      checkStatus();
      if (window.oneSignalReady) {
        clearInterval(timer);
      }
    }, 1000);
    
    checkStatus();
    return () => clearInterval(timer);
  }, []);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      if (!window.subscribeToNotifications) {
        toast({
          title: "Cargando...",
          description: "El sistema de notificaciones se está inicializando",
        });
        return;
      }
      
      const result = await window.subscribeToNotifications();
      console.log("[NotificationBell] Subscribe result:", result);
      
      if (result.success) {
        setStatus("subscribed");
        setShowDialog(false);
        toast({
          title: "Notificaciones activadas",
          description: "Recibirás alertas cuando lleguen mensajes nuevos",
        });
      } else {
        if (result.reason?.includes("denied")) {
          setStatus("denied");
          toast({
            title: "Permiso denegado",
            description: "Ve a la configuración de tu navegador para habilitar notificaciones",
            variant: "destructive",
          });
        } else {
          toast({
            title: "No se pudo activar",
            description: result.reason || "Intenta de nuevo",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("[NotificationBell] Error:", error);
      toast({
        title: "Error",
        description: "No se pudieron activar las notificaciones",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      checkStatus();
    }
  };

  const handleClick = () => {
    if (status === "subscribed") {
      toast({
        title: "Notificaciones activas",
        description: "Ya estás recibiendo notificaciones push",
      });
      return;
    }

    if (status === "denied") {
      setShowDialog(true);
      return;
    }

    if (status === "loading") {
      toast({
        title: "Cargando...",
        description: "Espera unos segundos e intenta de nuevo",
      });
      return;
    }

    // For unsubscribed, directly try to subscribe (triggers browser popup)
    handleSubscribe();
  };

  const getIcon = () => {
    if (loading || status === "loading") {
      return <BellRing className="h-4 w-4 animate-pulse" />;
    }
    switch (status) {
      case "subscribed":
        return <Bell className="h-4 w-4 text-green-500" />;
      case "denied":
        return <BellOff className="h-4 w-4 text-destructive" />;
      default:
        return <BellOff className="h-4 w-4" />;
    }
  };

  const getTooltipText = () => {
    switch (status) {
      case "subscribed":
        return "Notificaciones activas";
      case "denied":
        return "Notificaciones bloqueadas - Click para más info";
      case "loading":
        return "Cargando...";
      default:
        return "Activar notificaciones";
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            disabled={loading}
            data-testid="button-notification-bell"
            className={`flex flex-col items-center px-3 py-1.5 rounded-xl transition-all ${
              status === "subscribed" 
                ? "text-emerald-400 bg-emerald-500/20" 
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {status === "subscribed" ? (
              <Bell className="h-5 w-5" />
            ) : status === "denied" ? (
              <BellOff className="h-5 w-5 text-red-400" />
            ) : loading || status === "loading" ? (
              <BellRing className="h-5 w-5 animate-pulse" />
            ) : (
              <BellOff className="h-5 w-5" />
            )}
            <span className="text-[10px] mt-0.5 font-medium">Notif</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{getTooltipText()}</p>
        </TooltipContent>
      </Tooltip>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notificaciones bloqueadas</DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>Las notificaciones están bloqueadas en tu navegador. Para habilitarlas:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Haz clic en el icono de candado/info en la barra de direcciones</li>
                <li>Busca "Notificaciones" en los permisos</li>
                <li>Cámbialo a "Permitir"</li>
                <li>Recarga la página</li>
              </ol>
              <p className="text-xs text-muted-foreground pt-2">
                En móvil/PWA: Ve a Configuración del navegador → Sitios → Este sitio → Notificaciones → Permitir
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Entendido
            </Button>
            <Button onClick={() => {
              setShowDialog(false);
              handleSubscribe();
            }}>
              Intentar de nuevo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
