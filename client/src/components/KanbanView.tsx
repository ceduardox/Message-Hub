import { useState } from "react";
import type { Conversation } from "@shared/schema";
import { useConversation } from "@/hooks/use-inbox";
import { ChatArea } from "./ChatArea";
import { Phone, Clock, ChevronDown } from "lucide-react";
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
  items: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  columnType: "humano" | "nuevo" | "llamar" | "listo" | "entregado";
}

function getInitials(name: string): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatDate(timestamp: Date | string | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  const timeStr = date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) {
    return `Hoy, ${timeStr}`;
  }
  
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${monthNames[date.getMonth()]} ${date.getDate()}, ${timeStr}`;
}

function KanbanCard({ 
  conv, 
  isActive, 
  onSelect,
  columnType
}: { 
  conv: Conversation; 
  isActive: boolean; 
  onSelect: () => void;
  columnType: "humano" | "nuevo" | "llamar" | "listo" | "entregado";
}) {
  const name = conv.contactName || conv.waId;
  
  const getBadgeConfig = () => {
    switch (columnType) {
      case "humano":
        return { text: "Interacción Humana", bgColor: "bg-emerald-100", textColor: "text-emerald-700", dotColor: "bg-emerald-500" };
      case "llamar":
        return { text: "test principal", bgColor: "bg-emerald-100", textColor: "text-emerald-700", dotColor: "bg-emerald-500" };
      case "listo":
        return { text: "Listo", bgColor: "bg-blue-100", textColor: "text-blue-700", dotColor: "bg-blue-500" };
      case "entregado":
        return { text: "Entregado", bgColor: "bg-gray-100", textColor: "text-gray-600", dotColor: "bg-gray-500" };
      default:
        return null;
    }
  };
  
  const badge = getBadgeConfig();
  const showPhone = conv.shouldCall || columnType === "llamar";
  
  return (
    <div
      onClick={onSelect}
      className={cn(
        "bg-white rounded-xl p-4 shadow-sm cursor-pointer transition-all",
        "hover:shadow-md border border-gray-100",
        isActive && "ring-2 ring-primary shadow-md"
      )}
      data-testid={`kanban-card-${conv.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {getInitials(name)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-gray-900 truncate">
              {name}
            </span>
            {showPhone && (
              <Phone className="h-5 w-5 text-emerald-500 flex-shrink-0" fill="currentColor" />
            )}
          </div>
          
          {badge && (
            <div className={cn(
              "inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
              badge.bgColor, badge.textColor
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full", badge.dotColor)} />
              {badge.text}
            </div>
          )}
          
          {columnType === "nuevo" && conv.lastMessage && (
            <p className="text-sm text-gray-700 mt-2 line-clamp-2">
              {conv.lastMessage}
            </p>
          )}
          
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
            {columnType === "nuevo" && <Clock className="h-3 w-3" />}
            <span>{formatDate(conv.lastMessageTimestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ title, items, activeId, onSelect, columnType }: ColumnProps) {
  return (
    <div className="flex flex-col h-full min-w-0 flex-1 bg-gray-50">
      <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-100">
        <span className="font-medium text-gray-800">{title}</span>
        <span className="text-sm text-gray-400">{items.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin conversaciones</p>
        ) : (
          items.map((conv) => (
            <KanbanCard
              key={conv.id}
              conv={conv}
              isActive={activeId === conv.id}
              onSelect={() => onSelect(conv.id)}
              columnType={columnType}
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
  const entregados = conversations.filter(c => c.orderStatus === "delivered" && !c.needsHumanAttention);
  const listos = conversations.filter(c => c.orderStatus === "ready" && !c.needsHumanAttention);
  const llamar = conversations.filter(c => 
    c.shouldCall && !c.needsHumanAttention && c.orderStatus !== "ready" && c.orderStatus !== "delivered"
  );
  const nuevos = conversations.filter(c => 
    !c.orderStatus && !c.shouldCall && !c.needsHumanAttention
  );

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col w-full bg-gray-100">
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 grid grid-cols-5 gap-px min-h-0 overflow-hidden">
          <KanbanColumn
            title="Interacción Humana"
            items={humano}
            activeId={activeId}
            onSelect={setActiveId}
            columnType="humano"
          />
          <KanbanColumn
            title="Esperando Confirmaci."
            items={nuevos}
            activeId={activeId}
            onSelect={setActiveId}
            columnType="nuevo"
          />
          <KanbanColumn
            title="Llamar"
            items={llamar}
            activeId={activeId}
            onSelect={setActiveId}
            columnType="llamar"
          />
          <KanbanColumn
            title="Listo para Enviar"
            items={listos}
            activeId={activeId}
            onSelect={setActiveId}
            columnType="listo"
          />
          <KanbanColumn
            title="Enviados y Entregados"
            items={entregados}
            activeId={activeId}
            onSelect={setActiveId}
            columnType="entregado"
          />
        </div>

        {activeId && activeConversation ? (
          <div className="w-[500px] border-l border-gray-200 flex-shrink-0 bg-white">
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
