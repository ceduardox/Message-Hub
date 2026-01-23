import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, User, Clock } from "lucide-react";
import type { Conversation } from "@shared/schema";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  isLoading: boolean;
}

export function ConversationList({ 
  conversations, 
  activeId, 
  onSelect,
  isLoading 
}: ConversationListProps) {
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

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-4">
        <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-foreground">No conversations yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Incoming WhatsApp messages will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border/50 bg-background/50 backdrop-blur-sm sticky top-0 z-10">
        <h2 className="text-xl font-bold tracking-tight">Inbox</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {conversations.length} active conversation{conversations.length !== 1 ? 's' : ''}
        </p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={cn(
              "w-full flex items-start space-x-4 p-3 rounded-xl transition-all duration-200 text-left border border-transparent",
              activeId === conv.id 
                ? "bg-white shadow-md border-border ring-1 ring-primary/10" 
                : "hover:bg-muted/50 hover:scale-[1.02] active:scale-[0.98]"
            )}
          >
            <Avatar className="h-12 w-12 border border-border shadow-sm">
              <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${conv.contactName || conv.waId}`} />
              <AvatarFallback>
                <User className="h-5 w-5 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-1">
                <span className={cn(
                  "font-semibold truncate",
                  activeId === conv.id ? "text-primary" : "text-foreground"
                )}>
                  {conv.contactName || conv.waId}
                </span>
                {conv.lastMessageTimestamp && (
                  <span className="text-[10px] text-muted-foreground flex items-center flex-shrink-0 ml-2">
                    {format(new Date(conv.lastMessageTimestamp), 'MMM d, h:mm a')}
                  </span>
                )}
              </div>
              
              <p className="text-sm text-muted-foreground truncate pr-2 leading-relaxed">
                {conv.lastMessage || <span className="italic opacity-50">No messages yet</span>}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
