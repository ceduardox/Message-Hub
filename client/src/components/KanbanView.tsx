import { useState } from "react";
import type { Conversation } from "@shared/schema";
import { useConversation } from "@/hooks/use-inbox";
import { ChatArea } from "./ChatArea";
import { Phone, Package, Truck, MessageSquare, AlertCircle, ChevronDown, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface KanbanViewProps {
  conversations: Conversation[];
  isLoading: boolean;
  daysToShow: number;
  onLoadMore: () => void;
  maxDays: number;
}

interface ColumnProps {
  title: string;
  icon: React.ReactNode;
  items: Conversation[];
  color: string;
  activeId: number | null;
  onSelect: (id: number) => void;
}

function KanbanColumn({ title, icon, items, color, activeId, onSelect }: ColumnProps) {
  return (
    <div className="flex flex-col h-full min-w-0 flex-1">
      <div className={cn("flex items-center gap-2 px-3 py-2 border-b", color)}>
        {icon}
        <span className="font-medium text-sm">{title}</span>
        <span className="ml-auto text-xs bg-white/80 px-1.5 py-0.5 rounded-full font-medium">
          {items.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-muted/30">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Sin conversaciones</p>
        ) : (
          items.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                "p-3 rounded-lg border cursor-pointer transition-all",
                "hover:shadow-md hover:border-primary/30",
                activeId === conv.id 
                  ? "bg-primary/10 border-primary shadow-sm" 
                  : "bg-white border-border",
                conv.needsHumanAttention && "border-l-4 border-l-red-500"
              )}
              data-testid={`kanban-card-${conv.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">
                    {conv.contactName || conv.waId}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conv.lastMessage || "Sin mensajes"}
                  </p>
                </div>
                {conv.needsHumanAttention && (
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function KanbanView({ conversations, isLoading, daysToShow, onLoadMore, maxDays }: KanbanViewProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const { data: activeConversation } = useConversation(activeId);

  const humano = conversations.filter(c => c.needsHumanAttention);
  const nuevos = conversations.filter(c => 
    !c.orderStatus && !c.shouldCall && !c.needsHumanAttention
  );
  const llamar = conversations.filter(c => c.shouldCall && !c.needsHumanAttention);
  const listos = conversations.filter(c => c.orderStatus === "ready" && !c.needsHumanAttention);
  const entregados = conversations.filter(c => c.orderStatus === "delivered");

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 grid grid-cols-5 gap-1 min-h-0 overflow-hidden">
          <KanbanColumn
            title="Humano"
            icon={<UserRound className="h-4 w-4 text-red-600" />}
            items={humano}
            color="bg-red-100"
            activeId={activeId}
            onSelect={setActiveId}
          />
          <KanbanColumn
            title="Nuevos"
            icon={<MessageSquare className="h-4 w-4" />}
            items={nuevos}
            color="bg-slate-100"
            activeId={activeId}
            onSelect={setActiveId}
          />
          <KanbanColumn
            title="Llamar"
            icon={<Phone className="h-4 w-4 text-green-600" />}
            items={llamar}
            color="bg-green-100"
            activeId={activeId}
            onSelect={setActiveId}
          />
          <KanbanColumn
            title="Listo"
            icon={<Package className="h-4 w-4 text-blue-600" />}
            items={listos}
            color="bg-blue-100"
            activeId={activeId}
            onSelect={setActiveId}
          />
          <KanbanColumn
            title="Entregado"
            icon={<Truck className="h-4 w-4 text-purple-600" />}
            items={entregados}
            color="bg-purple-100"
            activeId={activeId}
            onSelect={setActiveId}
          />
        </div>

        {activeId && activeConversation ? (
          <div className="w-[500px] border-l border-border flex-shrink-0">
            <ChatArea
              conversation={activeConversation.conversation}
              messages={activeConversation.messages}
            />
          </div>
        ) : null}
      </div>

      {daysToShow < maxDays && (
        <div className="p-2 border-t bg-muted/20 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            className="gap-2"
            data-testid="button-load-more"
          >
            <ChevronDown className="h-4 w-4" />
            Ver más días ({daysToShow} de {maxDays})
          </Button>
        </div>
      )}
    </div>
  );
}
