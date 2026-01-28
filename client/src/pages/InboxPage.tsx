import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useConversations } from "@/hooks/use-inbox";
import { NotificationBell } from "@/components/NotificationBell";
import { KanbanView } from "@/components/KanbanView";
import { Button } from "@/components/ui/button";
import { LogOut, Bot, ClipboardList, LayoutGrid, Sparkles, MessageSquare } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function InboxPage() {
  const { logout, user } = useAuth();
  const [daysToShow, setDaysToShow] = useState(1);
  const [location] = useLocation();
  const maxDays = 3;
  
  const { data: conversations = [], isLoading: loadingList } = useConversations();

  const filteredConversations = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - daysToShow * 24 * 60 * 60 * 1000);
    
    return conversations
      .filter(c => {
        if (!c.lastMessageTimestamp) return true;
        return new Date(c.lastMessageTimestamp) >= cutoff;
      })
      .slice(0, 50 * daysToShow);
  }, [conversations, daysToShow]);

  const handleLoadMore = () => {
    if (daysToShow < maxDays) {
      setDaysToShow(d => d + 1);
    }
  };

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-gray-50 text-foreground flex flex-col">
      {/* Desktop Header */}
      <div className="hidden md:flex items-center justify-between px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 flex-shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white flex items-center gap-2">
              Ryztor Agent IA
              <Sparkles className="h-4 w-4 text-yellow-300" />
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <Link href="/ai-agent">
            <Button variant="ghost" size="icon" title="Agente IA" data-testid="button-ai-agent-desktop" className="text-white/80 hover:text-white hover:bg-white/10">
              <Bot className="h-5 w-5" />
            </Button>
          </Link>
          <Link href="/follow-up">
            <Button variant="ghost" size="icon" title="Seguimiento" data-testid="button-follow-up-desktop" className="text-white/80 hover:text-white hover:bg-white/10">
              <ClipboardList className="h-5 w-5" />
            </Button>
          </Link>
          <div className="h-6 w-px bg-white/20 mx-2" />
          <span className="text-sm text-white/80 font-medium">{user?.username}</span>
          <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout" className="text-white/80 hover:text-white hover:bg-white/10">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Kanban View - responsive para móvil y desktop */}
      <div className="flex flex-1 min-h-0 pb-14 md:pb-0">
        <KanbanView
          conversations={filteredConversations}
          isLoading={loadingList}
          daysToShow={daysToShow}
          onLoadMore={handleLoadMore}
          maxDays={maxDays}
        />
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-200 flex justify-around items-center py-2 px-1 z-50 shadow-lg shadow-black/5">
        <Link href="/">
          <button className={`flex flex-col items-center px-4 py-1.5 rounded-xl transition-all ${location === '/' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400'}`}>
            <LayoutGrid className="h-5 w-5" />
            <span className="text-[10px] mt-0.5 font-medium">Inbox</span>
          </button>
        </Link>
        <Link href="/ai-agent">
          <button className={`flex flex-col items-center px-4 py-1.5 rounded-xl transition-all ${location === '/ai-agent' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400'}`}>
            <Bot className="h-5 w-5" />
            <span className="text-[10px] mt-0.5 font-medium">IA</span>
          </button>
        </Link>
        <Link href="/follow-up">
          <button className={`flex flex-col items-center px-4 py-1.5 rounded-xl transition-all ${location === '/follow-up' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400'}`}>
            <ClipboardList className="h-5 w-5" />
            <span className="text-[10px] mt-0.5 font-medium">Seguir</span>
          </button>
        </Link>
        <NotificationBell />
        <button 
          onClick={() => logout()} 
          className="flex flex-col items-center px-4 py-1.5 rounded-xl text-gray-400 transition-all"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-[10px] mt-0.5 font-medium">Salir</span>
        </button>
      </div>
    </div>
  );
}
