import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Users, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AgentStat {
  agent_id: number;
  agent_name: string;
  date: string;
  total_estimated_parallel_cost_bs?: number | null;
}

const LA_PAZ_TIMEZONE = "America/La_Paz";
const WEEKDAY_LABELS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const SHORT_MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const AGENT_ROW_STYLES = [
  "border-cyan-500/25 bg-cyan-500/10 text-cyan-50",
  "border-emerald-500/25 bg-emerald-500/10 text-emerald-50",
  "border-violet-500/25 bg-violet-500/10 text-violet-50",
  "border-amber-500/25 bg-amber-500/10 text-amber-50",
  "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-50",
  "border-sky-500/25 bg-sky-500/10 text-sky-50",
];

type DayCostRow = {
  agentId: number;
  agentName: string;
  totalCostBs: number | null;
};

type DayCostSummary = {
  rows: DayCostRow[];
  totalCostBs: number;
  hasAnyCost: boolean;
};

function toLaPazInputDate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LA_PAZ_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

function getTodayMonthValue(): string {
  return toLaPazInputDate(new Date()).slice(0, 7);
}

function parseMonthValue(value: string): { year: number; month: number } {
  const [yearRaw, monthRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  return { year, month };
}

function getMonthRange(monthValue: string): { dateFrom: string; dateTo: string } {
  const { year, month } = parseMonthValue(monthValue);
  if (!year || !month) {
    const fallback = getTodayMonthValue();
    return getMonthRange(fallback);
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthText = String(month).padStart(2, "0");
  return {
    dateFrom: `${year}-${monthText}-01`,
    dateTo: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
}

function shiftMonthValue(monthValue: string, deltaMonths: number): string {
  const { year, month } = parseMonthValue(monthValue);
  const date = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthHeading(monthValue: string): string {
  const { year, month } = parseMonthValue(monthValue);
  if (!year || !month) return monthValue;
  return new Intl.DateTimeFormat("es-BO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatIsoShort(isoDate: string): string {
  const [yearRaw, monthRaw, dayRaw] = isoDate.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) return isoDate;
  return `${String(day).padStart(2, "0")} ${SHORT_MONTHS_ES[month - 1]}`;
}

function formatBs(value: number): string {
  return `${value.toLocaleString("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Bs`;
}

function getCalendarDays(monthValue: string) {
  const { year, month } = parseMonthValue(monthValue);
  if (!year || !month) return [];

  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const firstWeekdayIndex = (firstDay.getUTCDay() + 6) % 7;
  const lastWeekdayIndex = (lastDay.getUTCDay() + 6) % 7;

  const gridStart = new Date(firstDay);
  gridStart.setUTCDate(firstDay.getUTCDate() - firstWeekdayIndex);

  const gridEnd = new Date(lastDay);
  gridEnd.setUTCDate(lastDay.getUTCDate() + (6 - lastWeekdayIndex));

  const days: Array<{ iso: string; dayNumber: number; inCurrentMonth: boolean }> = [];
  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const iso = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`;
    days.push({
      iso,
      dayNumber: cursor.getUTCDate(),
      inCurrentMonth: cursor.getUTCMonth() === month - 1,
    });
  }

  return days;
}

export default function AnalyticsCalendarPage() {
  const [monthValue, setMonthValue] = useState(() => getTodayMonthValue());
  const [selectedAgentIds, setSelectedAgentIds] = useState<number[]>([]);
  const agentsFilterInitializedRef = useRef(false);
  const todayIso = useMemo(() => toLaPazInputDate(new Date()), []);

  const monthRange = useMemo(() => getMonthRange(monthValue), [monthValue]);

  const { data: agentStats = [], isLoading } = useQuery<AgentStat[]>({
    queryKey: ["/api/agent-stats", "calendar", monthRange.dateFrom, monthRange.dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("dateFrom", monthRange.dateFrom);
      params.set("dateTo", monthRange.dateTo);
      const response = await fetch(`/api/agent-stats?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("No se pudo cargar analytics mensual");
      return response.json();
    },
  });

  const availableAgents = useMemo(() => {
    const grouped = new Map<number, string>();
    for (const row of agentStats) {
      const agentId = Number(row.agent_id);
      const agentName = String(row.agent_name || `Agente ${agentId}`);
      if (!grouped.has(agentId)) grouped.set(agentId, agentName);
    }
    return Array.from(grouped.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agentStats]);

  useEffect(() => {
    const availableIds = availableAgents.map((item) => item.id);
    setSelectedAgentIds((previous) => {
      if (availableIds.length === 0) return [];
      if (!agentsFilterInitializedRef.current) {
        agentsFilterInitializedRef.current = true;
        return availableIds;
      }
      const next = previous.filter((id) => availableIds.includes(id));
      return next.length > 0 ? next : availableIds;
    });
  }, [availableAgents]);

  const isAllAgentsSelected =
    availableAgents.length > 0 && selectedAgentIds.length === availableAgents.length;

  const filteredStats = useMemo(() => {
    if (availableAgents.length === 0) return [];
    if (isAllAgentsSelected) return agentStats;
    const selected = new Set(selectedAgentIds);
    return agentStats.filter((row) => selected.has(Number(row.agent_id)));
  }, [agentStats, selectedAgentIds, isAllAgentsSelected, availableAgents.length]);

  const dayCostMap = useMemo(() => {
    const grouped = new Map<string, DayCostSummary>();

    for (const row of filteredStats) {
      const dateKey = String(row.date);
      const current = grouped.get(dateKey) || {
        rows: [],
        totalCostBs: 0,
        hasAnyCost: false,
      };
      const totalCostBs =
        row.total_estimated_parallel_cost_bs == null ? null : Number(row.total_estimated_parallel_cost_bs);

      current.rows.push({
        agentId: Number(row.agent_id),
        agentName: String(row.agent_name || `Agente ${row.agent_id}`),
        totalCostBs,
      });

      if (totalCostBs != null) {
        current.totalCostBs += totalCostBs;
        current.hasAnyCost = true;
      }

      grouped.set(dateKey, current);
    }

    for (const value of Array.from(grouped.values())) {
      value.rows.sort((left, right) => {
        if (left.totalCostBs == null && right.totalCostBs == null) {
          return left.agentName.localeCompare(right.agentName);
        }
        if (left.totalCostBs == null) return 1;
        if (right.totalCostBs == null) return -1;
        return right.totalCostBs - left.totalCostBs;
      });
    }

    return grouped;
  }, [filteredStats]);

  const monthlySummary = useMemo(() => {
    let totalCostBs = 0;
    let hasAnyCost = false;
    let dayCountWithEntries = 0;

    for (const value of Array.from(dayCostMap.values())) {
      if (value.rows.length > 0) dayCountWithEntries += 1;
      if (value.hasAnyCost) {
        totalCostBs += value.totalCostBs;
        hasAnyCost = true;
      }
    }

    return {
      totalCostBs,
      hasAnyCost,
      dayCountWithEntries,
      selectedAgentCount: selectedAgentIds.length,
    };
  }, [dayCostMap, selectedAgentIds.length]);

  const calendarDays = useMemo(() => getCalendarDays(monthValue), [monthValue]);

  const selectAllAgents = () => {
    setSelectedAgentIds(availableAgents.map((agent) => agent.id));
  };

  const clearSelectedAgents = () => {
    setSelectedAgentIds([]);
  };

  const toggleSingleAgent = (agentId: number, checked: boolean) => {
    setSelectedAgentIds((previous) => {
      if (checked) {
        if (previous.includes(agentId)) return previous;
        return [...previous, agentId];
      }
      return previous.filter((id) => id !== agentId);
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="sticky top-0 z-10 border-b border-slate-800/70 bg-slate-900/85 backdrop-blur-xl">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/analytics">
              <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-bold text-lg flex items-center gap-2">
                Calendario de costos <Zap className="h-4 w-4 text-yellow-400" />
              </h1>
              <p className="text-xs text-slate-400">
                Vista mensual por agente con total global de cada dia
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatMonthHeading(monthValue)}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5 pb-16">
        <div className="rounded-3xl border border-slate-800/80 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-4 shadow-[0_18px_60px_rgba(2,6,23,.45)]">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_1fr]">
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/55 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Mes a revisar</p>
                  <p className="text-xs text-slate-400">Cambie el mes o navegue con flechas</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="border-slate-700 bg-slate-950/70 text-slate-200 hover:bg-slate-800"
                  onClick={() => setMonthValue((current) => shiftMonthValue(current, -1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  type="month"
                  value={monthValue}
                  onChange={(event) => setMonthValue(event.target.value || getTodayMonthValue())}
                  className="bg-slate-950/80 border-slate-700/60 text-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="border-slate-700 bg-slate-950/70 text-slate-200 hover:bg-slate-800"
                  onClick={() => setMonthValue((current) => shiftMonthValue(current, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/10"
                  onClick={() => setMonthValue(getTodayMonthValue())}
                >
                  Ir al mes actual
                </Button>
                <div className="rounded-full border border-slate-700/70 bg-slate-950/70 px-3 py-1 text-xs text-slate-300">
                  Rango: {monthRange.dateFrom} a {monthRange.dateTo}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/55 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Filtro de agentes</p>
                  <p className="text-xs text-slate-400">Seleccione a quién incluir en el calendario mensual</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <Button
                  type="button"
                  size="sm"
                  variant={isAllAgentsSelected ? "default" : "outline"}
                  className={isAllAgentsSelected ? "bg-emerald-600 hover:bg-emerald-500" : "border-slate-600 text-slate-300"}
                  onClick={selectAllAgents}
                  disabled={availableAgents.length === 0}
                >
                  Todos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={selectedAgentIds.length === 0 ? "default" : "outline"}
                  className={selectedAgentIds.length === 0 ? "bg-slate-600 hover:bg-slate-500" : "border-slate-600 text-slate-300"}
                  onClick={clearSelectedAgents}
                  disabled={availableAgents.length === 0}
                >
                  Ninguno
                </Button>
                {availableAgents.map((agent) => {
                  const selected = selectedAgentIds.includes(agent.id);
                  return (
                    <Button
                      key={`calendar-agent-${agent.id}`}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      className={selected ? "bg-cyan-600 hover:bg-cyan-500" : "border-slate-600 text-slate-300"}
                      onClick={() => toggleSingleAgent(agent.id, !selected)}
                    >
                      {selected ? "[x] " : ""}
                      {agent.name}
                    </Button>
                  );
                })}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Agentes visibles</p>
                  <p className="mt-2 text-3xl font-bold text-white">{monthlySummary.selectedAgentCount}</p>
                </div>
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">Dias con registros</p>
                  <p className="mt-2 text-3xl font-bold text-white">{monthlySummary.dayCountWithEntries}</p>
                </div>
                <div className="rounded-2xl border border-violet-500/25 bg-violet-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-violet-300">Total del mes</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {monthlySummary.hasAnyCost ? formatBs(monthlySummary.totalCostBs) : "N/D"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/70 shadow-[0_18px_60px_rgba(2,6,23,.35)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-white capitalize">{formatMonthHeading(monthValue)}</h2>
              <p className="text-xs text-slate-400">
                Cada dia muestra los agentes con costo y el total global diario
              </p>
            </div>
            <div className="rounded-full border border-slate-700/70 bg-slate-950/80 px-3 py-1 text-xs text-slate-300">
              {selectedAgentIds.length === 0 ? "Sin agentes seleccionados" : `${selectedAgentIds.length} agente(s) filtrados`}
            </div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-slate-400">Cargando calendario mensual...</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[1120px]">
                <div className="grid grid-cols-7 border-b border-slate-800/80 bg-slate-950/80">
                  {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-px bg-slate-800/70">
                  {calendarDays.map((day) => {
                    const dayData = dayCostMap.get(day.iso);
                    const dayHasRows = Boolean(dayData && dayData.rows.length > 0);
                    const isToday = day.iso === todayIso;
                    const dayLabel = day.inCurrentMonth ? String(day.dayNumber) : formatIsoShort(day.iso);

                    return (
                      <div
                        key={day.iso}
                        className={`min-h-[220px] bg-slate-950/90 p-2.5 flex flex-col ${
                          day.inCurrentMonth ? "" : "bg-slate-950/55"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                              isToday
                                ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100"
                                : day.inCurrentMonth
                                  ? "border-slate-700/70 bg-slate-900/80 text-slate-200"
                                  : "border-slate-800/70 bg-slate-950/70 text-slate-500"
                            }`}
                          >
                            {dayLabel}
                          </div>
                          {dayHasRows ? (
                            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                              {dayData?.rows.length} agente(s)
                            </div>
                          ) : null}
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                          {dayHasRows ? (
                            dayData!.rows.map((row) => {
                              const accentClass = AGENT_ROW_STYLES[row.agentId % AGENT_ROW_STYLES.length];
                              return (
                                <div
                                  key={`${day.iso}-${row.agentId}`}
                                  className={`rounded-xl border px-2.5 py-2 ${accentClass}`}
                                >
                                  <p className="truncate text-[11px] font-semibold">{row.agentName}</p>
                                  <p className="text-[11px] opacity-90">
                                    {row.totalCostBs == null ? "Costo N/D" : formatBs(row.totalCostBs)}
                                  </p>
                                </div>
                              );
                            })
                          ) : (
                            <div className="flex h-full min-h-[110px] items-center justify-center rounded-2xl border border-dashed border-slate-800/80 bg-slate-950/60 px-3 text-center text-xs text-slate-600">
                              Sin registros para este dia
                            </div>
                          )}
                        </div>

                        <div className="mt-2 rounded-2xl border border-violet-500/25 bg-violet-500/10 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-violet-300">Total global del dia</p>
                          <p className="mt-1 text-sm font-semibold text-white">
                            {dayHasRows
                              ? dayData!.hasAnyCost
                                ? formatBs(dayData!.totalCostBs)
                                : "N/D"
                              : "Sin gasto"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
