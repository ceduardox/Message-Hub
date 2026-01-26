import { useState } from "react";
import type { Conversation } from "@shared/schema";
import { useConversation } from "@/hooks/use-inbox";
import { ChatArea } from "./ChatArea";
import { Phone, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface KanbanViewProps {
  conversations: Conversation[];
  isLoading: boolean;
  daysToShow: number;
  onLoadMore: () => void;
  maxDays: number;
}

interface ColumnProps {
  title: string;
  items: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  badgeColor?: string;
  badgeText?: string;
}

function getInitials(name: string): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-red-500", "bg-green-500", "bg-blue-500", "bg-purple-500",
    "bg-orange-500", "bg-pink-500", "bg-teal-500", "bg-indigo-500"
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatDate(timestamp: Date | string | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function KanbanCard({ 
  conv, 
  isActive, 
  onSelect, 
  badgeColor, 
  badgeText 
}: { 
  conv: Conversation; 
  isActive: boolean; 
  onSelect: () => void;
  badgeColor?: string;
  badgeText?: string;
}) {
  const name = conv.contactName || conv.waId;
  
  return (
    <div
      onClick={onSelect}
      className={cn(
        "bg-white rounded-xl p-4 shadow-sm border cursor-pointer transition-all",
        "hover:shadow-md",
        isActive ? "ring-2 ring-primary shadow-md" : "border-gray-100"
      )}
      data-testid={`kanban-card-${conv.id}`}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0",
          getAvatarColor(name)
        )}>
          {getInitials(name)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm text-gray-900 truncate">
              {name}
            </span>
            {conv.shouldCall && (
              <Phone className="h-4 w-4 text-green-500 flex-shrink-0" />
            )}
          </div>
          
          {badgeText && (
            <Badge 
              variant="secondary" 
              className={cn("mt-1 text-xs font-normal", badgeColor)}
            >
              {badgeText}
            </Badge>
          )}
          
          <p className="text-xs text-gray-500 mt-1 truncate">
            {conv.lastMessage || "Sin mensajes"}
          </p>
          
          <p className="text-xs text-gray-400 mt-1">
            {formatDate(conv.lastMessageTimestamp)}
          </p>
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ title, items, activeId, onSelect, badgeColor, badgeText }: ColumnProps) {
  return (
    <div className="flex flex-col h-full min-w-0 flex-1">
      <div className="flex items-center gap-2 px-3 py-3 border-b bg-gray-50/80">
        <span className="font-medium text-gray-700">{title}</span>
        <span className="text-sm text-gray-400">{items.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50/50">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin conversaciones</p>
        ) : (
          items.map((conv) => (
            <KanbanCard
              key={conv.id}
              conv={conv}
              isActive={activeId === conv.id}
              onSelect={() => onSelect(conv.id)}
              badgeColor={badgeColor}
              badgeText={badgeText}
            />
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
  const entregados = conversations.filter(c => c.orderStatus === "delivered" && !c.needsHumanAttention);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col w-full">
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 grid grid-cols-5 gap-px bg-gray-200 min-h-0 overflow-hidden">
          <KanbanColumn
            title="Interacción Humana"
            items={humano}
            activeId={activeId}
            onSelect={setActiveId}
            badgeColor="bg-green-100 text-green-700"
            badgeText="Interacción Humana"
          />
          <KanbanColumn
            title="Esperando Confirmación"
            items={nuevos}
            activeId={activeId}
            onSelect={setActiveId}
          />
          <KanbanColumn
            title="Llamar"
            items={llamar}
            activeId={activeId}
            onSelect={setActiveId}
            badgeColor="bg-blue-100 text-blue-700"
            badgeText="Llamar"
          />
          <KanbanColumn
            title="Listo para Enviar"
            items={listos}
            activeId={activeId}
            onSelect={setActiveId}
            badgeColor="bg-purple-100 text-purple-700"
            badgeText="Listo"
          />
          <KanbanColumn
            title="Enviados y Entregados"
            items={entregados}
            activeId={activeId}
            onSelect={setActiveId}
            badgeColor="bg-gray-100 text-gray-600"
            badgeText="Entregado"
          />
        </div>

        {activeId && activeConversation ? (
          <div className="w-[500px] border-l border-border flex-shrink-0 bg-white">
            <ChatArea
              conversation={activeConversation.conversation}
              messages={activeConversation.messages}
            />
          </div>
        ) : null}
      </div>

      {daysToShow < maxDays && (
        <div className="p-2 border-t bg-white flex justify-center">
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
