import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useConversations, useConversation } from "@/hooks/use-inbox";
import { ConversationList } from "@/components/ConversationList";
import { ChatArea } from "@/components/ChatArea";
import { Button } from "@/components/ui/button";
import { LogOut, MessageSquareDashed, Bot } from "lucide-react";
import { Link } from "wouter";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

export default function InboxPage() {
  const { logout, user } = useAuth();
  const [activeId, setActiveId] = useState<number | null>(null);
  const { data: conversations = [], isLoading: loadingList } = useConversations();
  const { data: activeConversation } = useConversation(activeId);

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-background text-foreground flex flex-col md:flex-row">
      {/* Mobile Sidebar (Always visible on mobile if no active chat, hidden if chat active) */}
      <div className={`md:hidden flex flex-col h-full ${activeId ? 'hidden' : 'flex'}`}>
        <div className="flex-1 overflow-hidden">
          <ConversationList 
            conversations={conversations}
            activeId={activeId}
            onSelect={setActiveId}
            isLoading={loadingList}
          />
        </div>
        <div className="p-4 border-t border-border space-y-2 flex-shrink-0 bg-background">
          <Link href="/ai-agent">
            <Button 
              variant="outline" 
              className="w-full justify-start"
              data-testid="button-ai-agent-mobile"
            >
              <Bot className="mr-2 h-4 w-4" />
              Agente IA
            </Button>
          </Link>
          <Button 
            variant="outline" 
            className="w-full justify-start text-muted-foreground"
            onClick={() => logout()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar Sesión
          </Button>
        </div>
      </div>

      {/* Desktop Layout - Resizable */}
      <div className="hidden md:block h-full w-full">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={30} minSize={25} maxSize={40} className="border-r border-border bg-white flex flex-col">
            <div className="flex-1 overflow-hidden">
              <ConversationList 
                conversations={conversations}
                activeId={activeId}
                onSelect={setActiveId}
                isLoading={loadingList}
              />
            </div>
            
            <div className="p-4 border-t border-border bg-muted/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {user?.username?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium">{user?.username}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Link href="/ai-agent">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      title="Agente IA"
                      data-testid="button-ai-agent-desktop"
                    >
                      <Bot className="h-4 w-4 text-muted-foreground hover:text-primary" />
                    </Button>
                  </Link>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => logout()}
                    title="Logout"
                  >
                    <LogOut className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          </ResizablePanel>
          
          <ResizableHandle />
          
          <ResizablePanel defaultSize={70}>
            {activeId && activeConversation ? (
              <ChatArea 
                conversation={activeConversation.conversation} 
                messages={activeConversation.messages} 
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center bg-muted/10 p-8 text-center">
                <div className="h-24 w-24 bg-white rounded-3xl shadow-lg shadow-black/5 flex items-center justify-center mb-6">
                  <MessageSquareDashed className="h-10 w-10 text-primary/50" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">Welcome to WhatsApp Inbox</h2>
                <p className="text-muted-foreground mt-2 max-w-sm">
                  Select a conversation from the sidebar to start messaging. 
                  Incoming messages will automatically appear here.
                </p>
                <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground bg-white px-3 py-1.5 rounded-full border border-border shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Connected to WhatsApp Webhook
                </div>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile Chat View (Only visible if chat active) */}
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
