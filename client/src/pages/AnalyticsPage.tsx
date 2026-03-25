import { useEffect, useMemo, useRef, useState } from "react";
import { useConversations } from "@/hooks/use-inbox";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Tooltip } from "recharts";
import { ArrowLeft, TrendingUp, Users, Phone, Truck, CheckCircle, AlertCircle, MessageSquare, Calendar, Zap, Inbox, Send as SendIcon } from "lucide-react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface AgentStat {
  agent_id: number;
  agent_name: string;
  date: string;
  incoming: number;
  outgoing: number;
  inbound_chats: number;
  unit_cost_bs?: number | null;
  official_rate_bs?: number | null;
  parallel_rate_bs?: number | null;
  base_cost_bs?: number | null;
  usd_cost?: number | null;
  parallel_cost_bs?: number | null;
}

interface DailyCostSetting {
  date: string;
  unitCostBs: number;
  officialRateBs: number;
  parallelRateBs: number;
  updatedAt?: string | null;
}

const LA_PAZ_TIMEZONE = "America/La_Paz";
const SHORT_MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function toLaPazInputDate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LA_PAZ_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

function shiftIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);

  const nextYear = String(utcDate.getUTCFullYear());
  const nextMonth = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(utcDate.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function formatShortDateFromIso(isoDate: string): string {
  const [year, monthRaw, dayRaw] = isoDate.split("-");
  const monthNumber = Number(monthRaw);
  if (!year || !monthRaw || !dayRaw || !Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return isoDate;
  }
  const day = String(Number(dayRaw)).padStart(2, "0");
  return `${day}-${SHORT_MONTHS_ES[monthNumber - 1]}`;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const { data: conversations = [] } = useConversations();
  const [filterMode, setFilterMode] = useState<"day" | "range">("day");
  const [reportDate, setReportDate] = useState(() => toLaPazInputDate(new Date()));
  const [reportDateFrom, setReportDateFrom] = useState(() => toLaPazInputDate(new Date()));
  const [reportDateTo, setReportDateTo] = useState(() => toLaPazInputDate(new Date()));
  const [costDate, setCostDate] = useState(() => {
    return toLaPazInputDate(new Date());
  });
  const [unitCostBsInput, setUnitCostBsInput] = useState("");
  const [officialRateInput, setOfficialRateInput] = useState("");
  const [parallelRateInput, setParallelRateInput] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<number[]>([]);
  const agentsFilterInitializedRef = useRef(false);

  const normalizeDecimalInput = (value: string) => value.replace(",", ".").trim();
  const formatBs = (value: number) =>
    `${value.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`;
  const formatUsd = (value: number) =>
    `USD ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const appliedRange = useMemo(() => {
    const today = toLaPazInputDate(new Date());
    if (filterMode === "day") {
      const date = reportDate || today;
      return {
        dateFrom: date,
        dateTo: date,
        isSingleDay: true,
      };
    }

    let from = reportDateFrom || reportDateTo || today;
    let to = reportDateTo || reportDateFrom || today;
    if (from > to) {
      const temp = from;
      from = to;
      to = temp;
    }

    return {
      dateFrom: from,
      dateTo: to,
      isSingleDay: from === to,
    };
  }, [filterMode, reportDate, reportDateFrom, reportDateTo]);

  const { data: agentStats = [] } = useQuery<AgentStat[]>({
    queryKey: ["/api/agent-stats", appliedRange.dateFrom, appliedRange.dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("dateFrom", appliedRange.dateFrom);
      params.set("dateTo", appliedRange.dateTo);
      const res = await fetch(`/api/agent-stats?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("No se pudo cargar estadisticas por agente");
      return res.json();
    },
  });

  const { data: costSettingsForDate = [] } = useQuery<DailyCostSetting[]>({
    queryKey: ["/api/daily-cost-settings", costDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("dateFrom", costDate);
      params.set("dateTo", costDate);
      const res = await fetch(`/api/daily-cost-settings?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("No se pudo cargar configuracion de costo diario");
      return res.json();
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!isAdmin) return;
    const row = costSettingsForDate[0];
    if (!row) {
      setUnitCostBsInput("");
      setOfficialRateInput("");
      setParallelRateInput("");
      return;
    }
    setUnitCostBsInput(String(row.unitCostBs));
    setOfficialRateInput(String(row.officialRateBs));
    setParallelRateInput(String(row.parallelRateBs));
  }, [costSettingsForDate, isAdmin]);

  const saveDailyCostMutation = useMutation({
    mutationFn: async () => {
      const unitCostBs = Number(normalizeDecimalInput(unitCostBsInput));
      const officialRateBs = Number(normalizeDecimalInput(officialRateInput));
      const parallelRateBs = Number(normalizeDecimalInput(parallelRateInput));

      if (!Number.isFinite(unitCostBs) || unitCostBs <= 0) {
        throw new Error("Costo por chat invalido");
      }
      if (!Number.isFinite(officialRateBs) || officialRateBs <= 0) {
        throw new Error("Tipo de cambio oficial invalido");
      }
      if (!Number.isFinite(parallelRateBs) || parallelRateBs <= 0) {
        throw new Error("Dolar paralelo invalido");
      }

      const res = await fetch(`/api/daily-cost-settings/${costDate}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ unitCostBs, officialRateBs, parallelRateBs }),
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.message || "No se pudo guardar el costo diario");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/daily-cost-settings", costDate] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-stats"] });
    },
  });

  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      if (!c.lastMessageTimestamp) return false;
      const msgDate = toLaPazInputDate(c.lastMessageTimestamp);
      if (!msgDate) return false;
      return msgDate >= appliedRange.dateFrom && msgDate <= appliedRange.dateTo;
    });
  }, [conversations, appliedRange.dateFrom, appliedRange.dateTo]);

  const applyQuickDay = (offsetDays = 0) => {
    const date = shiftIsoDate(toLaPazInputDate(new Date()), offsetDays);
    setFilterMode("day");
    setReportDate(date);
  };

  const applyQuickRangeDays = (days: number) => {
    const end = toLaPazInputDate(new Date());
    const start = shiftIsoDate(end, -(days - 1));
    setFilterMode("range");
    setReportDateFrom(start);
    setReportDateTo(end);
  };

  const applyQuickCurrentMonth = () => {
    const end = toLaPazInputDate(new Date());
    const [year, month] = end.split("-");
    const start = `${year}-${month}-01`;
    setFilterMode("range");
    setReportDateFrom(start);
    setReportDateTo(end);
  };

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

  const availableAgents = useMemo(() => {
    const grouped = new Map<number, string>();
    for (const row of agentStats) {
      const id = Number(row.agent_id);
      const name = String(row.agent_name || `Agente ${id}`);
      if (!grouped.has(id)) grouped.set(id, name);
    }
    return Array.from(grouped.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agentStats]);

  useEffect(() => {
    const availableIds = availableAgents.map((item) => item.id);
    setSelectedAgentIds((prev) => {
      if (availableIds.length === 0) return [];
      if (!agentsFilterInitializedRef.current) {
        agentsFilterInitializedRef.current = true;
        return availableIds;
      }
      return prev.filter((id) => availableIds.includes(id));
    });
  }, [availableAgents]);

  const isAllAgentsSelected =
    availableAgents.length > 0 && selectedAgentIds.length === availableAgents.length;

  const agentStatsFiltered = useMemo(() => {
    if (availableAgents.length === 0) return [];
    if (isAllAgentsSelected) return agentStats;
    const selected = new Set(selectedAgentIds);
    return agentStats.filter((row) => selected.has(Number(row.agent_id)));
  }, [agentStats, selectedAgentIds, isAllAgentsSelected, availableAgents.length]);

  const selectAllAgents = () => {
    setSelectedAgentIds(availableAgents.map((item) => item.id));
  };

  const clearSelectedAgents = () => {
    setSelectedAgentIds([]);
  };

  const toggleSingleAgent = (agentId: number, checked: boolean) => {
    setSelectedAgentIds((prev) => {
      if (checked) {
        if (prev.includes(agentId)) return prev;
        return [...prev, agentId];
      }
      return prev.filter((id) => id !== agentId);
    });
  };

  const selectedTotals = useMemo(() => {
    let incoming = 0;
    let outgoing = 0;
    let inboundChats = 0;
    let parallelCostTotal = 0;
    let hasParallelCost = false;

    for (const row of agentStatsFiltered) {
      incoming += Number(row.incoming || 0);
      outgoing += Number(row.outgoing || 0);
      inboundChats += Number(row.inbound_chats || 0);
      if (row.parallel_cost_bs != null) {
        parallelCostTotal += Number(row.parallel_cost_bs);
        hasParallelCost = true;
      }
    }

    return {
      incoming,
      outgoing,
      inboundChats,
      totalMessages: incoming + outgoing,
      parallelCostTotal,
      hasParallelCost,
    };
  }, [agentStatsFiltered]);

  const agentSummaryCards = useMemo(() => {
    const grouped = new Map<
      number,
      {
        agentId: number;
        agentName: string;
        inboundChats: number;
        unitCostBs: number | null;
        baseCostBs: number;
        usdCost: number;
        parallelCostBs: number;
        hasCost: boolean;
      }
    >();

    for (const row of agentStatsFiltered) {
      const key = Number(row.agent_id);
      const current = grouped.get(key) || {
        agentId: key,
        agentName: String(row.agent_name || `Agente ${key}`),
        inboundChats: 0,
        unitCostBs: null,
        baseCostBs: 0,
        usdCost: 0,
        parallelCostBs: 0,
        hasCost: false,
      };
      current.inboundChats += Number(row.inbound_chats || 0);
      if (row.unit_cost_bs != null) {
        current.unitCostBs = Number(row.unit_cost_bs);
      }
      if (row.base_cost_bs != null && row.usd_cost != null && row.parallel_cost_bs != null) {
        current.baseCostBs += Number(row.base_cost_bs);
        current.usdCost += Number(row.usd_cost);
        current.parallelCostBs += Number(row.parallel_cost_bs);
        current.hasCost = true;
      }
      grouped.set(key, current);
    }

    return Array.from(grouped.values()).sort((a, b) => b.inboundChats - a.inboundChats);
  }, [agentStatsFiltered]);

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
              <p className="text-xs text-slate-400">Panel de estadisticas</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6 pb-20">
        <div className="rounded-2xl border border-slate-700/40 bg-slate-800/60 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Filtro por fecha</h3>

          <div className="flex flex-wrap gap-2 mb-3">
            <Button
              type="button"
              variant={filterMode === "day" ? "default" : "outline"}
              className={filterMode === "day" ? "h-9 bg-gradient-to-r from-emerald-600 to-cyan-600 border-0" : "h-9 border-slate-600 text-slate-200"}
              onClick={() => setFilterMode("day")}
              data-testid="button-analytics-filter-mode-day"
            >
              Un dia
            </Button>
            <Button
              type="button"
              variant={filterMode === "range" ? "default" : "outline"}
              className={filterMode === "range" ? "h-9 bg-gradient-to-r from-emerald-600 to-cyan-600 border-0" : "h-9 border-slate-600 text-slate-200"}
              onClick={() => setFilterMode("range")}
              data-testid="button-analytics-filter-mode-range"
            >
              Rango
            </Button>
          </div>

          {filterMode === "day" ? (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Dia</label>
                <Input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="h-9 bg-slate-900/80 border-slate-700/60 text-white"
                  data-testid="input-analytics-date"
                />
              </div>
              <Button
                type="button"
                onClick={() => applyQuickDay(0)}
                className="h-9 bg-gradient-to-r from-emerald-600 to-cyan-600 border-0"
                data-testid="button-analytics-date-today"
              >
                Hoy
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Desde</label>
                <Input
                  type="date"
                  value={reportDateFrom}
                  onChange={(e) => setReportDateFrom(e.target.value)}
                  className="h-9 bg-slate-900/80 border-slate-700/60 text-white"
                  data-testid="input-analytics-date-from"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Hasta</label>
                <Input
                  type="date"
                  value={reportDateTo}
                  onChange={(e) => setReportDateTo(e.target.value)}
                  className="h-9 bg-slate-900/80 border-slate-700/60 text-white"
                  data-testid="input-analytics-date-to"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            <Button type="button" variant="outline" className="h-8 border-slate-600 text-slate-200" onClick={() => applyQuickDay(0)} data-testid="button-analytics-quick-today">
              Hoy
            </Button>
            <Button type="button" variant="outline" className="h-8 border-slate-600 text-slate-200" onClick={() => applyQuickDay(-1)} data-testid="button-analytics-quick-yesterday">
              Ayer
            </Button>
            <Button type="button" variant="outline" className="h-8 border-slate-600 text-slate-200" onClick={() => applyQuickRangeDays(7)} data-testid="button-analytics-quick-7d">
              7 dias
            </Button>
            <Button type="button" variant="outline" className="h-8 border-slate-600 text-slate-200" onClick={() => applyQuickRangeDays(30)} data-testid="button-analytics-quick-30d">
              30 dias
            </Button>
            <Button type="button" variant="outline" className="h-8 border-slate-600 text-slate-200" onClick={applyQuickCurrentMonth} data-testid="button-analytics-quick-month">
              Este mes
            </Button>
          </div>

          <p className="text-xs text-slate-500 mt-2">
            Periodo aplicado: {appliedRange.isSingleDay ? appliedRange.dateFrom : `${appliedRange.dateFrom} a ${appliedRange.dateTo}`}
          </p>
        </div>

        {isAdmin && (
          <div className="rounded-2xl border border-cyan-500/30 bg-slate-800/70 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Costo diario (admin)</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Fecha</label>
                <Input
                  type="date"
                  value={costDate}
                  onChange={(e) => setCostDate(e.target.value)}
                  className="h-9 bg-slate-900/80 border-slate-700/60 text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Costo por chat (Bs)</label>
                <Input
                  value={unitCostBsInput}
                  onChange={(e) => setUnitCostBsInput(e.target.value)}
                  placeholder="Ej. 1.23"
                  className="h-9 bg-slate-900/80 border-slate-700/60 text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">TC oficial (Bs/USD)</label>
                <Input
                  value={officialRateInput}
                  onChange={(e) => setOfficialRateInput(e.target.value)}
                  placeholder="Ej. 6.6"
                  className="h-9 bg-slate-900/80 border-slate-700/60 text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Dolar paralelo (Bs/USD)</label>
                <Input
                  value={parallelRateInput}
                  onChange={(e) => setParallelRateInput(e.target.value)}
                  placeholder="Ej. 9.23"
                  className="h-9 bg-slate-900/80 border-slate-700/60 text-white"
                />
              </div>
              <Button
                onClick={() => saveDailyCostMutation.mutate()}
                disabled={saveDailyCostMutation.isPending || !costDate}
                className="h-9 bg-gradient-to-r from-emerald-600 to-cyan-600 border-0"
              >
                {saveDailyCostMutation.isPending ? "Guardando..." : "Guardar dia"}
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Si un dia no tiene precio guardado, el monto se muestra como `N/D`.
            </p>
          </div>
        )}

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
              Distribucion por estado
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

        <div className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 shadow-xl shadow-black/20 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent rounded-2xl" />
          <div className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl" />
          <h3 className="font-semibold mb-3 flex items-center gap-2 relative">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-lg">
              <Users className="h-4 w-4 text-white" />
            </div>
            Filtro de agentes
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            Seleccione que agentes incluir en el reporte y en los totales.
          </p>

          <div className="flex flex-wrap gap-2 mb-3">
            <Button
              type="button"
              size="sm"
              variant={isAllAgentsSelected ? "default" : "outline"}
              className={isAllAgentsSelected ? "bg-emerald-600 hover:bg-emerald-500" : "border-slate-600 text-slate-300"}
              onClick={selectAllAgents}
            >
              Todos
            </Button>
            <Button
              type="button"
              size="sm"
              variant={selectedAgentIds.length === 0 ? "default" : "outline"}
              className={selectedAgentIds.length === 0 ? "bg-slate-600 hover:bg-slate-500" : "border-slate-600 text-slate-300"}
              onClick={clearSelectedAgents}
            >
              Ninguno
            </Button>
            {availableAgents.map((agent) => {
              const selected = selectedAgentIds.includes(agent.id);
              return (
                <Button
                  key={`filter-agent-${agent.id}`}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  className={selected ? "bg-cyan-600 hover:bg-cyan-500" : "border-slate-600 text-slate-300"}
                  onClick={() => toggleSingleAgent(agent.id, !selected)}
                >
                  {selected ? "[x] " : ""}{agent.name}
                </Button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
              <p className="text-[11px] uppercase tracking-wide text-emerald-300">Recibidos</p>
              <p className="text-lg font-semibold text-white">{selectedTotals.incoming}</p>
            </div>
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2">
              <p className="text-[11px] uppercase tracking-wide text-cyan-300">Enviados</p>
              <p className="text-lg font-semibold text-white">{selectedTotals.outgoing}</p>
            </div>
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2">
              <p className="text-[11px] uppercase tracking-wide text-sky-300">Chats inbound</p>
              <p className="text-lg font-semibold text-white">{selectedTotals.inboundChats}</p>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
              <p className="text-[11px] uppercase tracking-wide text-amber-300">Total</p>
              <p className="text-lg font-semibold text-white">{selectedTotals.totalMessages}</p>
            </div>
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-2">
              <p className="text-[11px] uppercase tracking-wide text-violet-300">Monto paralelo</p>
              <p className="text-lg font-semibold text-white">
                {selectedTotals.hasParallelCost ? formatBs(selectedTotals.parallelCostTotal) : "N/D"}
              </p>
            </div>
          </div>
        </div>

        <div className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 shadow-xl shadow-black/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-sky-500/5 to-transparent rounded-2xl" />
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-sky-500/10 rounded-full blur-3xl" />
          <h3 className="font-semibold mb-4 flex items-center gap-2 relative">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center shadow-lg">
              <Users className="h-4 w-4 text-white" />
            </div>
            Chats con inbound y costo Meta Ads por agente
          </h3>
          {agentSummaryCards.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {agentSummaryCards.map((item) => (
                <div
                  key={`agent-summary-${item.agentId}`}
                  className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-3"
                  data-testid={`card-agent-cost-summary-${item.agentId}`}
                >
                  <p className="text-sm font-semibold text-white mb-2">{item.agentName}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="rounded-lg border border-cyan-500/30 bg-slate-950/60 p-2.5">
                      <p className="text-[11px] uppercase tracking-wide text-cyan-300">Chats con inbound</p>
                      <p className="text-3xl font-bold text-slate-100 mt-1">{item.inboundChats}</p>
                      <p className="text-[11px] text-slate-500">chats unicos con inbound</p>
                    </div>
                    <div className="rounded-lg border border-violet-500/30 bg-slate-950/60 p-2.5">
                      <p className="text-[11px] uppercase tracking-wide text-violet-300">COSTO META ADS</p>
                      {item.hasCost ? (
                        <div className="text-sm leading-6">
                          <p className="text-slate-300">
                            Costo por mensaje: <span className="font-semibold text-white">{item.unitCostBs == null ? "N/D" : formatBs(item.unitCostBs)}</span>
                          </p>
                          <p className="text-slate-300">
                            Base: <span className="font-semibold text-white">{formatBs(item.baseCostBs)}</span>
                          </p>
                          <p className="text-slate-300">
                            USD: <span className="font-semibold text-white">{formatUsd(item.usdCost)}</span>
                          </p>
                          <p className="text-slate-300">
                            Paralelo: <span className="font-semibold text-white">{formatBs(item.parallelCostBs)}</span>
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 mt-2">Sin precio diario (monto `N/D`)</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-20 flex items-center justify-center text-slate-500">
              Sin datos por agente en el periodo
            </div>
          )}
        </div>

        {/* Agent Message Stats */}
        <div className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 shadow-xl shadow-black/20 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-amber-500/5 to-transparent rounded-2xl" />
          <div className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl" />
          <h3 className="font-semibold mb-4 flex items-center gap-2 relative">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
              <Users className="h-4 w-4 text-white" />
            </div>
            Mensajes por Agente
          </h3>
          {agentStatsFiltered.length > 0 ? (
            <>
              <div className="md:hidden space-y-2">
                {agentStatsFiltered.map((row, i) => (
                  <div
                    key={`agent-mobile-${i}`}
                    className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-3"
                    data-testid={`card-agent-stats-mobile-${i}`}
                  >
                    <div className="flex items-center justify-between border-b border-slate-700/50 pb-2 mb-2">
                      <p className="font-semibold text-white">{row.agent_name}</p>
                      <p className="text-xs text-slate-400">
                        {formatShortDateFromIso(row.date)}
                      </p>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Recibidos</span>
                        <span className="text-emerald-400 font-semibold">{row.incoming}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Enviados</span>
                        <span className="text-cyan-400 font-semibold">{row.outgoing}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Chats inbound</span>
                        <span className="text-sky-300 font-semibold">{row.inbound_chats}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Total</span>
                        <span className="text-amber-400 font-bold">{Number(row.incoming) + Number(row.outgoing)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Monto paralelo</span>
                        <span className="text-violet-300 font-semibold">
                          {row.parallel_cost_bs == null ? "N/D" : formatBs(Number(row.parallel_cost_bs))}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-700/40">
                <table className="min-w-[980px] w-full text-sm table-fixed" data-testid="table-agent-stats">
                  <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left py-2 px-2 text-slate-400 font-medium">Agente</th>
                      <th className="text-left py-2 px-2 text-slate-400 font-medium">Fecha</th>
                      <th className="text-center py-2 px-2 text-slate-400 font-medium">
                        <span className="flex items-center justify-center gap-1"><Inbox className="h-3 w-3" /> Recibidos</span>
                      </th>
                      <th className="text-center py-2 px-2 text-slate-400 font-medium">
                        <span className="flex items-center justify-center gap-1"><SendIcon className="h-3 w-3" /> Enviados</span>
                      </th>
                      <th className="text-center py-2 px-2 text-slate-400 font-medium">Chats inbound</th>
                      <th className="text-center py-2 px-2 text-slate-400 font-medium">Total</th>
                      <th className="text-center py-2 px-2 text-slate-400 font-medium">Monto paralelo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentStatsFiltered.map((row, i) => (
                      <tr key={i} className="border-b border-slate-800/50">
                        <td className="py-2 px-2 font-medium text-white whitespace-nowrap truncate">{row.agent_name}</td>
                        <td className="py-2 px-2 text-slate-300 whitespace-nowrap">{formatShortDateFromIso(row.date)}</td>
                        <td className="py-2 px-2 text-center text-emerald-400 font-semibold whitespace-nowrap">{row.incoming}</td>
                        <td className="py-2 px-2 text-center text-cyan-400 font-semibold whitespace-nowrap">{row.outgoing}</td>
                        <td className="py-2 px-2 text-center text-sky-300 font-semibold whitespace-nowrap">{row.inbound_chats}</td>
                        <td className="py-2 px-2 text-center text-amber-400 font-bold whitespace-nowrap">{Number(row.incoming) + Number(row.outgoing)}</td>
                        <td className="py-2 px-2 text-center text-violet-300 font-semibold whitespace-nowrap">
                          {row.parallel_cost_bs == null ? "N/D" : formatBs(Number(row.parallel_cost_bs))}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-cyan-500/40 bg-cyan-500/10">
                      <td className="py-2 px-2 font-semibold text-cyan-200 whitespace-nowrap">Totales seleccionados</td>
                      <td className="py-2 px-2 text-cyan-200 whitespace-nowrap">-</td>
                      <td className="py-2 px-2 text-center text-emerald-300 font-bold whitespace-nowrap">{selectedTotals.incoming}</td>
                      <td className="py-2 px-2 text-center text-cyan-300 font-bold whitespace-nowrap">{selectedTotals.outgoing}</td>
                      <td className="py-2 px-2 text-center text-sky-300 font-bold whitespace-nowrap">{selectedTotals.inboundChats}</td>
                      <td className="py-2 px-2 text-center text-amber-300 font-bold whitespace-nowrap">{selectedTotals.totalMessages}</td>
                      <td className="py-2 px-2 text-center text-violet-300 font-bold whitespace-nowrap">
                        {selectedTotals.hasParallelCost ? formatBs(selectedTotals.parallelCostTotal) : "N/D"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
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
