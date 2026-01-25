import { useState, useEffect } from "react";
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
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  Pencil,
  Package,
  X,
  Check
} from "lucide-react";

interface AiSettings {
  id?: number;
  enabled: boolean;
  systemPrompt: string | null;
  catalog: string | null;
  maxTokens: number | null;
  temperature: number | null;
  model: string | null;
  maxPromptChars: number | null;
  conversationHistory: number | null;
  audioResponseEnabled: boolean | null;
}

interface Product {
  id: number;
  name: string;
  keywords: string | null;
  description: string | null;
  price: string | null;
  imageUrl: string | null;
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
  const [systemPrompt, setSystemPrompt] = useState("");
  const [promptEdited, setPromptEdited] = useState(false);
  
  // AI config state
  const [maxTokens, setMaxTokens] = useState(120);
  const [temperature, setTemperature] = useState(70);
  const [model, setModel] = useState("gpt-4o-mini");
  const [maxPromptChars, setMaxPromptChars] = useState(2000);
  const [conversationHistory, setConversationHistory] = useState(3);
  const [audioResponseEnabled, setAudioResponseEnabled] = useState(false);
  const [configEdited, setConfigEdited] = useState(false);
  
  // Product form state
  const [newName, setNewName] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");
  
  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editKeywords, setEditKeywords] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");

  const { data: settings, isLoading: settingsLoading } = useQuery<AiSettings>({
    queryKey: ["/api/ai/settings"],
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery<AiLog[]>({
    queryKey: ["/api/ai/logs"],
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (settings && !promptEdited) {
      setSystemPrompt(settings.systemPrompt || "");
    }
    if (settings && !configEdited) {
      setMaxTokens(settings.maxTokens || 120);
      setTemperature(settings.temperature || 70);
      setModel(settings.model || "gpt-4o-mini");
      setMaxPromptChars(settings.maxPromptChars || 2000);
      setConversationHistory(settings.conversationHistory || 3);
      setAudioResponseEnabled(settings.audioResponseEnabled || false);
    }
  }, [settings, promptEdited, configEdited]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<AiSettings>) => {
      return apiRequest("PATCH", "/api/ai/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/settings"] });
      toast({ title: "Configuración guardada" });
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: Partial<Product>) => {
      return apiRequest("POST", "/api/products", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setNewName("");
      setNewKeywords("");
      setNewDescription("");
      setNewPrice("");
      setNewImageUrl("");
      toast({ title: "Producto agregado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error al agregar producto", description: error.message, variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Product> }) => {
      return apiRequest("PATCH", `/api/products/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setEditingId(null);
      toast({ title: "Producto actualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error al actualizar producto", description: error.message, variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Producto eliminado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error al eliminar producto", description: error.message, variant: "destructive" });
    },
  });

  const handleToggle = (enabled: boolean) => {
    updateSettingsMutation.mutate({ enabled });
  };

  const handleSavePrompt = () => {
    updateSettingsMutation.mutate({ systemPrompt });
    setPromptEdited(false);
  };

  const handleSaveConfig = () => {
    updateSettingsMutation.mutate({ maxTokens, temperature, model, maxPromptChars, conversationHistory, audioResponseEnabled });
    setConfigEdited(false);
  };

  const handleAddProduct = () => {
    if (!newName.trim()) {
      toast({ title: "El nombre es requerido", variant: "destructive" });
      return;
    }
    createProductMutation.mutate({
      name: newName,
      keywords: newKeywords || null,
      description: newDescription || null,
      price: newPrice || null,
      imageUrl: newImageUrl || null,
    });
  };

  const startEditing = (product: Product) => {
    setEditingId(product.id);
    setEditName(product.name);
    setEditKeywords(product.keywords || "");
    setEditDescription(product.description || "");
    setEditPrice(product.price || "");
    setEditImageUrl(product.imageUrl || "");
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateProductMutation.mutate({
      id: editingId,
      data: {
        name: editName,
        keywords: editKeywords || null,
        description: editDescription || null,
        price: editPrice || null,
        imageUrl: editImageUrl || null,
      },
    });
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
              Define cómo debe comportarse el agente (nombre, tono, reglas). Máximo: {maxPromptChars} caracteres.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Textarea
                placeholder="Ej: Eres Isabella, asistente de ventas amigable. Responde siempre en español. Si quieren comprar, pide ubicación..."
                value={systemPrompt}
                onChange={(e) => {
                  const newValue = e.target.value.slice(0, maxPromptChars);
                  setSystemPrompt(newValue);
                  setPromptEdited(true);
                }}
                rows={5}
                data-testid="textarea-system-prompt"
              />
              <div className={`text-xs mt-1 ${systemPrompt.length >= maxPromptChars ? 'text-destructive' : 'text-muted-foreground'}`}>
                {systemPrompt.length} / {maxPromptChars} caracteres
              </div>
            </div>
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
            <CardTitle className="text-lg">Configuración del Modelo</CardTitle>
            <CardDescription>
              Ajusta los parámetros de la IA (tokens, creatividad, modelo, contexto)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="maxTokens">Máx. Tokens (respuesta)</Label>
                <Input
                  id="maxTokens"
                  type="number"
                  min={50}
                  max={500}
                  value={maxTokens}
                  onChange={(e) => {
                    setMaxTokens(parseInt(e.target.value) || 120);
                    setConfigEdited(true);
                  }}
                  data-testid="input-max-tokens"
                />
                <p className="text-xs text-muted-foreground mt-1">50-500. Más tokens = respuestas más largas</p>
              </div>
              <div>
                <Label htmlFor="temperature">Temperatura (%)</Label>
                <Input
                  id="temperature"
                  type="number"
                  min={0}
                  max={100}
                  value={temperature}
                  onChange={(e) => {
                    setTemperature(parseInt(e.target.value) || 70);
                    setConfigEdited(true);
                  }}
                  data-testid="input-temperature"
                />
                <p className="text-xs text-muted-foreground mt-1">0=preciso, 100=creativo</p>
              </div>
              <div>
                <Label htmlFor="model">Modelo</Label>
                <select
                  id="model"
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setConfigEdited(true);
                  }}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  data-testid="select-model"
                >
                  <option value="gpt-4o-mini">GPT-4o Mini (rápido, económico)</option>
                  <option value="gpt-4o">GPT-4o (más inteligente)</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">Modelo de OpenAI a usar</p>
              </div>
              <div>
                <Label htmlFor="maxPromptChars">Máx. Caracteres (instrucciones)</Label>
                <Input
                  id="maxPromptChars"
                  type="number"
                  min={500}
                  max={10000}
                  value={maxPromptChars}
                  onChange={(e) => {
                    setMaxPromptChars(parseInt(e.target.value) || 2000);
                    setConfigEdited(true);
                  }}
                  data-testid="input-max-prompt-chars"
                />
                <p className="text-xs text-muted-foreground mt-1">500-10000. Límite de texto en instrucciones</p>
              </div>
              <div>
                <Label htmlFor="conversationHistory">Mensajes de contexto</Label>
                <Input
                  id="conversationHistory"
                  type="number"
                  min={1}
                  max={20}
                  value={conversationHistory}
                  onChange={(e) => {
                    setConversationHistory(parseInt(e.target.value) || 3);
                    setConfigEdited(true);
                  }}
                  data-testid="input-conversation-history"
                />
                <p className="text-xs text-muted-foreground mt-1">1-20. Cuántos mensajes previos lee la IA</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
              <div className="space-y-1">
                <Label htmlFor="audioResponse">Responder con Audio</Label>
                <p className="text-xs text-muted-foreground">
                  Cuando el cliente envía un audio, la IA responde también con audio
                </p>
              </div>
              <Switch
                id="audioResponse"
                checked={audioResponseEnabled}
                onCheckedChange={(checked) => {
                  setAudioResponseEnabled(checked);
                  setConfigEdited(true);
                }}
                data-testid="switch-audio-response"
              />
            </div>
            
            {configEdited && (
              <Button onClick={handleSaveConfig} disabled={updateSettingsMutation.isPending} data-testid="button-save-config">
                {updateSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar Configuración
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Productos
            </CardTitle>
            <CardDescription>
              Agrega tus productos individualmente. La IA buscará solo el producto que mencione el cliente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 p-4 border rounded-md bg-muted/30">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Nombre *</Label>
                  <Input
                    placeholder="Ej: Berberina"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    data-testid="input-product-name"
                  />
                </div>
                <div>
                  <Label>Precio</Label>
                  <Input
                    placeholder="Ej: 280 Bs"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    data-testid="input-product-price"
                  />
                </div>
              </div>
              <div>
                <Label>Palabras clave (separadas por coma)</Label>
                <Input
                  placeholder="Ej: glucosa, azúcar, diabetes"
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  data-testid="input-product-keywords"
                />
              </div>
              <div>
                <Label>Descripción</Label>
                <Textarea
                  placeholder="Beneficios, dosis, instrucciones..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  data-testid="textarea-product-description"
                />
              </div>
              <div>
                <Label>URL de imagen</Label>
                <Input
                  placeholder="https://..."
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  data-testid="input-product-image"
                />
              </div>
              <Button onClick={handleAddProduct} disabled={createProductMutation.isPending} data-testid="button-add-product">
                {createProductMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Agregar Producto
              </Button>
            </div>

            {productsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : products.length > 0 ? (
              <div className="border rounded-md divide-y">
                {products.map((product) => (
                  <div key={product.id} className="p-3" data-testid={`product-item-${product.id}`}>
                    {editingId === product.id ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            placeholder="Nombre"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            data-testid={`input-edit-name-${product.id}`}
                          />
                          <Input
                            placeholder="Precio"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            data-testid={`input-edit-price-${product.id}`}
                          />
                        </div>
                        <Input
                          placeholder="Palabras clave"
                          value={editKeywords}
                          onChange={(e) => setEditKeywords(e.target.value)}
                          data-testid={`input-edit-keywords-${product.id}`}
                        />
                        <Textarea
                          placeholder="Descripción"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          rows={2}
                          data-testid={`textarea-edit-description-${product.id}`}
                        />
                        <Input
                          placeholder="URL imagen"
                          value={editImageUrl}
                          onChange={(e) => setEditImageUrl(e.target.value)}
                          data-testid={`input-edit-image-${product.id}`}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveEdit} disabled={updateProductMutation.isPending}>
                            {updateProductMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                            Guardar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4 mr-1" /> Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{product.name}</span>
                            {product.price && (
                              <span className="text-sm bg-primary/10 text-primary px-2 py-0.5 rounded">
                                {product.price}
                              </span>
                            )}
                          </div>
                          {product.keywords && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Palabras clave: {product.keywords}
                            </p>
                          )}
                          {product.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {product.description}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditing(product)}
                            data-testid={`button-edit-product-${product.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteProductMutation.mutate(product.id)}
                            disabled={deleteProductMutation.isPending}
                            data-testid={`button-delete-product-${product.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay productos. Agrega tu primer producto arriba.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Logs de IA</CardTitle>
              <CardDescription>
                Historial de respuestas del agente
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
