import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useConversations, useConversation } from "@/hooks/use-inbox";
import { ConversationList } from "@/components/ConversationList";
import { ChatArea } from "@/components/ChatArea";
import { NotificationBell } from "@/components/NotificationBell";
import { KanbanView } from "@/components/KanbanView";
import { Button } from "@/components/ui/button";
import { LogOut, Bot, ClipboardList } from "lucide-react";
import { Link } from "wouter";

export default function InboxPage() {
  const { logout, user } = useAuth();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [daysToShow, setDaysToShow] = useState(1);
  const maxDays = 3;
  
  const { data: conversations = [], isLoading: loadingList } = useConversations();
  const { data: activeConversation } = useConversation(activeId);

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

      {/* Desktop Kanban View */}
      <div className="hidden md:flex flex-1 min-h-0">
        <KanbanView
          conversations={filteredConversations}
          isLoading={loadingList}
          daysToShow={daysToShow}
          onLoadMore={handleLoadMore}
          maxDays={maxDays}
        />
      </div>

      {/* Mobile: Lista de conversaciones (vista original) */}
      <div className={`md:hidden flex flex-col h-full ${activeId ? 'hidden' : 'flex'}`}>
        <div className="flex-1 overflow-hidden">
          <ConversationList 
            conversations={filteredConversations}
            activeId={activeId}
            onSelect={setActiveId}
            isLoading={loadingList}
          />
        </div>
        <div className="p-4 border-t border-border space-y-2 flex-shrink-0 bg-background">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{user?.username}</span>
            <NotificationBell />
          </div>
          <Link href="/ai-agent">
            <Button variant="outline" className="w-full justify-start" data-testid="button-ai-agent-mobile">
              <Bot className="mr-2 h-4 w-4" />
              Agente IA
            </Button>
          </Link>
          <Link href="/follow-up">
            <Button variant="outline" className="w-full justify-start" data-testid="button-follow-up-mobile">
              <ClipboardList className="mr-2 h-4 w-4" />
              Seguimiento
            </Button>
          </Link>
          <Button variant="outline" className="w-full justify-start text-muted-foreground" onClick={() => logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar Sesión
          </Button>
        </div>
      </div>

      {/* Mobile Chat View */}
      <div className={`md:hidden flex flex-col h-full ${activeId ? 'flex' : 'hidden'}`}>
        {activeId && activeConversation && (
          <>
            <div className="p-2 bg-white border-b border-border flex items-center flex-shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setActiveId(null)}>
                ← Volver
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <ChatArea 
                conversation={activeConversation.conversation} 
                messages={activeConversation.messages} 
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
