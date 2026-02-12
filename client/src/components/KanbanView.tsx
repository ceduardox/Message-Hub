import { useState } from "react";
import type { Conversation, Label } from "@shared/schema";
import { useConversation } from "@/hooks/use-inbox";
import { ChatArea } from "./ChatArea";
import { Phone, Clock, ChevronDown, AlertCircle, Truck, CheckCircle, Zap, ArrowLeft, Tag, Filter, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

// CSS animation keyframes - Futuristic style
const pulseAnimation = `
@keyframes pulse-urgent {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes ring-pulse {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
  70% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
@keyframes glow-line {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes scan-line {
  0% { transform: translateY(-100%); opacity: 0; }
  50% { opacity: 0.5; }
  100% { transform: translateY(100%); opacity: 0; }
}
.animate-pulse-urgent { animation: pulse-urgent 1.5s ease-in-out infinite; }
.animate-ring-pulse { animation: ring-pulse 1.5s ease-in-out infinite; }
.animate-glow-line { 
  background: linear-gradient(90deg, transparent, rgba(16,185,129,0.3), transparent);
  background-size: 200% 100%;
  animation: glow-line 3s ease-in-out infinite;
}
.animate-scan-line { animation: scan-line 4s ease-in-out infinite; }
`;

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
  columnType: "humano" | "nuevo" | "llamar" | "proceso" | "listo" | "entregado";
  labels: Label[];
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
  columnType,
  labels
}: { 
  conv: Conversation; 
  isActive: boolean; 
  onSelect: () => void;
  columnType: "humano" | "nuevo" | "llamar" | "proceso" | "listo" | "entregado";
  labels: Label[];
}) {
  const name = conv.contactName || conv.waId;
  
  const getBadgeConfig = () => {
    switch (columnType) {
      case "humano":
        return { text: "Urgente", bgColor: "bg-red-500/20", textColor: "text-red-400", dotColor: "bg-red-500" };
      case "llamar":
        return { text: "Llamar", bgColor: "bg-emerald-500/20", textColor: "text-emerald-400", dotColor: "bg-emerald-500" };
      case "proceso":
        return { text: "En Proceso", bgColor: "bg-amber-500/20", textColor: "text-amber-400", dotColor: "bg-amber-500" };
      case "listo":
        return { text: "Listo", bgColor: "bg-cyan-500/20", textColor: "text-cyan-400", dotColor: "bg-cyan-500" };
      case "entregado":
        return { text: "Entregado", bgColor: "bg-slate-500/20", textColor: "text-slate-400", dotColor: "bg-slate-500" };
      default:
        return null;
    }
  };

  const getCardStyle = () => {
    switch (columnType) {
      case "humano":
        return "border-l-2 border-l-red-500 bg-slate-800/80 hover:bg-slate-700/80";
      case "llamar":
        return "border-l-2 border-l-emerald-500 bg-slate-800/80 hover:bg-slate-700/80";
      case "proceso":
        return "border-l-2 border-l-amber-500 bg-slate-800/80 hover:bg-slate-700/80";
      case "listo":
        return "border-l-2 border-l-cyan-500 bg-slate-800/80 hover:bg-slate-700/80";
      case "entregado":
        return "border-l-2 border-l-slate-500 bg-slate-800/80 hover:bg-slate-700/80";
      default:
        return "bg-slate-800/80 hover:bg-slate-700/80";
    }
  };

  const getAvatarColor = () => {
    switch (columnType) {
      case "humano": return "bg-gradient-to-br from-red-500 to-rose-600";
      case "llamar": return "bg-gradient-to-br from-emerald-500 to-teal-600";
      case "proceso": return "bg-gradient-to-br from-amber-500 to-orange-600";
      case "listo": return "bg-gradient-to-br from-cyan-500 to-blue-600";
      case "entregado": return "bg-gradient-to-br from-slate-500 to-slate-600";
      default: return "bg-gradient-to-br from-emerald-500 to-cyan-600";
    }
  };
  
  const badge = getBadgeConfig();
  const showPhone = conv.shouldCall || columnType === "llamar";
  const isUrgent = columnType === "humano";
  
  return (
    <div
      onClick={onSelect}
      className={cn(
        "rounded-xl p-4 cursor-pointer backdrop-blur-sm select-none",
        "border border-slate-700/50 shadow-lg shadow-black/20",
        "transition-transform duration-100 active:scale-[0.97]",
        getCardStyle(),
        isActive && "ring-2 ring-emerald-500/50 shadow-emerald-500/20",
        isUrgent && "animate-ring-pulse"
      )}
      data-testid={`kanban-card-${conv.id}`}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-lg",
          getAvatarColor()
        )}>
          {getInitials(name)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-white truncate">
              {name}
            </span>
            <div className="flex items-center gap-1">
              {isUrgent && (
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 animate-pulse-urgent" />
              )}
              {showPhone && (
                <Phone className="h-5 w-5 text-emerald-400 flex-shrink-0 animate-pulse-urgent" fill="currentColor" />
              )}
              {columnType === "listo" && (
                <CheckCircle className="h-5 w-5 text-cyan-400 flex-shrink-0" />
              )}
              {columnType === "entregado" && (
                <Truck className="h-5 w-5 text-slate-400 flex-shrink-0" />
              )}
            </div>
          </div>
          
          {badge && (
            <div className={cn(
              "inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium border border-current/20",
              badge.bgColor, badge.textColor
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", badge.dotColor)} />
              {badge.text}
            </div>
          )}
          
          {conv.labelId && (() => {
            const label = labels.find(l => l.id === conv.labelId);
            if (!label) return null;
            const colorMap: Record<string, string> = {
              blue: "bg-blue-500/20 text-blue-400",
              green: "bg-green-500/20 text-green-400",
              yellow: "bg-yellow-500/20 text-yellow-400",
              red: "bg-red-500/20 text-red-400",
              purple: "bg-purple-500/20 text-purple-400",
              orange: "bg-orange-500/20 text-orange-400",
            };
            return (
              <div className={cn("inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium", colorMap[label.color] || "bg-slate-500/20 text-slate-400")} data-testid={`text-label-${label.id}-conv-${conv.id}`}>
                <Tag className="h-2.5 w-2.5" />
                {label.name}
              </div>
            );
          })()}

          {columnType === "nuevo" && conv.lastMessage && (
            <p className="text-sm text-slate-400 mt-2 line-clamp-2">
              {conv.lastMessage}
            </p>
          )}
          
          <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
            {columnType === "nuevo" && <Clock className="h-3 w-3" />}
            <span>{formatDate(conv.lastMessageTimestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ title, items, activeId, onSelect, columnType, labels }: ColumnProps) {
  const getColumnHeaderStyle = () => {
    switch (columnType) {
      case "humano":
        return "from-red-600/80 to-rose-600/80";
      case "llamar":
        return "from-emerald-600/80 to-teal-600/80";
      case "proceso":
        return "from-amber-600/80 to-orange-600/80";
      case "listo":
        return "from-cyan-600/80 to-blue-600/80";
      case "entregado":
        return "from-slate-600/80 to-slate-700/80";
      default:
        return "from-slate-700/80 to-slate-800/80";
    }
  };

  const getColumnGlow = () => {
    switch (columnType) {
      case "humano": return "shadow-red-500/20";
      case "llamar": return "shadow-emerald-500/20";
      case "proceso": return "shadow-amber-500/20";
      case "listo": return "shadow-cyan-500/20";
      case "entregado": return "shadow-slate-500/20";
      default: return "shadow-slate-500/20";
    }
  };

  const getColumnIcon = () => {
    switch (columnType) {
      case "humano":
        return <AlertCircle className="h-4 w-4" />;
      case "llamar":
        return <Phone className="h-4 w-4" />;
      case "proceso":
        return <Package className="h-4 w-4" />;
      case "listo":
        return <CheckCircle className="h-4 w-4" />;
      case "entregado":
        return <Truck className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <div className={cn(
      "flex flex-col h-full min-w-0 flex-1 mx-1.5 first:ml-0 last:mr-0",
      "bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/30",
      "shadow-xl", getColumnGlow()
    )}>
      <div className={cn(
        "flex items-center gap-2 px-4 py-3 rounded-t-2xl relative overflow-hidden",
        "bg-gradient-to-r backdrop-blur-sm text-white",
        getColumnHeaderStyle()
      )}>
        <div className="absolute inset-0 animate-glow-line" />
        <div className="relative flex items-center gap-2">
          {getColumnIcon()}
          <span className="font-semibold text-sm">{title}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm font-bold">
            {items.length}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {items.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
              <Zap className="h-5 w-5 text-slate-600" />
            </div>
            <p className="text-xs text-slate-500">Sin conversaciones</p>
          </div>
        ) : (
          items.map((conv) => (
            <KanbanCard
              key={conv.id}
              conv={conv}
              isActive={activeId === conv.id}
              onSelect={() => onSelect(conv.id)}
              columnType={columnType}
              labels={labels}
            />
          ))
        )}
      </div>
    </div>
  );
}

type TabType = "humano" | "nuevo" | "llamar" | "proceso" | "listo" | "entregado";

const tabConfig: { key: TabType; label: string; shortLabel: string; icon: typeof AlertCircle }[] = [
  { key: "humano", label: "Interacción Humana", shortLabel: "Humano", icon: AlertCircle },
  { key: "nuevo", label: "Esperando Confirmaci.", shortLabel: "Nuevos", icon: Clock },
  { key: "llamar", label: "Llamar", shortLabel: "Llamar", icon: Phone },
  { key: "proceso", label: "Pedido en Proceso", shortLabel: "Proceso", icon: Package },
  { key: "listo", label: "Listo para Enviar", shortLabel: "Listo", icon: CheckCircle },
  { key: "entregado", label: "Enviados y Entregados", shortLabel: "Enviado", icon: Truck },
];

export function KanbanView({ conversations, isLoading, daysToShow, onLoadMore, maxDays }: KanbanViewProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<TabType>("humano");
  const [filterLabelId, setFilterLabelId] = useState<number | null>(null);
  const { data: activeConversation } = useConversation(activeId);
  const { data: labels = [] } = useQuery<Label[]>({ queryKey: ["/api/labels"] });

  const filtered = filterLabelId ? conversations.filter(c => c.labelId === filterLabelId) : conversations;

  const humano = filtered.filter(c => c.needsHumanAttention);
  const entregados = filtered.filter(c => c.orderStatus === "delivered" && !c.needsHumanAttention);
  const listos = filtered.filter(c => c.orderStatus === "ready" && !c.needsHumanAttention);
  const llamar = filtered.filter(c => 
    c.shouldCall && !c.needsHumanAttention && c.orderStatus !== "pending" && c.orderStatus !== "ready" && c.orderStatus !== "delivered"
  );
  const enProceso = filtered.filter(c =>
    c.orderStatus === "pending" && !c.needsHumanAttention
  );
  const nuevos = filtered.filter(c => 
    !c.orderStatus && !c.shouldCall && !c.needsHumanAttention
  );

  const columnData: Record<TabType, { items: Conversation[]; title: string }> = {
    humano: { items: humano, title: "Interacción Humana" },
    nuevo: { items: nuevos, title: "Esperando Confirmaci." },
    llamar: { items: llamar, title: "Llamar" },
    proceso: { items: enProceso, title: "Pedido en Proceso" },
    listo: { items: listos, title: "Listo para Enviar" },
    entregado: { items: entregados, title: "Enviados y Entregados" },
  };

  const getTabColor = (tab: TabType, isActive: boolean) => {
    const colors: Record<TabType, string> = {
      humano: isActive ? "bg-red-500/20 text-red-400 border-red-500/50" : "text-slate-500 border-transparent",
      nuevo: isActive ? "bg-slate-600/30 text-slate-300 border-slate-500/50" : "text-slate-500 border-transparent",
      llamar: isActive ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" : "text-slate-500 border-transparent",
      proceso: isActive ? "bg-amber-500/20 text-amber-400 border-amber-500/50" : "text-slate-500 border-transparent",
      listo: isActive ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/50" : "text-slate-500 border-transparent",
      entregado: isActive ? "bg-slate-500/20 text-slate-400 border-slate-500/50" : "text-slate-500 border-transparent",
    };
    return colors[tab];
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin h-10 w-10 border-3 border-emerald-500 border-t-transparent rounded-full" />
          <span className="text-slate-400 text-sm">Cargando datos...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col w-full bg-gradient-to-br from-slate-900 via-emerald-950/30 to-slate-900 relative overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: pulseAnimation }} />
      
      {/* Animated background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s', animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '4s' }} />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>
      
      {labels.length > 0 && (
        <div className="relative z-10 flex items-center gap-2 px-3 py-2 bg-slate-800/60 backdrop-blur-lg border-b border-slate-700/30 overflow-x-auto">
          <Filter className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <button
            onClick={() => setFilterLabelId(null)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap select-none transition-transform duration-100 active:scale-95 border",
              !filterLabelId ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" : "text-slate-400 border-slate-600/50"
            )}
            data-testid="filter-label-all"
          >
            Todas
          </button>
          {labels.map(label => {
            const colorMap: Record<string, string> = {
              blue: "bg-blue-500/20 text-blue-400 border-blue-500/50",
              green: "bg-green-500/20 text-green-400 border-green-500/50",
              yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
              red: "bg-red-500/20 text-red-400 border-red-500/50",
              purple: "bg-purple-500/20 text-purple-400 border-purple-500/50",
              orange: "bg-orange-500/20 text-orange-400 border-orange-500/50",
            };
            const activeColor = colorMap[label.color] || "bg-slate-500/20 text-slate-400 border-slate-500/50";
            return (
              <button
                key={label.id}
                onClick={() => setFilterLabelId(filterLabelId === label.id ? null : label.id)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap select-none transition-transform duration-100 active:scale-95 border flex items-center gap-1",
                  filterLabelId === label.id ? activeColor : "text-slate-400 border-slate-600/50"
                )}
                data-testid={`filter-label-${label.id}`}
              >
                <Tag className="h-2.5 w-2.5" />
                {label.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Mobile: Tab bar - Futuristic */}
      <div className="md:hidden flex overflow-x-auto bg-slate-800/80 backdrop-blur-lg border-b border-slate-700/50 gap-1 p-2">
        {tabConfig.map((tab) => {
          const Icon = tab.icon;
          const count = columnData[tab.key].items.length;
          return (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap border select-none",
                "transition-transform duration-100 active:scale-95",
                getTabColor(tab.key, mobileTab === tab.key)
              )}
              data-testid={`tab-${tab.key}`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.shortLabel}</span>
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full font-bold",
                mobileTab === tab.key ? "bg-white/20" : "bg-slate-700"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mobile: Single column view */}
      <div className="md:hidden flex-1 overflow-hidden">
        {activeId && activeConversation ? (
          <div className="h-full flex flex-col bg-slate-900">
            <button
              onClick={() => setActiveId(null)}
              className="p-3 border-b border-slate-700 text-left text-sm text-emerald-400 font-medium flex items-center gap-2 bg-slate-800/50 select-none transition-transform duration-100 active:scale-95"
              data-testid="button-back-kanban"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al Kanban
            </button>
            <div className="flex-1 overflow-hidden">
              <ChatArea
                conversation={activeConversation.conversation}
                messages={activeConversation.messages}
              />
            </div>
          </div>
        ) : (
          <KanbanColumn
            title={columnData[mobileTab].title}
            items={columnData[mobileTab].items}
            activeId={activeId}
            onSelect={setActiveId}
            columnType={mobileTab}
            labels={labels}
          />
        )}
      </div>

      {/* Desktop: Grid view with glassmorphism */}
      <div className="hidden md:flex flex-1 min-h-0">
        <div className="flex-1 flex gap-0 min-h-0 overflow-hidden p-3">
          <KanbanColumn
            title="Interacción Humana"
            items={humano}
            activeId={activeId}
            onSelect={setActiveId}
            columnType="humano"
            labels={labels}
          />
          <KanbanColumn
            title="Esperando Confirmaci."
            items={nuevos}
            activeId={activeId}
            onSelect={setActiveId}
            columnType="nuevo"
            labels={labels}
          />
          <KanbanColumn
            title="Llamar"
            items={llamar}
            activeId={activeId}
            onSelect={setActiveId}
            columnType="llamar"
            labels={labels}
          />
          <KanbanColumn
            title="Pedido en Proceso"
            items={enProceso}
            activeId={activeId}
            onSelect={setActiveId}
            columnType="proceso"
            labels={labels}
          />
          <KanbanColumn
            title="Listo para Enviar"
            items={listos}
            activeId={activeId}
            onSelect={setActiveId}
            columnType="listo"
            labels={labels}
          />
          <KanbanColumn
            title="Enviados y Entregados"
            items={entregados}
            activeId={activeId}
            onSelect={setActiveId}
            columnType="entregado"
            labels={labels}
          />
        </div>

        {activeId && activeConversation ? (
          <div className="w-[420px] border-l border-slate-700/50 flex-shrink-0 bg-slate-900/80 backdrop-blur-xl">
            <ChatArea
              conversation={activeConversation.conversation}
              messages={activeConversation.messages}
            />
          </div>
        ) : null}
      </div>

      {daysToShow < maxDays && !activeId && (
        <div className="p-3 border-t border-slate-700/50 bg-slate-800/50 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            className="gap-2 bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/50"
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
