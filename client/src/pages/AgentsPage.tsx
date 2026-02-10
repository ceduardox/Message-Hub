import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
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
} from "lucide-react";
import type { Agent } from "@shared/schema";

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950/20 to-slate-900 text-white relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s', animationDelay: '2s' }} />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto p-4 md:p-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white" data-testid="button-back-agents">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Users className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Gestión de Agentes
              <Zap className="h-5 w-5 text-yellow-400" />
            </h1>
            <p className="text-sm text-slate-400">Crea y administra los agentes que atienden mensajes</p>
          </div>
        </div>

        {!showForm ? (
          <Button
            onClick={() => setShowForm(true)}
            className="mb-6 bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-400 hover:to-cyan-400 border-0"
            data-testid="button-add-agent"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Agente
          </Button>
        ) : (
          <div className="mb-6 bg-slate-800/60 backdrop-blur-lg rounded-2xl p-6 border border-slate-700/50">
            <h3 className="text-lg font-semibold mb-4 text-violet-300">Crear Agente</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nombre</label>
                <Input
                  placeholder="Ej: María García"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-slate-700/50 border-slate-600 text-white"
                  data-testid="input-agent-name"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Usuario</label>
                <Input
                  placeholder="Ej: maria"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-slate-700/50 border-slate-600 text-white"
                  data-testid="input-agent-username"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Contraseña</label>
                <Input
                  type="text"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-slate-700/50 border-slate-600 text-white"
                  data-testid="input-agent-password"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Peso (proporción de chats)</label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={weight}
                  onChange={(e) => setWeight(parseInt(e.target.value) || 1)}
                  className="bg-slate-700/50 border-slate-600 text-white"
                  data-testid="input-agent-weight"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Peso = proporción de chats. Si un agente tiene peso 3 y otro peso 1, el primero recibe 3 chats por cada 1 del otro.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="bg-gradient-to-r from-violet-500 to-cyan-500 border-0"
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
        )}

        {isLoading ? (
          <div className="text-center py-12 text-slate-500">Cargando agentes...</div>
        ) : agents.length === 0 ? (
          <div className="text-center py-16 bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-slate-700/30">
            <Users className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">No hay agentes creados</p>
            <p className="text-slate-500 text-sm mt-1">Los mensajes se manejan solo desde la cuenta admin</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
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
      className={`bg-slate-800/60 backdrop-blur-lg rounded-2xl p-5 border transition-all ${
        agent.isActive ? "border-slate-700/50" : "border-red-500/30 opacity-60"
      }`}
      data-testid={`agent-card-${agent.id}`}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            agent.isActive ? "bg-gradient-to-br from-violet-500 to-cyan-500" : "bg-slate-600"
          }`}>
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            {isEditing ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-slate-700/50 border-slate-600 text-white h-8 w-40"
                    placeholder="Nombre"
                    data-testid="input-edit-agent-name"
                  />
                  <Input
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="bg-slate-700/50 border-slate-600 text-white h-8 w-32"
                    placeholder="Contraseña"
                    data-testid="input-edit-agent-password"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={editWeight}
                    onChange={(e) => setEditWeight(parseInt(e.target.value) || 1)}
                    className="bg-slate-700/50 border-slate-600 text-white h-8 w-20"
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
                    className="bg-emerald-600 hover:bg-emerald-500 h-7 text-xs"
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
                    <button onClick={togglePassword} className="text-slate-500 hover:text-slate-300">
                      {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300">
                    Peso: {agent.weight || 1}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full ${agent.isActive ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
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
              className="text-slate-400 hover:text-white"
              data-testid={`button-edit-agent-${agent.id}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleActive}
              title={agent.isActive ? "Desactivar" : "Activar"}
              className={agent.isActive ? "text-emerald-400 hover:text-red-400" : "text-red-400 hover:text-emerald-400"}
              data-testid={`button-toggle-agent-${agent.id}`}
            >
              {agent.isActive ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              title="Eliminar"
              className="text-slate-400 hover:text-red-400"
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
