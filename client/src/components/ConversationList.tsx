import { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, User, Pin, Filter, Package, PackageCheck, Truck } from "lucide-react";
import type { Conversation, Label } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  isLoading: boolean;
}

const LABEL_COLORS: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
};

const ORDER_STATUS_CONFIG: Record<string, { icon: typeof Package; label: string; className: string; bgColor: string }> = {
  pending: { icon: Package, label: "Pedido en proceso", className: "text-yellow-600", bgColor: "bg-yellow-100 border-yellow-300" },
  ready: { icon: PackageCheck, label: "Listo para entregar", className: "text-green-600", bgColor: "bg-green-100 border-green-300" },
  delivered: { icon: Truck, label: "Entregado", className: "text-blue-600", bgColor: "bg-blue-100 border-blue-300" },
};

export function ConversationList({ 
  conversations, 
  activeId, 
  onSelect,
  isLoading 
}: ConversationListProps) {
  const [filterLabelId, setFilterLabelId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  
  const { data: labels = [] } = useQuery<Label[]>({
    queryKey: ["/api/labels"],
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ id, isPinned }: { id: number; isPinned: boolean }) => {
      const res = await fetch(`/api/conversations/${id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const getLabelById = (labelId: number | null) => labels.find(l => l.id === labelId);

  // Filter and sort: pinned first, then by timestamp
  const filteredConversations = conversations
    .filter(c => !filterLabelId || c.labelId === filterLabelId)
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const aTime = a.lastMessageTimestamp ? new Date(a.lastMessageTimestamp).getTime() : 0;
      const bTime = b.lastMessageTimestamp ? new Date(b.lastMessageTimestamp).getTime() : 0;
      return bTime - aTime;
    });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center space-x-4 animate-pulse">
            <div className="h-12 w-12 rounded-full bg-muted"></div>
            <div className="space-y-2 flex-1">
              <div className="h-4 w-[140px] bg-muted rounded"></div>
              <div className="h-3 w-[100px] bg-muted rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border/50 bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Inbox</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {filteredConversations.length} conversacion{filteredConversations.length !== 1 ? 'es' : ''}
            </p>
          </div>
          
          {/* Label Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant={filterLabelId ? "default" : "outline"} size="sm" data-testid="button-filter-labels">
                <Filter className="h-4 w-4 mr-1" />
                {filterLabelId ? getLabelById(filterLabelId)?.name : "Filtrar"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 bg-popover border shadow-lg">
              <DropdownMenuItem onClick={() => setFilterLabelId(null)}>
                Todos
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {labels.map((label) => (
                <DropdownMenuItem key={label.id} onClick={() => setFilterLabelId(label.id)}>
                  <div className={cn("w-3 h-3 rounded-full mr-2", LABEL_COLORS[label.color] || "bg-gray-500")} />
                  {label.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      {filteredConversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center px-4">
          <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
            <MessageSquare className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-foreground">Sin conversaciones</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Los mensajes de WhatsApp aparecerán aquí automáticamente.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {filteredConversations.map((conv) => {
            const label = getLabelById(conv.labelId);
            const orderConfig = conv.orderStatus ? ORDER_STATUS_CONFIG[conv.orderStatus] : null;
            const OrderIcon = orderConfig?.icon;
            
            return (
              <div
                key={conv.id}
                className={cn(
                  "w-full flex items-start gap-3 p-3 rounded-xl transition-all duration-200 text-left border cursor-pointer group",
                  activeId === conv.id 
                    ? "bg-white dark:bg-card shadow-md border-border ring-1 ring-primary/10" 
                    : "hover:bg-muted/50 border-transparent",
                  orderConfig && conv.orderStatus === 'ready' && "border-green-300 bg-green-50/50 dark:bg-green-950/20"
                )}
                onClick={() => onSelect(conv.id)}
                data-testid={`conversation-item-${conv.id}`}
              >
                <Avatar className="h-12 w-12 border border-border shadow-sm flex-shrink-0">
                  <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${conv.contactName || conv.waId}`} />
                  <AvatarFallback>
                    <User className="h-5 w-5 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {conv.isPinned && <Pin className="h-3 w-3 text-primary flex-shrink-0" />}
                      <span className={cn(
                        "font-semibold truncate text-sm",
                        activeId === conv.id ? "text-primary" : "text-foreground"
                      )}>
                        {conv.contactName || conv.waId}
                      </span>
                      {label && (
                        <Badge className={cn("text-[10px] px-1.5 py-0 flex-shrink-0", LABEL_COLORS[label.color] || "bg-gray-500")}>
                          {label.name}
                        </Badge>
                      )}
                      {OrderIcon && (
                        <div className={cn("flex items-center gap-1 flex-shrink-0", orderConfig?.className)} title={orderConfig?.label}>
                          <OrderIcon className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    {conv.lastMessageTimestamp && (
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {format(new Date(conv.lastMessageTimestamp), 'MMM d, h:mm a')}
                      </span>
                    )}
                  </div>
                  
                  <p className="text-sm text-muted-foreground truncate pr-2 leading-relaxed">
                    {conv.lastMessage || <span className="italic opacity-50">Sin mensajes</span>}
                  </p>
                </div>

                {/* Pin button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
                    conv.isPinned && "opacity-100 text-primary"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePinMutation.mutate({ id: conv.id, isPinned: !conv.isPinned });
                  }}
                  data-testid={`button-pin-${conv.id}`}
                >
                  <Pin className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
