import { useMemo, useState } from "react";
import { useConversations } from "@/hooks/use-inbox";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Tooltip } from "recharts";
import { ArrowLeft, TrendingUp, Users, Phone, Truck, CheckCircle, AlertCircle, MessageSquare, Calendar, Zap, Inbox, Send as SendIcon } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface AgentStat {
  agent_id: number;
  agent_name: string;
  date: string;
  incoming: string;
  outgoing: string;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: conversations = [] } = useConversations();
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month">("today");
  const { data: agentStats = [] } = useQuery<AgentStat[]>({ queryKey: ["/api/agent-stats"] });

  const filteredConversations = useMemo(() => {
    const now = new Date();
    let cutoff: Date;
    
    switch (dateFilter) {
      case "today":
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    return conversations.filter(c => {
      if (!c.lastMessageTimestamp) return false;
      return new Date(c.lastMessageTimestamp) >= cutoff;
    });
  }, [conversations, dateFilter]);

  const stats = useMemo(() => {
    const humano = filteredConversations.filter(c => c.needsHumanAttention).length;
    const llamar = filteredConversations.filter(c => c.shouldCall && !c.needsHumanAttention).length;
    const listo = filteredConversations.filter(c => c.orderStatus === "ready" && !c.needsHumanAttention).length;
    const entregado = filteredConversations.filter(c => c.orderStatus === "delivered" && !c.needsHumanAttention).length;
    const nuevos = filteredConversations.filter(c => !c.orderStatus && !c.shouldCall && !c.needsHumanAttention).length;
    const total = filteredConversations.length;

    return { humano, llamar, listo, entregado, nuevos, total };
  }, [filteredConversations]);

  const pieData = [
    { name: "Humano", value: stats.humano, color: "#ef4444" },
    { name: "Llamar", value: stats.llamar, color: "#10b981" },
    { name: "Listo", value: stats.listo, color: "#06b6d4" },
    { name: "Entregado", value: stats.entregado, color: "#64748b" },
    { name: "Nuevos", value: stats.nuevos, color: "#8b5cf6" },
  ].filter(d => d.value > 0);

  const barData = [
    { name: "Humano", value: stats.humano, fill: "#ef4444" },
    { name: "Llamar", value: stats.llamar, fill: "#10b981" },
    { name: "Listo", value: stats.listo, fill: "#06b6d4" },
    { name: "Entregado", value: stats.entregado, fill: "#64748b" },
    { name: "Nuevos", value: stats.nuevos, fill: "#8b5cf6" },
  ];

  const hourlyData = useMemo(() => {
    const hours: Record<number, number> = {};
    for (let i = 0; i < 24; i++) hours[i] = 0;
    
    filteredConversations.forEach(c => {
      if (c.lastMessageTimestamp) {
        const hour = new Date(c.lastMessageTimestamp).getHours();
        hours[hour]++;
      }
    });

    return Object.entries(hours).map(([hour, count]) => ({
      hour: `${hour}h`,
      mensajes: count
    }));
  }, [filteredConversations]);

  const StatCard = ({ icon: Icon, label, value, color, gradient }: { 
    icon: typeof AlertCircle; 
    label: string; 
    value: number; 
    color: string;
    gradient: string;
  }) => (
    <div className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50 relative overflow-hidden transform transition-all duration-300 hover:scale-105 hover:-translate-y-1 shadow-xl shadow-black/20 hover:shadow-2xl hover:shadow-black/40">
      <div className={`absolute top-0 right-0 w-24 h-24 ${gradient} opacity-20 blur-3xl group-hover:opacity-40 transition-opacity`} />
      <div className={`absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl`} />
      <div className="relative">
        <div className={`w-12 h-12 rounded-xl ${gradient} flex items-center justify-center mb-3 shadow-lg shadow-black/30 transform -rotate-3 group-hover:rotate-0 transition-transform`}>
          <Icon className="h-6 w-6 text-white drop-shadow-lg" />
        </div>
        <p className="text-3xl font-bold text-white drop-shadow-lg">{value}</p>
        <p className={`text-sm ${color} font-medium`}>{label}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-10 bg-slate-800/80 backdrop-blur-lg border-b border-slate-700/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-bold text-lg flex items-center gap-2">
                Analytics <Zap className="h-4 w-4 text-yellow-400" />
              </h1>
              <p className="text-xs text-slate-400">Panel de estadísticas</p>
            </div>
          </div>
          <div className="flex gap-1">
            {(["today", "week", "month"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  dateFilter === f 
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50" 
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {f === "today" ? "Hoy" : f === "week" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6 pb-20">
        <div className="group bg-gradient-to-r from-emerald-600/20 via-teal-600/20 to-cyan-600/20 rounded-2xl p-6 border border-emerald-500/30 shadow-xl shadow-emerald-500/10 hover:shadow-2xl hover:shadow-emerald-500/20 transition-all duration-300 relative overflow-hidden transform hover:scale-[1.02]">
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl" />
          <div className="absolute -top-20 -right-20 w-60 h-60 bg-emerald-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-cyan-500/20 rounded-full blur-3xl" />
          <div className="flex items-center gap-4 relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-emerald-500/40 transform -rotate-6 group-hover:rotate-0 transition-transform">
              <TrendingUp className="h-8 w-8 text-white drop-shadow-lg" />
            </div>
            <div>
              <p className="text-4xl font-bold drop-shadow-lg">{stats.total}</p>
              <p className="text-emerald-400 text-sm font-medium">Conversaciones totales</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={AlertCircle} label="Humano" value={stats.humano} color="text-red-400" gradient="bg-gradient-to-br from-red-500 to-rose-600" />
          <StatCard icon={Phone} label="Llamar" value={stats.llamar} color="text-emerald-400" gradient="bg-gradient-to-br from-emerald-500 to-teal-600" />
          <StatCard icon={CheckCircle} label="Listo" value={stats.listo} color="text-cyan-400" gradient="bg-gradient-to-br from-cyan-500 to-blue-600" />
          <StatCard icon={Truck} label="Entregado" value={stats.entregado} color="text-slate-400" gradient="bg-gradient-to-br from-slate-500 to-slate-600" />
          <StatCard icon={Users} label="Nuevos" value={stats.nuevos} color="text-violet-400" gradient="bg-gradient-to-br from-violet-500 to-purple-600" />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 shadow-xl shadow-black/20 hover:shadow-2xl transition-all duration-300 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent rounded-2xl" />
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl" />
            <h3 className="font-semibold mb-4 flex items-center gap-2 relative">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                <MessageSquare className="h-4 w-4 text-white" />
              </div>
              Distribución por estado
            </h3>
            {pieData.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-500">
                Sin datos
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-3 justify-center">
              {pieData.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="text-slate-400">{d.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 shadow-xl shadow-black/20 hover:shadow-2xl transition-all duration-300 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/5 to-transparent rounded-2xl" />
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl" />
            <h3 className="font-semibold mb-4 flex items-center gap-2 relative">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
                <TrendingUp className="h-4 w-4 text-white" />
              </div>
              Comparativa
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical">
                  <XAxis type="number" stroke="#64748b" fontSize={10} />
                  <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={10} width={60} />
                  <Tooltip 
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 shadow-xl shadow-black/20 hover:shadow-2xl transition-all duration-300 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-violet-500/5 to-transparent rounded-2xl" />
          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-violet-500/10 rounded-full blur-3xl" />
          <h3 className="font-semibold mb-4 flex items-center gap-2 relative">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Calendar className="h-4 w-4 text-white" />
            </div>
            Actividad por hora
          </h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyData}>
                <XAxis dataKey="hour" stroke="#64748b" fontSize={9} interval={2} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip 
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="mensajes" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={{ fill: '#10b981', r: 3 }}
                  activeDot={{ r: 5, fill: '#10b981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Agent Message Stats */}
        <div className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 shadow-xl shadow-black/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-amber-500/5 to-transparent rounded-2xl" />
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl" />
          <h3 className="font-semibold mb-4 flex items-center gap-2 relative">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
              <Users className="h-4 w-4 text-white" />
            </div>
            Mensajes por Agente
          </h3>
          {agentStats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-agent-stats">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left py-2 px-2 text-slate-400 font-medium">Agente</th>
                    <th className="text-left py-2 px-2 text-slate-400 font-medium">Fecha</th>
                    <th className="text-center py-2 px-2 text-slate-400 font-medium">
                      <span className="flex items-center justify-center gap-1"><Inbox className="h-3 w-3" /> Recibidos</span>
                    </th>
                    <th className="text-center py-2 px-2 text-slate-400 font-medium">
                      <span className="flex items-center justify-center gap-1"><SendIcon className="h-3 w-3" /> Enviados</span>
                    </th>
                    <th className="text-center py-2 px-2 text-slate-400 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {agentStats.map((row, i) => (
                    <tr key={i} className="border-b border-slate-800/50">
                      <td className="py-2 px-2 font-medium text-white">{row.agent_name}</td>
                      <td className="py-2 px-2 text-slate-300">{new Date(row.date).toLocaleDateString("es-BO", { day: "2-digit", month: "short" })}</td>
                      <td className="py-2 px-2 text-center text-emerald-400 font-semibold">{row.incoming}</td>
                      <td className="py-2 px-2 text-center text-cyan-400 font-semibold">{row.outgoing}</td>
                      <td className="py-2 px-2 text-center text-amber-400 font-bold">{Number(row.incoming) + Number(row.outgoing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-20 flex items-center justify-center text-slate-500">
              Sin datos de mensajes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
