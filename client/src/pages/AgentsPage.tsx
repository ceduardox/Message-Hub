import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  ArrowLeft,
  Users,
  Plus,
  Trash2,
  Power,
  PowerOff,
  Eye,
  EyeOff,
  Pencil,
  Save,
  X,
  Zap,
  MessageSquare,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Agent } from "@shared/schema";

const glowAnimation = `
@keyframes glow-line {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.animate-glow-line { 
  background: linear-gradient(90deg, transparent, rgba(16,185,129,0.3), transparent);
  background-size: 200% 100%;
  animation: glow-line 3s ease-in-out infinite;
}
`;

export default function AgentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [weight, setWeight] = useState(1);
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});

  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; username: string; password: string; weight: number }) => {
      return apiRequest("POST", "/api/agents", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      resetForm();
      toast({ title: "Agente creado" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; [key: string]: any }) => {
      return apiRequest("PATCH", `/api/agents/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setEditingId(null);
      toast({ title: "Agente actualizado" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/agents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agente eliminado" });
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setName("");
    setUsername("");
    setPassword("");
    setWeight(1);
  };

  const handleCreate = () => {
    if (!name || !username || !password) {
      toast({ title: "Completa todos los campos", variant: "destructive" });
      return;
    }
    createMutation.mutate({ name, username, password, weight });
  };

  const toggleActive = (agent: Agent) => {
    updateMutation.mutate({ id: agent.id, isActive: !agent.isActive });
  };

  const activeAgents = agents.filter(a => a.isActive);
  const inactiveAgents = agents.filter(a => !a.isActive);

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: glowAnimation }} />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-96 h-96 bg-emerald-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-cyan-500/8 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto p-4 md:p-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-slate-400" data-testid="button-back-agents">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Gestión de Agentes</h1>
            <p className="text-xs text-slate-500">Crea y administra agentes que atienden mensajes</p>
          </div>
        </div>

        {!showForm ? (
          <Button
            onClick={() => setShowForm(true)}
            className="mb-5 bg-gradient-to-r from-emerald-600 to-cyan-600 border-0 shadow-lg shadow-emerald-500/20"
            data-testid="button-add-agent"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Agente
          </Button>
        ) : (
          <div className="mb-5 bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/30 shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600/80 to-cyan-600/80 px-5 py-3 relative overflow-hidden">
              <div className="absolute inset-0 animate-glow-line" />
              <h3 className="relative text-sm font-semibold text-white flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Crear Agente
              </h3>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Nombre</label>
                  <Input
                    placeholder="Ej: María García"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-slate-800/60 border-slate-700/50 text-white placeholder:text-slate-600"
                    data-testid="input-agent-name"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Usuario</label>
                  <Input
                    placeholder="Ej: maria"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-slate-800/60 border-slate-700/50 text-white placeholder:text-slate-600"
                    data-testid="input-agent-username"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Contraseña</label>
                  <Input
                    type="text"
                    placeholder="Contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-slate-800/60 border-slate-700/50 text-white placeholder:text-slate-600"
                    data-testid="input-agent-password"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Peso (proporción de chats)</label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={weight}
                    onChange={(e) => setWeight(parseInt(e.target.value) || 1)}
                    className="bg-slate-800/60 border-slate-700/50 text-white placeholder:text-slate-600"
                    data-testid="input-agent-weight"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-600 mb-4">
                Peso = proporción de chats. Agente con peso 3 recibe 3x más que uno con peso 1.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="bg-gradient-to-r from-emerald-600 to-cyan-600 border-0"
                  data-testid="button-save-agent"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {createMutation.isPending ? "Creando..." : "Crear Agente"}
                </Button>
                <Button variant="ghost" onClick={resetForm} className="text-slate-400" data-testid="button-cancel-agent">
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin h-10 w-10 border-3 border-emerald-500 border-t-transparent rounded-full" />
            <span className="text-slate-500 text-sm mt-4">Cargando agentes...</span>
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-16 bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/30">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
              <Users className="h-6 w-6 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">No hay agentes creados</p>
            <p className="text-slate-600 text-xs mt-1">Los mensajes se manejan solo desde la cuenta admin</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeAgents.length > 0 && (
              <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/30 shadow-xl shadow-emerald-500/10 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-600/80 to-teal-600/80 px-4 py-3 relative overflow-hidden">
                  <div className="absolute inset-0 animate-glow-line" />
                  <div className="relative flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    <span className="font-semibold text-sm text-white">Agentes Activos</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm font-bold">
                      {activeAgents.length}
                    </span>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  {activeAgents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      editingId={editingId}
                      setEditingId={setEditingId}
                      showPassword={showPasswords[agent.id] || false}
                      togglePassword={() => setShowPasswords(p => ({ ...p, [agent.id]: !p[agent.id] }))}
                      onToggleActive={() => toggleActive(agent)}
                      onDelete={() => {
                        if (confirm(`¿Eliminar agente "${agent.name}"?`)) {
                          deleteMutation.mutate(agent.id);
                        }
                      }}
                      onUpdate={(updates) => updateMutation.mutate({ id: agent.id, ...updates })}
                      isPending={updateMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {inactiveAgents.length > 0 && (
              <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/30 shadow-xl shadow-slate-500/10 overflow-hidden">
                <div className="bg-gradient-to-r from-slate-600/80 to-slate-700/80 px-4 py-3 relative overflow-hidden">
                  <div className="absolute inset-0 animate-glow-line" />
                  <div className="relative flex items-center gap-2">
                    <PowerOff className="h-4 w-4" />
                    <span className="font-semibold text-sm text-white">Inactivos</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm font-bold">
                      {inactiveAgents.length}
                    </span>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  {inactiveAgents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      editingId={editingId}
                      setEditingId={setEditingId}
                      showPassword={showPasswords[agent.id] || false}
                      togglePassword={() => setShowPasswords(p => ({ ...p, [agent.id]: !p[agent.id] }))}
                      onToggleActive={() => toggleActive(agent)}
                      onDelete={() => {
                        if (confirm(`¿Eliminar agente "${agent.name}"?`)) {
                          deleteMutation.mutate(agent.id);
                        }
                      }}
                      onUpdate={(updates) => updateMutation.mutate({ id: agent.id, ...updates })}
                      isPending={updateMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  editingId,
  setEditingId,
  showPassword,
  togglePassword,
  onToggleActive,
  onDelete,
  onUpdate,
  isPending,
}: {
  agent: Agent;
  editingId: number | null;
  setEditingId: (id: number | null) => void;
  showPassword: boolean;
  togglePassword: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onUpdate: (updates: Record<string, any>) => void;
  isPending: boolean;
}) {
  const isEditing = editingId === agent.id;
  const [editName, setEditName] = useState(agent.name);
  const [editWeight, setEditWeight] = useState(agent.weight || 1);
  const [editPassword, setEditPassword] = useState(agent.password);

  const startEdit = () => {
    setEditName(agent.name);
    setEditWeight(agent.weight || 1);
    setEditPassword(agent.password);
    setEditingId(agent.id);
  };

  return (
    <div
      className={cn(
        "rounded-xl p-4 backdrop-blur-sm border border-slate-700/50 shadow-lg shadow-black/20",
        "transition-transform duration-100 active:scale-[0.98]",
        agent.isActive
          ? "border-l-2 border-l-emerald-500 bg-slate-800/80"
          : "border-l-2 border-l-slate-600 bg-slate-800/40 opacity-70"
      )}
      data-testid={`agent-card-${agent.id}`}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-lg",
            agent.isActive
              ? "bg-gradient-to-br from-emerald-500 to-cyan-600"
              : "bg-gradient-to-br from-slate-500 to-slate-600"
          )}>
            {agent.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            {isEditing ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-slate-800/60 border-slate-700/50 text-white h-8 w-40"
                    placeholder="Nombre"
                    data-testid="input-edit-agent-name"
                  />
                  <Input
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="bg-slate-800/60 border-slate-700/50 text-white h-8 w-32"
                    placeholder="Contraseña"
                    data-testid="input-edit-agent-password"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={editWeight}
                    onChange={(e) => setEditWeight(parseInt(e.target.value) || 1)}
                    className="bg-slate-800/60 border-slate-700/50 text-white h-8 w-20"
                    data-testid="input-edit-agent-weight"
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    onClick={() => {
                      onUpdate({ name: editName, password: editPassword, weight: editWeight });
                      setEditingId(null);
                    }}
                    disabled={isPending}
                    className="bg-gradient-to-r from-emerald-600 to-cyan-600 border-0 h-7 text-xs"
                    data-testid="button-save-edit-agent"
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                    className="text-slate-400 h-7 text-xs"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="font-semibold text-white truncate">{agent.name}</p>
                <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                  <span>@{agent.username}</span>
                  <span className="flex items-center gap-1">
                    {showPassword ? agent.password : "••••••"}
                    <button onClick={togglePassword} className="text-slate-500">
                      {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-medium border border-current/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                    Peso: {agent.weight || 1}
                  </span>
                  <span className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border border-current/20",
                    agent.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                  )}>
                    <span className={cn("w-1.5 h-1.5 rounded-full", agent.isActive ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
                    {agent.isActive ? "Activo" : "Inactivo"}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {!isEditing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={startEdit}
              title="Editar"
              className="text-slate-400"
              data-testid={`button-edit-agent-${agent.id}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleActive}
              title={agent.isActive ? "Desactivar" : "Activar"}
              className={agent.isActive ? "text-emerald-400" : "text-red-400"}
              data-testid={`button-toggle-agent-${agent.id}`}
            >
              {agent.isActive ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              title="Eliminar"
              className="text-slate-400"
              data-testid={`button-delete-agent-${agent.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
