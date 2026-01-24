import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useSendMessage } from "@/hooks/use-inbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, Image as ImageIcon, Plus, Check, CheckCheck, MapPin, Bug, Copy, ExternalLink, X, Zap, Tag, Trash2, Package, PackageCheck, Truck, PackageX, Bot, BotOff, AlertCircle } from "lucide-react";
import type { Conversation, Message, Label, QuickMessage } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ChatAreaProps {
  conversation: Conversation;
  messages: Message[];
}

const LABEL_COLORS = [
  { name: "blue", bg: "bg-blue-500", text: "text-white" },
  { name: "green", bg: "bg-green-500", text: "text-white" },
  { name: "yellow", bg: "bg-yellow-500", text: "text-black" },
  { name: "red", bg: "bg-red-500", text: "text-white" },
  { name: "purple", bg: "bg-purple-500", text: "text-white" },
  { name: "orange", bg: "bg-orange-500", text: "text-white" },
];

export function ChatArea({ conversation, messages }: ChatAreaProps) {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [showImageInput, setShowImageInput] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("blue");
  const [newQmName, setNewQmName] = useState("");
  const [newQmText, setNewQmText] = useState("");
  const [newQmImageUrl, setNewQmImageUrl] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { mutate: sendMessage, isPending } = useSendMessage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: labelsData = [] } = useQuery<Label[]>({
    queryKey: ["/api/labels"],
  });

  const { data: quickMessagesData = [] } = useQuery<QuickMessage[]>({
    queryKey: ["/api/quick-messages"],
  });

  const currentLabel = labelsData.find(l => l.id === conversation.labelId);

  const setLabelMutation = useMutation({
    mutationFn: async (labelId: number | null) => {
      const res = await fetch(`/api/conversations/${conversation.id}/label`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelId }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const setOrderStatusMutation = useMutation({
    mutationFn: async (orderStatus: string | null) => {
      const res = await fetch(`/api/conversations/${conversation.id}/order-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al actualizar estado");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Estado de pedido actualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleAiMutation = useMutation({
    mutationFn: async (aiDisabled: boolean) => {
      const res = await fetch(`/api/conversations/${conversation.id}/ai-toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiDisabled }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al cambiar estado de IA");
      }
      return res.json();
    },
    onSuccess: (_, aiDisabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: aiDisabled ? "IA desactivada - Modo humano" : "IA activada en este chat" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const clearAttentionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/conversations/${conversation.id}/clear-attention`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Alerta despejada" });
    },
  });

  const createLabelMutation = useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/labels"] });
      setNewLabelName("");
    },
  });

  const createQuickMessageMutation = useMutation({
    mutationFn: async (data: { name: string; text?: string; imageUrl?: string }) => {
      const res = await fetch("/api/quick-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quick-messages"] });
      setNewQmName("");
      setNewQmText("");
      setNewQmImageUrl("");
      toast({ title: "Mensaje rápido guardado" });
    },
  });

  const deleteQuickMessageMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/quick-messages/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quick-messages"] });
    },
  });

  const getLocationUrl = (msg: Message) => {
    const raw = msg.rawJson as any;
    if (raw?.location) {
      const { latitude, longitude } = raw.location;
      return `https://www.google.com/maps?q=${latitude},${longitude}`;
    }
    return null;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: "URL copiada al portapapeles" });
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!text.trim() && !imageUrl.trim()) || isPending) return;

    sendMessage(
      {
        to: conversation.waId,
        type: imageUrl ? "image" : "text",
        text: text.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        caption: imageUrl && text ? text : undefined
      },
      {
        onSuccess: () => {
          setText("");
          setImageUrl("");
          setShowImageInput(false);
        }
      }
    );
  };

  const handleQuickMessage = (qm: QuickMessage) => {
    if (qm.text) setText(qm.text);
    if (qm.imageUrl) {
      setImageUrl(qm.imageUrl);
      setShowImageInput(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full max-h-full bg-[#efeae2] dark:bg-[#0b141a] relative overflow-hidden">
      {/* Chat Header */}
      <header className="h-16 flex-shrink-0 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-border/30 flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${conversation.contactName || conversation.waId}`} />
            <AvatarFallback>{conversation.waId.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground truncate text-sm">
                {conversation.contactName || conversation.waId}
              </h3>
              {currentLabel && (
                <Badge className={cn("text-[10px] px-1.5 py-0", LABEL_COLORS.find(c => c.name === currentLabel.color)?.bg)}>
                  {currentLabel.name}
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">+{conversation.waId}</span>
          </div>
        </div>
        
        {/* Label Dropdown */}
        <Dialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="flex-shrink-0">
                <Tag className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover border shadow-lg">
              <DropdownMenuItem onClick={() => setLabelMutation.mutate(null)}>
                Sin etiqueta
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {labelsData.map((label) => (
                <DropdownMenuItem key={label.id} onClick={() => setLabelMutation.mutate(label.id)}>
                  <div className={cn("w-3 h-3 rounded-full mr-2", LABEL_COLORS.find(c => c.name === label.color)?.bg)} />
                  {label.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DialogTrigger asChild>
                <DropdownMenuItem>
                  <Plus className="h-4 w-4 mr-2" /> Nueva etiqueta
                </DropdownMenuItem>
              </DialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva Etiqueta</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <Input placeholder="Nombre (ej: Cliente)" value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)} />
              <div className="flex gap-2">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => setNewLabelColor(c.name)}
                    className={cn("w-8 h-8 rounded-full", c.bg, newLabelColor === c.name && "ring-2 ring-offset-2 ring-primary")}
                  />
                ))}
              </div>
              <Button onClick={() => createLabelMutation.mutate({ name: newLabelName, color: newLabelColor })} disabled={!newLabelName}>
                Crear
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* AI Toggle Button */}
        <Button 
          variant={conversation.aiDisabled ? "default" : "ghost"} 
          size="icon" 
          className={cn(
            "flex-shrink-0",
            conversation.aiDisabled && "bg-orange-500 text-white"
          )}
          onClick={() => toggleAiMutation.mutate(!conversation.aiDisabled)}
          title={conversation.aiDisabled ? "IA desactivada - Click para activar" : "IA activa - Click para desactivar"}
          data-testid="button-ai-toggle"
        >
          {conversation.aiDisabled ? <BotOff className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </Button>

        {/* Human Attention Alert */}
        {conversation.needsHumanAttention && (
          <Button 
            variant="default" 
            size="icon" 
            className="flex-shrink-0 bg-red-500 text-white"
            onClick={() => clearAttentionMutation.mutate()}
            title="La IA no pudo responder - Click para despejar alerta"
            data-testid="button-clear-attention"
          >
            <AlertCircle className="h-4 w-4" />
          </Button>
        )}

        {/* Order Status Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant={conversation.orderStatus === 'ready' ? "default" : "ghost"} 
              size="icon" 
              className={cn(
                "flex-shrink-0",
                conversation.orderStatus === 'ready' && "bg-green-500 text-white",
                conversation.orderStatus === 'pending' && "text-yellow-600",
                conversation.orderStatus === 'delivered' && "text-blue-600"
              )}
              data-testid="button-order-status"
            >
              {conversation.orderStatus === 'ready' ? <PackageCheck className="h-4 w-4" /> :
               conversation.orderStatus === 'pending' ? <Package className="h-4 w-4" /> :
               conversation.orderStatus === 'delivered' ? <Truck className="h-4 w-4" /> :
               <Package className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 bg-popover border shadow-lg">
            <DropdownMenuItem onClick={() => setOrderStatusMutation.mutate(null)}>
              <PackageX className="h-4 w-4 mr-2 text-muted-foreground" />
              Sin pedido
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setOrderStatusMutation.mutate('pending')}>
              <Package className="h-4 w-4 mr-2 text-yellow-600" />
              Pedido en proceso
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOrderStatusMutation.mutate('ready')}>
              <PackageCheck className="h-4 w-4 mr-2 text-green-600" />
              Listo para entregar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOrderStatusMutation.mutate('delivered')}>
              <Truck className="h-4 w-4 mr-2 text-blue-600" />
              Entregado
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Messages List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg) => {
          const isOut = msg.direction === "out";
          return (
            <div key={msg.id} className={cn("flex w-full", isOut ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] sm:max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm",
                  isOut 
                    ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-sm" 
                    : "bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-sm"
                )}
              >
                {(msg.type === "image" || msg.mediaId) && (
                  <div className="mb-2 rounded overflow-hidden">
                    {msg.mediaId && (
                      <img src={`/api/media/${msg.mediaId}`} alt="Media" className="max-w-full h-auto" />
                    )}
                  </div>
                )}

                {msg.type === "location" && (() => {
                  const locationUrl = getLocationUrl(msg);
                  const raw = msg.rawJson as any;
                  return locationUrl ? (
                    <div className="mb-2 p-2 rounded bg-black/5 dark:bg-white/5">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin className="h-4 w-4 text-red-500" />
                        <span className="font-medium text-xs">Ubicación</span>
                      </div>
                      {raw?.location?.name && <p className="text-xs opacity-70 mb-2">{raw.location.name}</p>}
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => copyToClipboard(locationUrl)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => window.open(locationUrl, '_blank')}>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : null;
                })()}
                
                {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}

                <div className={cn("flex items-center justify-end gap-1 mt-1 text-[10px] opacity-60")}>
                  <span>{msg.timestamp ? format(new Date(parseInt(msg.timestamp) * 1000), 'h:mm a') : format(new Date(), 'h:mm a')}</span>
                  {isOut && (
                    msg.status === 'read' ? <CheckCheck className="h-3 w-3 text-blue-400" /> : <Check className="h-3 w-3" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="absolute bottom-24 right-4 z-30 bg-black/90 text-green-400 p-3 rounded-lg shadow-xl max-w-xs text-xs font-mono">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold">Debug</span>
            <Button size="icon" variant="ghost" onClick={() => setShowDebug(false)} className="h-5 w-5 text-white">
              <X className="h-3 w-3" />
            </Button>
          </div>
          <p>To: +{conversation.waId}</p>
          <p>Messages: {messages.length}</p>
          <p>Label: {currentLabel?.name || 'None'}</p>
        </div>
      )}

      {/* Preview Area */}
      {(imageUrl || (showImageInput && imageUrl)) && (
        <div className="px-4 py-2 bg-muted/50 border-t flex items-center gap-3">
          <img src={imageUrl} alt="Preview" className="h-16 w-16 object-cover rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">{imageUrl}</p>
            {text && <p className="text-sm truncate">{text}</p>}
          </div>
          <Button size="icon" variant="ghost" onClick={() => { setImageUrl(""); setShowImageInput(false); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Input Area */}
      <div className="p-2 bg-[#f0f2f5] dark:bg-[#202c33] z-20 flex-shrink-0">
        {showImageInput && !imageUrl && (
          <div className="mb-2 px-2">
            <Input placeholder="URL de imagen..." value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="text-sm" />
          </div>
        )}
        
        <div className="flex items-end gap-2">
          {/* Attachment Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 flex-shrink-0">
                <Plus className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 bg-popover border shadow-lg">
              <DropdownMenuItem onClick={() => setShowImageInput(!showImageInput)}>
                <ImageIcon className="h-4 w-4 mr-2 text-purple-500" /> Imagen (URL)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowDebug(!showDebug)}>
                <Bug className="h-4 w-4 mr-2 text-green-500" /> Debug
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Quick Messages Menu */}
          <Dialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 flex-shrink-0">
                  <Zap className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto bg-popover border shadow-lg">
                {quickMessagesData.length === 0 && (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">Sin mensajes rápidos</div>
                )}
                {quickMessagesData.map((qm) => (
                  <DropdownMenuItem key={qm.id} className="flex justify-between" onClick={() => handleQuickMessage(qm)}>
                    <span className="truncate">{qm.name}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6 ml-2" onClick={(e) => { e.stopPropagation(); deleteQuickMessageMutation.mutate(qm.id); }}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DialogTrigger asChild>
                  <DropdownMenuItem>
                    <Plus className="h-4 w-4 mr-2" /> Nuevo mensaje rápido
                  </DropdownMenuItem>
                </DialogTrigger>
              </DropdownMenuContent>
            </DropdownMenu>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo Mensaje Rápido</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <Input placeholder="Nombre (ej: Saludo)" value={newQmName} onChange={(e) => setNewQmName(e.target.value)} />
                <Textarea placeholder="Texto del mensaje" value={newQmText} onChange={(e) => setNewQmText(e.target.value)} rows={3} />
                <Input placeholder="URL de imagen (opcional)" value={newQmImageUrl} onChange={(e) => setNewQmImageUrl(e.target.value)} />
                <Button onClick={() => createQuickMessageMutation.mutate({ name: newQmName, text: newQmText || undefined, imageUrl: newQmImageUrl || undefined })} disabled={!newQmName}>
                  Guardar
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje..."
            className="flex-1 min-h-[40px] max-h-[100px] resize-none border-0 bg-white dark:bg-[#2a3942] rounded-3xl px-4 py-2.5 text-sm focus-visible:ring-0"
            rows={1}
          />

          <Button
            onClick={() => handleSend()}
            disabled={(!text && !imageUrl) || isPending}
            size="icon"
            className="rounded-full h-10 w-10 flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
