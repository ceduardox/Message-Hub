import { useState, useEffect } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

declare global {
  interface Window {
    subscribeToNotifications: () => Promise<{ success: boolean; subscribed?: boolean; reason?: string }>;
    getNotificationStatus: () => { permission: boolean; subscribed: boolean };
  }
}

type NotificationState = "unknown" | "subscribed" | "unsubscribed" | "denied";

export function NotificationBell() {
  const [status, setStatus] = useState<NotificationState>("unknown");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const checkStatus = () => {
      if (window.getNotificationStatus) {
        const { permission, subscribed } = window.getNotificationStatus();
        if (subscribed) {
          setStatus("subscribed");
        } else if (permission === false) {
          setStatus("denied");
        } else {
          setStatus("unsubscribed");
        }
      }
    };

    const timer = setTimeout(checkStatus, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleClick = async () => {
    if (status === "subscribed") {
      toast({
        title: "Notificaciones activas",
        description: "Ya estás recibiendo notificaciones push",
      });
      return;
    }

    if (status === "denied") {
      toast({
        title: "Permisos bloqueados",
        description: "Debes habilitar las notificaciones en la configuración del navegador",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      if (window.subscribeToNotifications) {
        const result = await window.subscribeToNotifications();
        if (result.success) {
          setStatus("subscribed");
          toast({
            title: "Notificaciones activadas",
            description: "Recibirás alertas cuando lleguen mensajes nuevos",
          });
        } else {
          if (result.reason === "Permission denied") {
            setStatus("denied");
          }
          toast({
            title: "No se pudieron activar",
            description: result.reason || "Intenta de nuevo",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Cargando...",
          description: "OneSignal aún se está inicializando, intenta en unos segundos",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron activar las notificaciones",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getIcon = () => {
    if (loading) {
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
        return "Notificaciones bloqueadas";
      case "unsubscribed":
        return "Activar notificaciones";
      default:
        return "Notificaciones";
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClick}
          disabled={loading}
          data-testid="button-notification-bell"
          className={status === "subscribed" ? "text-green-500" : ""}
        >
          {getIcon()}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{getTooltipText()}</p>
      </TooltipContent>
    </Tooltip>
  );
}
