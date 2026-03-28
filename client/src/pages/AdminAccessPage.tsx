import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { Subadmin } from "@shared/schema";

export default function AdminAccessPage() {
  const { toast } = useToast();
  const { isPrimaryAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const { data: subadmins = [] } = useQuery<Subadmin[]>({
    queryKey: ["/api/subadmins"],
    queryFn: async () => {
      const res = await fetch("/api/subadmins", { credentials: "include" });
      if (!res.ok) throw new Error("No se pudo cargar admins secundarios");
      return res.json();
    },
    enabled: isPrimaryAdmin,
  });

  const createSubadminMutation = useMutation({
    mutationFn: async (data: { name: string; username: string; password: string }) => {
      return apiRequest("POST", "/api/subadmins", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subadmins"] });
      setShowForm(false);
      setName("");
      setUsername("");
      setPassword("");
      toast({ title: "Admin secundario creado" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateSubadminMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; [key: string]: any }) => {
      return apiRequest("PATCH", `/api/subadmins/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subadmins"] });
      toast({ title: "Acceso actualizado" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSubadminMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/subadmins/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subadmins"] });
      toast({ title: "Admin secundario eliminado" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!name || !username || !password) {
      toast({ title: "Completa todos los campos", variant: "destructive" });
      return;
    }
    createSubadminMutation.mutate({ name, username, password });
  };

  if (!isPrimaryAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-slate-700/40 bg-slate-900/70 p-6 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto text-amber-400 mb-3" />
          <h1 className="text-lg font-semibold">Acceso restringido</h1>
          <p className="text-sm text-slate-400 mt-2">
            Esta pantalla solo la puede usar el admin principal.
          </p>
          <Link href="/">
            <Button className="mt-4 bg-gradient-to-r from-emerald-600 to-cyan-600 border-0">
              Volver
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-16 left-16 w-80 h-80 bg-amber-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-16 right-16 w-80 h-80 bg-cyan-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto p-4 md:p-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-slate-400" data-testid="button-back-access">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <KeyRound className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Accesos Administrativos</h1>
            <p className="text-xs text-slate-500">Administra cuentas secundarias con acceso tipo admin</p>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 backdrop-blur-xl p-4">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Admins secundarios</h3>
              <p className="text-xs text-amber-100/80">
                Tienen acceso operativo de admin. Solo desde aqui puedes activarlos, bloquearlos o borrarlos.
              </p>
            </div>
            <Button
              onClick={() => setShowForm((value) => !value)}
              variant="outline"
              className="border-amber-400/40 text-amber-100 bg-transparent"
              data-testid="button-toggle-subadmin-form"
            >
              <Plus className="h-4 w-4 mr-2" />
              {showForm ? "Cancelar" : "Nuevo admin secundario"}
            </Button>
          </div>

          {showForm && (
            <div className="rounded-xl border border-amber-400/20 bg-slate-900/40 p-4 mb-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input
                  placeholder="Nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-slate-800/60 border-slate-700/50 text-white"
                  data-testid="input-subadmin-name"
                />
                <Input
                  placeholder="Usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-slate-800/60 border-slate-700/50 text-white"
                  data-testid="input-subadmin-username"
                />
                <Input
                  placeholder="Contrasena"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-slate-800/60 border-slate-700/50 text-white"
                  data-testid="input-subadmin-password"
                />
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={handleCreate}
                  disabled={createSubadminMutation.isPending}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 border-0 text-slate-950"
                  data-testid="button-save-subadmin"
                >
                  {createSubadminMutation.isPending ? "Creando..." : "Crear acceso"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false);
                    setName("");
                    setUsername("");
                    setPassword("");
                  }}
                  className="text-slate-300"
                  data-testid="button-cancel-subadmin"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {subadmins.length === 0 ? (
              <p className="text-xs text-amber-50/70">Aun no hay admins secundarios creados.</p>
            ) : (
              subadmins.map((subadmin) => (
                <div
                  key={`subadmin-${subadmin.id}`}
                  className="rounded-xl border border-amber-400/20 bg-slate-900/40 p-3 flex flex-wrap items-center justify-between gap-3"
                  data-testid={`card-subadmin-${subadmin.id}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{subadmin.name}</p>
                    <p className="text-xs text-slate-300">@{subadmin.username}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {subadmin.isActive ? "Acceso activo" : "Acceso bloqueado"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className={subadmin.isActive ? "border-amber-400/40 text-amber-100" : "border-emerald-500/40 text-emerald-200"}
                      onClick={() => updateSubadminMutation.mutate({ id: subadmin.id, isActive: !subadmin.isActive })}
                      disabled={updateSubadminMutation.isPending}
                      data-testid={`button-toggle-subadmin-${subadmin.id}`}
                    >
                      {subadmin.isActive ? "Desactivar" : "Activar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/50 text-red-300 hover:bg-red-500/10"
                      onClick={() => {
                        if (confirm(`Eliminar admin secundario "${subadmin.name}"?`)) {
                          deleteSubadminMutation.mutate(subadmin.id);
                        }
                      }}
                      disabled={deleteSubadminMutation.isPending}
                      data-testid={`button-delete-subadmin-${subadmin.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
