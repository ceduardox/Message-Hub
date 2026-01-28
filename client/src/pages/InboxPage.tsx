import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useConversations } from "@/hooks/use-inbox";
import { NotificationBell } from "@/components/NotificationBell";
import { KanbanView } from "@/components/KanbanView";
import { Button } from "@/components/ui/button";
import { LogOut, Bot, ClipboardList, LayoutGrid, Sparkles, MessageSquare, Zap, Activity } from "lucide-react";
import { Link, useLocation } from "wouter";

const pulseLineAnimation = `
@keyframes pulse-line {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.animate-pulse-line { animation: pulse-line 3s ease-in-out infinite; }
`;

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
    <div className="h-[100dvh] w-full overflow-hidden bg-slate-900 text-foreground flex flex-col">
      <style dangerouslySetInnerHTML={{ __html: pulseLineAnimation }} />
      
      {/* Desktop Header - Futuristic */}
      <div className="hidden md:flex items-center justify-between px-5 py-3 bg-slate-800/80 backdrop-blur-lg flex-shrink-0 border-b border-emerald-500/20 relative overflow-hidden">
        {/* Animated line effect */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500 to-transparent animate-pulse-line" />
        
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white flex items-center gap-2">
              Ryztor Agent <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">IA</span>
              <Zap className="h-4 w-4 text-yellow-400" />
            </h1>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Activity className="h-3 w-3 text-emerald-400" />
              Sistema activo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <Link href="/ai-agent">
            <Button variant="ghost" size="icon" title="Agente IA" data-testid="button-ai-agent-desktop" className="text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10">
              <Bot className="h-5 w-5" />
            </Button>
          </Link>
          <Link href="/follow-up">
            <Button variant="ghost" size="icon" title="Seguimiento" data-testid="button-follow-up-desktop" className="text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10">
              <ClipboardList className="h-5 w-5" />
            </Button>
          </Link>
          <div className="h-6 w-px bg-slate-600 mx-2" />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600">
            <div className="h-2 w-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-sm text-slate-300 font-medium">{user?.username}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout" className="text-slate-400 hover:text-red-400 hover:bg-red-500/10">
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

      {/* Mobile Bottom Navigation - Futuristic */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-emerald-500/20 flex justify-around items-center py-2 px-1 z-50">
        <Link href="/">
          <button className={`flex flex-col items-center px-4 py-1.5 rounded-xl transition-all ${location === '/' ? 'text-emerald-400 bg-emerald-500/20' : 'text-slate-500'}`}>
            <LayoutGrid className="h-5 w-5" />
            <span className="text-[10px] mt-0.5 font-medium">Inbox</span>
          </button>
        </Link>
        <Link href="/ai-agent">
          <button className={`flex flex-col items-center px-4 py-1.5 rounded-xl transition-all ${location === '/ai-agent' ? 'text-emerald-400 bg-emerald-500/20' : 'text-slate-500'}`}>
            <Bot className="h-5 w-5" />
            <span className="text-[10px] mt-0.5 font-medium">IA</span>
          </button>
        </Link>
        <Link href="/follow-up">
          <button className={`flex flex-col items-center px-4 py-1.5 rounded-xl transition-all ${location === '/follow-up' ? 'text-emerald-400 bg-emerald-500/20' : 'text-slate-500'}`}>
            <ClipboardList className="h-5 w-5" />
            <span className="text-[10px] mt-0.5 font-medium">Seguir</span>
          </button>
        </Link>
        <NotificationBell />
        <button 
          onClick={() => logout()} 
          className="flex flex-col items-center px-4 py-1.5 rounded-xl text-slate-500 transition-all"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-[10px] mt-0.5 font-medium">Salir</span>
        </button>
      </div>
    </div>
  );
}
