import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useConversations } from "@/hooks/use-inbox";
import { NotificationBell } from "@/components/NotificationBell";
import { KanbanView } from "@/components/KanbanView";
import { Button } from "@/components/ui/button";
import { LogOut, Bot, ClipboardList } from "lucide-react";
import { Link } from "wouter";

export default function InboxPage() {
  const { logout, user } = useAuth();
  const [daysToShow, setDaysToShow] = useState(1);
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
    <div className="h-[100dvh] w-full overflow-hidden bg-background text-foreground flex flex-col">
      {/* Desktop Header */}
      <div className="hidden md:flex items-center justify-between px-4 py-2 border-b bg-white flex-shrink-0">
        <h1 className="font-semibold text-lg">WhatsApp Inbox</h1>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Link href="/ai-agent">
            <Button variant="ghost" size="icon" title="Agente IA" data-testid="button-ai-agent-desktop">
              <Bot className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/follow-up">
            <Button variant="ghost" size="icon" title="Seguimiento" data-testid="button-follow-up-desktop">
              <ClipboardList className="h-4 w-4" />
            </Button>
          </Link>
          <span className="text-sm text-muted-foreground">{user?.username}</span>
          <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Kanban View - responsive para móvil y desktop */}
      <div className="flex flex-1 min-h-0">
        <KanbanView
          conversations={filteredConversations}
          isLoading={loadingList}
          daysToShow={daysToShow}
          onLoadMore={handleLoadMore}
          maxDays={maxDays}
        />
      </div>
    </div>
  );
}
