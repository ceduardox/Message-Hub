import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useSendMessage } from "@/hooks/use-inbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Image as ImageIcon, Phone, MoreVertical, Plus, Check, CheckCheck, MapPin, Bug, Copy, ExternalLink, X } from "lucide-react";
import type { Conversation, Message } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface ChatAreaProps {
  conversation: Conversation;
  messages: Message[];
}

export function ChatArea({ conversation, messages }: ChatAreaProps) {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [showImageInput, setShowImageInput] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { mutate: sendMessage, isPending } = useSendMessage();
  const { toast } = useToast();

  const getLocationUrl = (msg: Message) => {
    const raw = msg.rawJson as any;
    if (raw?.location) {
      const { latitude, longitude } = raw.location;
      return `https://www.google.com/maps?q=${latitude},${longitude}`;
    }
    return null;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: "URL copiada al portapapeles" });
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!text.trim() && !imageUrl.trim()) || isPending) return;

    sendMessage(
      {
        to: conversation.waId,
        type: imageUrl ? "image" : "text",
        text: text.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        caption: imageUrl && text ? text : undefined
      },
      {
        onSuccess: () => {
          setText("");
          setImageUrl("");
          setShowImageInput(false);
        }
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f2f5]/50 relative">
      {/* Chat Header */}
      <header className="h-[72px] bg-white border-b border-border/50 flex items-center justify-between px-6 shadow-sm z-20">
        <div className="flex items-center space-x-4">
          <Avatar className="h-10 w-10 border border-border">
            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${conversation.contactName || conversation.waId}`} />
            <AvatarFallback>{conversation.waId.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-bold text-foreground leading-none">
              {conversation.contactName || conversation.waId}
            </h3>
            <span className="text-xs text-muted-foreground mt-1 block">
              +{conversation.waId}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-1 text-muted-foreground">
          <Button variant="ghost" size="icon" className="hover:text-primary">
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="hover:text-primary">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Messages List */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-fixed bg-opacity-5"
      >
        {messages.map((msg) => {
          const isOut = msg.direction === "out";
          return (
            <div
              key={msg.id}
              className={cn(
                "flex w-full",
                isOut ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "message-bubble max-w-[70%] sm:max-w-[60%] rounded-2xl p-3 text-sm md:text-base leading-relaxed break-words",
                  isOut 
                    ? "bg-[var(--bubble-out)] text-[var(--bubble-out-fg)] rounded-tr-none" 
                    : "bg-[var(--bubble-in)] text-[var(--bubble-in-fg)] rounded-tl-none border border-border/30"
                )}
              >
                {/* Image Content */}
                {(msg.type === "image" || msg.mediaId) && (
                  <div className="mb-2 rounded-lg overflow-hidden border border-black/5 bg-black/5">
                    {msg.mediaId ? (
                      <img 
                        src={`/api/media/${msg.mediaId}`} 
                        alt="Shared media"
                        className="max-w-full h-auto object-cover" 
                      />
                    ) : (
                      <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
                        Image Preview
                      </div>
                    )}
                  </div>
                )}

                {/* Location Content */}
                {msg.type === "location" && (() => {
                  const locationUrl = getLocationUrl(msg);
                  const raw = msg.rawJson as any;
                  return locationUrl ? (
                    <div className="mb-2 p-3 rounded-lg bg-black/5 border border-black/10">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="h-5 w-5 text-red-500" />
                        <span className="font-medium text-sm">Ubicación compartida</span>
                      </div>
                      {raw?.location?.name && (
                        <p className="text-xs text-muted-foreground mb-2">{raw.location.name}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-8"
                          onClick={() => copyToClipboard(locationUrl)}
                        >
                          <Copy className="h-3 w-3 mr-1" /> Copiar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-8"
                          onClick={() => window.open(locationUrl, '_blank')}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" /> Abrir
                        </Button>
                      </div>
                    </div>
                  ) : null;
                })()}
                
                {/* Text Content */}
                {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}

                {/* Metadata */}
                <div className={cn(
                  "flex items-center justify-end space-x-1 mt-1 text-[10px]",
                  isOut ? "text-primary/60" : "text-muted-foreground"
                )}>
                  <span>
                    {msg.timestamp 
                      ? format(new Date(parseInt(msg.timestamp) * 1000), 'h:mm a')
                      : format(new Date(), 'h:mm a')
                    }
                  </span>
                  {isOut && (
                    <span className="ml-1">
                      {msg.status === 'read' ? (
                        <CheckCheck className="h-3 w-3 text-blue-500" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="absolute bottom-20 right-4 z-30 bg-black/90 text-green-400 p-3 rounded-lg shadow-xl max-w-xs text-xs font-mono">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold">Debug</span>
            <Button size="icon" variant="ghost" onClick={() => setShowDebug(false)} className="h-5 w-5 text-white hover:text-red-400">
              <X className="h-3 w-3" />
            </Button>
          </div>
          <p>To: +{conversation.waId}</p>
          <p>Messages: {messages.length}</p>
          <p>Last: {messages[messages.length - 1]?.type || 'N/A'}</p>
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-border z-20">
        {showImageInput && (
          <div className="mb-3 animate-in slide-in-from-bottom-2 duration-200">
            <div className="relative">
              <Input
                placeholder="Paste image URL here..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="pr-10 bg-muted/30 border-dashed"
              />
              <button 
                onClick={() => setShowImageInput(false)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        
        <div className="flex items-end space-x-2 bg-muted/30 p-2 rounded-3xl border border-border/50 focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/5 transition-all duration-200">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => setShowImageInput(!showImageInput)}>
                <ImageIcon className="h-4 w-4 mr-2 text-purple-500" />
                Imagen (URL)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowDebug(!showDebug)}>
                <Bug className="h-4 w-4 mr-2 text-green-500" />
                Debug
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 min-h-[40px] max-h-[120px] resize-none border-0 bg-transparent focus-visible:ring-0 px-2 py-2.5 text-base md:text-sm"
            rows={1}
          />

          <Button
            onClick={() => handleSend()}
            disabled={(!text && !imageUrl) || isPending}
            className={cn(
              "rounded-full h-10 w-10 p-0 flex-shrink-0 transition-all duration-200 shadow-md",
              text || imageUrl 
                ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105" 
                : "bg-muted text-muted-foreground hover:bg-muted"
            )}
          >
            <Send className="h-4 w-4 ml-0.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
