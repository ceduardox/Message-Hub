import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { 
  ArrowLeft, 
  Bot, 
  Plus, 
  Trash2, 
  FileText, 
  Link as LinkIcon, 
  Image,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Pencil,
  X,
  Check
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AiSettings {
  id?: number;
  enabled: boolean;
  systemPrompt: string | null;
  cacheRefreshMinutes?: number;
}

interface CacheInfo {
  lastUpdated: number | null;
  refreshMinutes: number;
}

interface TrainingData {
  id: number;
  type: string;
  title: string | null;
  content: string;
  createdAt: string;
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
  const [newType, setNewType] = useState<string>("text");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [promptEdited, setPromptEdited] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const { data: settings, isLoading: settingsLoading } = useQuery<AiSettings>({
    queryKey: ["/api/ai/settings"],
  });

  const { data: trainingData = [], isLoading: trainingLoading } = useQuery<TrainingData[]>({
    queryKey: ["/api/ai/training"],
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery<AiLog[]>({
    queryKey: ["/api/ai/logs"],
    refetchInterval: 10000,
  });

  const { data: cacheInfo } = useQuery<CacheInfo>({
    queryKey: ["/api/ai/cache"],
    refetchInterval: 30000,
  });

  const refreshCacheMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/ai/cache/refresh", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/cache"] });
      toast({ title: "Cache actualizado" });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<AiSettings>) => {
      return apiRequest("PATCH", "/api/ai/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/settings"] });
      toast({ title: "Configuración guardada" });
    },
  });

  const addTrainingMutation = useMutation({
    mutationFn: async (data: { type: string; title: string; content: string }) => {
      return apiRequest("POST", "/api/ai/training", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/training"] });
      setNewTitle("");
      setNewContent("");
      toast({ title: "Información agregada" });
    },
  });

  const deleteTrainingMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/ai/training/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/training"] });
      toast({ title: "Información eliminada" });
    },
  });

  const updateTrainingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { title?: string; content?: string } }) => {
      return apiRequest("PATCH", `/api/ai/training/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/training"] });
      setEditingId(null);
      toast({ title: "Información actualizada" });
    },
  });

  const startEditing = (item: TrainingData) => {
    setEditingId(item.id);
    setEditTitle(item.title || "");
    setEditContent(item.content);
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateTrainingMutation.mutate({ 
      id: editingId, 
      data: { title: editTitle, content: editContent } 
    });
  };

  const handleToggle = (enabled: boolean) => {
    updateSettingsMutation.mutate({ enabled });
  };

  const handleSavePrompt = () => {
    updateSettingsMutation.mutate({ systemPrompt });
    setPromptEdited(false);
  };

  const handleAddTraining = () => {
    if (!newContent.trim()) {
      toast({ title: "El contenido es requerido", variant: "destructive" });
      return;
    }
    addTrainingMutation.mutate({ type: newType, title: newTitle, content: newContent });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "url": return <LinkIcon className="h-4 w-4" />;
      case "image_url": return <Image className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "url": return "URL";
      case "image_url": return "Imagen";
      default: return "Texto";
    }
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
              Define cómo debe comportarse el agente al responder mensajes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Ej: Eres un asistente de ventas amigable. Ayuda a los clientes con precios y promociones..."
              value={promptEdited ? systemPrompt : (settings?.systemPrompt || "")}
              onChange={(e) => {
                setSystemPrompt(e.target.value);
                setPromptEdited(true);
              }}
              rows={4}
              data-testid="textarea-system-prompt"
            />
            {promptEdited && (
              <Button onClick={handleSavePrompt} disabled={updateSettingsMutation.isPending} data-testid="button-save-prompt">
                {updateSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Guardar Instrucciones
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cache de Datos</CardTitle>
            <CardDescription>
              Controla cada cuánto se actualizan los datos de entrenamiento en memoria
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label>Refrescar cada</Label>
                <Select 
                  value={String(settings?.cacheRefreshMinutes || 5)} 
                  onValueChange={(v) => updateSettingsMutation.mutate({ cacheRefreshMinutes: parseInt(v) })}
                >
                  <SelectTrigger className="w-24" data-testid="select-cache-minutes">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 min</SelectItem>
                    <SelectItem value="2">2 min</SelectItem>
                    <SelectItem value="5">5 min</SelectItem>
                    <SelectItem value="10">10 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">60 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button 
                variant="outline" 
                onClick={() => refreshCacheMutation.mutate()}
                disabled={refreshCacheMutation.isPending}
                data-testid="button-refresh-cache"
              >
                {refreshCacheMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Actualizar ahora
              </Button>
            </div>
            {cacheInfo?.lastUpdated && (
              <p className="text-sm text-muted-foreground">
                Última actualización: {new Date(cacheInfo.lastUpdated).toLocaleTimeString()}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Datos de Entrenamiento</CardTitle>
            <CardDescription>
              Agrega información sobre productos, precios, promociones, y URLs de imágenes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
              <div>
                <Label>Tipo</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger data-testid="select-training-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="url">URL/PDF</SelectItem>
                    <SelectItem value="image_url">URL Imagen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Título (opcional)</Label>
                <Input
                  placeholder="Ej: Catálogo 2024, Precios Enero..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  data-testid="input-training-title"
                />
              </div>
            </div>
            <div>
              <Label>Contenido</Label>
              <Textarea
                placeholder={newType === "text" 
                  ? "Escribe la información aquí: productos, precios, políticas..." 
                  : "Pega la URL aquí: https://..."}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={3}
                data-testid="textarea-training-content"
              />
            </div>
            <Button 
              onClick={handleAddTraining} 
              disabled={addTrainingMutation.isPending}
              data-testid="button-add-training"
            >
              {addTrainingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Agregar
            </Button>

            {trainingLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : trainingData.length > 0 ? (
              <div className="border rounded-md divide-y">
                {trainingData.map((item) => (
                  <div key={item.id} className="p-3" data-testid={`training-item-${item.id}`}>
                    {editingId === item.id ? (
                      <div className="space-y-2">
                        <Input
                          placeholder="Título"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          data-testid={`input-edit-title-${item.id}`}
                        />
                        <Textarea
                          placeholder="Contenido"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={3}
                          data-testid={`textarea-edit-content-${item.id}`}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveEdit} disabled={updateTrainingMutation.isPending}>
                            {updateTrainingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                            Guardar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4 mr-1" /> Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1 text-muted-foreground">
                          {getTypeIcon(item.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium bg-secondary px-2 py-0.5 rounded">
                              {getTypeLabel(item.type)}
                            </span>
                            {item.title && <span className="font-medium text-sm">{item.title}</span>}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 truncate">
                            {item.content.substring(0, 100)}{item.content.length > 100 ? "..." : ""}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEditing(item)}
                          data-testid={`button-edit-training-${item.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteTrainingMutation.mutate(item.id)}
                          disabled={deleteTrainingMutation.isPending}
                          data-testid={`button-delete-training-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay datos de entrenamiento aún
              </p>
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
