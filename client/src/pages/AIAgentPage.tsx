import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { 
  ArrowLeft, 
  Bot, 
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Save
} from "lucide-react";

interface AiSettings {
  id?: number;
  enabled: boolean;
  systemPrompt: string | null;
  catalog: string | null;
}

interface AiLog {
  id: number;
  conversationId: number | null;
  userMessage: string | null;
  aiResponse: string | null;
  tokensUsed: number | null;
  success: boolean;
  error: string | null;
  createdAt: string;
}

export default function AIAgentPage() {
  const { toast } = useToast();
  const [systemPrompt, setSystemPrompt] = useState("");
  const [catalog, setCatalog] = useState("");
  const [promptEdited, setPromptEdited] = useState(false);
  const [catalogEdited, setCatalogEdited] = useState(false);

  const { data: settings, isLoading: settingsLoading } = useQuery<AiSettings>({
    queryKey: ["/api/ai/settings"],
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery<AiLog[]>({
    queryKey: ["/api/ai/logs"],
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (settings && !promptEdited) {
      setSystemPrompt(settings.systemPrompt || "");
    }
    if (settings && !catalogEdited) {
      setCatalog(settings.catalog || "");
    }
  }, [settings, promptEdited, catalogEdited]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<AiSettings>) => {
      return apiRequest("PATCH", "/api/ai/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/settings"] });
      toast({ title: "Configuración guardada" });
    },
  });

  const handleToggle = (enabled: boolean) => {
    updateSettingsMutation.mutate({ enabled });
  };

  const handleSavePrompt = () => {
    updateSettingsMutation.mutate({ systemPrompt });
    setPromptEdited(false);
  };

  const handleSaveCatalog = () => {
    updateSettingsMutation.mutate({ catalog });
    setCatalogEdited(false);
  };

  if (settingsLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Agente IA</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {settings?.enabled ? "Activo" : "Inactivo"}
            </span>
            <Switch
              checked={settings?.enabled || false}
              onCheckedChange={handleToggle}
              disabled={updateSettingsMutation.isPending}
              data-testid="switch-ai-enabled"
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Instrucciones del Agente</CardTitle>
            <CardDescription>
              Define cómo debe comportarse el agente (nombre, tono, reglas)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Ej: Eres Isabella, asistente de ventas amigable. Responde siempre en español. Si quieren comprar, pide ubicación..."
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value);
                setPromptEdited(true);
              }}
              rows={5}
              data-testid="textarea-system-prompt"
            />
            {promptEdited && (
              <Button onClick={handleSavePrompt} disabled={updateSettingsMutation.isPending} data-testid="button-save-prompt">
                {updateSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar Instrucciones
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Catálogo de Productos</CardTitle>
            <CardDescription>
              Escribe toda la información de tus productos: nombres, precios, beneficios, URLs de imágenes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder={`Ejemplo:

BERBERINA - 280 Bs
Suplemento natural para control de glucosa
Dosis: 2 cápsulas al día
Imagen: https://ejemplo.com/berberina.jpg

CITRATO DE MAGNESIO - 150 Bs
Ayuda con el estrés y sueño
Dosis: 1 cápsula antes de dormir
Imagen: https://ejemplo.com/citrato.jpg`}
              value={catalog}
              onChange={(e) => {
                setCatalog(e.target.value);
                setCatalogEdited(true);
              }}
              rows={12}
              className="font-mono text-sm"
              data-testid="textarea-catalog"
            />
            {catalogEdited && (
              <Button onClick={handleSaveCatalog} disabled={updateSettingsMutation.isPending} data-testid="button-save-catalog">
                {updateSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar Catálogo
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Logs de IA</CardTitle>
              <CardDescription>
                Historial de respuestas del agente para depuración
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/ai/logs"] })}
              data-testid="button-refresh-logs"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : logs.length > 0 ? (
              <div className="border rounded-md divide-y max-h-80 overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="p-3 text-sm" data-testid={`log-item-${log.id}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {log.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                      {log.tokensUsed && (
                        <span className="text-xs bg-secondary px-1.5 py-0.5 rounded">
                          {log.tokensUsed} tokens
                        </span>
                      )}
                    </div>
                    <div className="pl-6 space-y-1">
                      <p><span className="font-medium">Usuario:</span> {log.userMessage || "-"}</p>
                      {log.success ? (
                        <p><span className="font-medium">IA:</span> {log.aiResponse?.substring(0, 150)}{(log.aiResponse?.length || 0) > 150 ? "..." : ""}</p>
                      ) : (
                        <p className="text-destructive"><span className="font-medium">Error:</span> {log.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay logs aún
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
