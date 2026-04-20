import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, CalendarDays, Plus, Trash2, Users, Wallet, Zap } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface AgentStat {
  agent_id: number;
  agent_name: string;
  date: string;
  total_estimated_parallel_cost_bs?: number | null;
}

interface AnalyticsDeposit {
  id: number;
  viewerAgentId: number;
  depositDate: string;
  amountBs: number;
  note?: string | null;
  createdAt?: string | null;
}

interface DepositOwnerAgent {
  id: number;
  name: string;
  isActive?: boolean;
}

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

type DayDepositSummary = {
  amountBs: number;
  entries: AnalyticsDeposit[];
};

type MonthSummary = {
  totalCostBs: number;
  hasAnyCost: boolean;
  dayCountWithEntries: number;
};

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

function getTodayIsoDate(): string {
  return toLaPazInputDate(new Date());
}

function getTodayMonthValue(): string {
  return getTodayIsoDate().slice(0, 7);
}

function parseMonthValue(value: string): { year: number; month: number } {
  const [yearRaw, monthRaw] = value.split("-");
  return {
    year: Number(yearRaw),
    month: Number(monthRaw),
  };
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

function getCurrentMonthRange(): { dateFrom: string; dateTo: string } {
  return getMonthRange(getTodayMonthValue());
}

function shiftIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);
  return `${utcDate.getUTCFullYear()}-${String(utcDate.getUTCMonth() + 1).padStart(2, "0")}-${String(utcDate.getUTCDate()).padStart(2, "0")}`;
}

function normalizeRange(dateFrom: string, dateTo: string): { dateFrom: string; dateTo: string; isSingleDay: boolean } {
  const fallback = getCurrentMonthRange();
  let from = dateFrom || fallback.dateFrom;
  let to = dateTo || fallback.dateTo;

  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }

  return {
    dateFrom: from,
    dateTo: to,
    isSingleDay: from === to,
  };
}

function getMonthsInRange(dateFrom: string, dateTo: string): string[] {
  const safeRange = normalizeRange(dateFrom, dateTo);
  const startMonth = `${safeRange.dateFrom.slice(0, 7)}-01`;
  const endMonth = `${safeRange.dateTo.slice(0, 7)}-01`;

  const [startYear, startRawMonth] = startMonth.split("-").map(Number);
  const [endYear, endRawMonth] = endMonth.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear, startRawMonth - 1, 1));
  const limit = new Date(Date.UTC(endYear, endRawMonth - 1, 1));

  const months: string[] = [];
  while (cursor <= limit) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
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

function formatIsoLong(isoDate: string): string {
  const [yearRaw, monthRaw, dayRaw] = isoDate.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatRangeLabel(dateFrom: string, dateTo: string): string {
  const formatOne = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return value;
    return new Intl.DateTimeFormat("es-BO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)));
  };

  if (dateFrom === dateTo) return formatOne(dateFrom);
  return `${formatOne(dateFrom)} a ${formatOne(dateTo)}`;
}

function formatBs(value: number): string {
  return `${value.toLocaleString("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Bs`;
}

function formatSignedBs(value: number): string {
  const formatted = formatBs(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function countDaysInRange(dateFrom: string, dateTo: string): number {
  const [fromYear, fromMonth, fromDay] = dateFrom.split("-").map(Number);
  const [toYear, toMonth, toDay] = dateTo.split("-").map(Number);
  if (!fromYear || !fromMonth || !fromDay || !toYear || !toMonth || !toDay) return 0;

  const from = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const to = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1;
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

function getNetToneClass(value: number): string {
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-rose-300";
  return "text-slate-200";
}

function parsePositiveAmountInput(value: string): number {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Ingrese un monto valido");
  }
  return parsed;
}

export default function AnalyticsCalendarPage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initialRange = useMemo(() => getCurrentMonthRange(), []);
  const [reportDateFrom, setReportDateFrom] = useState(initialRange.dateFrom);
  const [reportDateTo, setReportDateTo] = useState(initialRange.dateTo);
  const [selectedAgentIds, setSelectedAgentIds] = useState<number[]>([]);
  const [isDepositsDialogOpen, setIsDepositsDialogOpen] = useState(false);
  const [depositOwnerAgentId, setDepositOwnerAgentId] = useState<number | null>(null);
  const [depositDateInput, setDepositDateInput] = useState(() => getTodayIsoDate());
  const [depositAmountInput, setDepositAmountInput] = useState("");
  const [depositNoteInput, setDepositNoteInput] = useState("");
  const agentsFilterInitializedRef = useRef(false);
  const todayIso = useMemo(() => getTodayIsoDate(), []);

  const appliedRange = useMemo(
    () => normalizeRange(reportDateFrom, reportDateTo),
    [reportDateFrom, reportDateTo],
  );

  const monthValues = useMemo(
    () => getMonthsInRange(appliedRange.dateFrom, appliedRange.dateTo),
    [appliedRange.dateFrom, appliedRange.dateTo],
  );

  const { data: agentStats = [], isLoading } = useQuery<AgentStat[]>({
    queryKey: ["/api/agent-stats", "calendar-range", appliedRange.dateFrom, appliedRange.dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("dateFrom", appliedRange.dateFrom);
      params.set("dateTo", appliedRange.dateTo);
      const response = await fetch(`/api/agent-stats?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("No se pudo cargar analytics por rango");
      return response.json();
    },
  });

  const { data: adminAgents = [] } = useQuery<DepositOwnerAgent[]>({
    queryKey: ["/api/agents", "analytics-calendar-deposit-owners"],
    queryFn: async () => {
      const response = await fetch("/api/agents", { credentials: "include" });
      if (!response.ok) throw new Error("No se pudo cargar agentes para depositos");
      return response.json();
    },
    enabled: isAdmin,
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
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [agentStats]);

  const depositOwnerOptions = useMemo(() => {
    if (isAdmin) {
      return [...adminAgents].sort((left, right) => left.name.localeCompare(right.name));
    }
    if (user?.role === "agent" && typeof user.agentId === "number") {
      return [{ id: user.agentId, name: user.username || `Agente ${user.agentId}` }];
    }
    return [];
  }, [adminAgents, isAdmin, user?.agentId, user?.role, user?.username]);

  const depositOwnerName =
    depositOwnerOptions.find((agent) => agent.id === depositOwnerAgentId)?.name ||
    (depositOwnerAgentId != null ? `Agente ${depositOwnerAgentId}` : "Agente visor");

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

  useEffect(() => {
    const optionIds = depositOwnerOptions.map((item) => item.id);
    if (optionIds.length === 0) {
      setDepositOwnerAgentId(null);
      return;
    }

    if (user?.role === "agent" && typeof user.agentId === "number") {
      setDepositOwnerAgentId(user.agentId);
      return;
    }

    setDepositOwnerAgentId((previous) => {
      if (previous != null && optionIds.includes(previous)) return previous;
      return optionIds[0];
    });
  }, [depositOwnerOptions, user?.agentId, user?.role]);

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

  const monthSummaryMap = useMemo(() => {
    const grouped = new Map<string, MonthSummary>();
    for (const [dateKey, summary] of Array.from(dayCostMap.entries())) {
      const monthKey = dateKey.slice(0, 7);
      const current = grouped.get(monthKey) || {
        totalCostBs: 0,
        hasAnyCost: false,
        dayCountWithEntries: 0,
      };

      if (summary.rows.length > 0) current.dayCountWithEntries += 1;
      if (summary.hasAnyCost) {
        current.totalCostBs += summary.totalCostBs;
        current.hasAnyCost = true;
      }

      grouped.set(monthKey, current);
    }
    return grouped;
  }, [dayCostMap]);

  const rangeSummary = useMemo(() => {
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
      monthCount: monthValues.length,
      rangeDayCount: countDaysInRange(appliedRange.dateFrom, appliedRange.dateTo),
    };
  }, [appliedRange.dateFrom, appliedRange.dateTo, dayCostMap, monthValues.length, selectedAgentIds.length]);

  const { data: deposits = [], isLoading: isDepositsLoading } = useQuery<AnalyticsDeposit[]>({
    queryKey: ["/api/analytics-deposits", depositOwnerAgentId, appliedRange.dateFrom, appliedRange.dateTo],
    queryFn: async () => {
      if (depositOwnerAgentId == null) return [];
      const params = new URLSearchParams();
      params.set("dateFrom", appliedRange.dateFrom);
      params.set("dateTo", appliedRange.dateTo);
      if (isAdmin) {
        params.set("viewerAgentId", String(depositOwnerAgentId));
      }
      const response = await fetch(`/api/analytics-deposits?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("No se pudieron cargar los depositos");
      return response.json();
    },
    enabled: depositOwnerAgentId != null,
  });

  const dayDepositMap = useMemo(() => {
    const grouped = new Map<string, DayDepositSummary>();
    for (const deposit of deposits) {
      const dateKey = String(deposit.depositDate);
      const current = grouped.get(dateKey) || {
        amountBs: 0,
        entries: [],
      };
      current.amountBs += Number(deposit.amountBs || 0);
      current.entries.push(deposit);
      grouped.set(dateKey, current);
    }

    for (const summary of Array.from(grouped.values())) {
      summary.entries.sort((left, right) => right.id - left.id);
    }

    return grouped;
  }, [deposits]);

  const depositSummary = useMemo(() => {
    let totalAmountBs = 0;
    for (const deposit of deposits) {
      totalAmountBs += Number(deposit.amountBs || 0);
    }
    return {
      totalAmountBs,
      entryCount: deposits.length,
      dayCount: dayDepositMap.size,
    };
  }, [deposits, dayDepositMap.size]);

  const rangeCostBs = rangeSummary.hasAnyCost ? rangeSummary.totalCostBs : 0;
  const rangeNetBs = depositSummary.totalAmountBs - rangeCostBs;

  const createDepositMutation = useMutation({
    mutationFn: async () => {
      if (depositOwnerAgentId == null) {
        throw new Error("Seleccione el agente visor");
      }
      const amountBs = parsePositiveAmountInput(depositAmountInput);
      const payload: Record<string, unknown> = {
        depositDate: depositDateInput || appliedRange.dateTo || todayIso,
        amountBs,
        note: depositNoteInput.trim() || null,
      };
      if (isAdmin) {
        payload.viewerAgentId = depositOwnerAgentId;
      }
      const response = await apiRequest("POST", "/api/analytics-deposits", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/analytics-deposits"] });
      setDepositAmountInput("");
      setDepositNoteInput("");
      setDepositDateInput(appliedRange.dateTo || todayIso);
      toast({ title: "Deposito guardado" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteDepositMutation = useMutation({
    mutationFn: async (depositId: number) => {
      const response = await apiRequest("DELETE", `/api/analytics-deposits/${depositId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/analytics-deposits"] });
      toast({ title: "Deposito eliminado" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const applyQuickToday = () => {
    const today = getTodayIsoDate();
    setReportDateFrom(today);
    setReportDateTo(today);
  };

  const applyQuickRangeDays = (days: number) => {
    const end = getTodayIsoDate();
    const start = shiftIsoDate(end, -(days - 1));
    setReportDateFrom(start);
    setReportDateTo(end);
  };

  const applyQuickCurrentMonth = () => {
    const range = getCurrentMonthRange();
    setReportDateFrom(range.dateFrom);
    setReportDateTo(range.dateTo);
  };

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
                Vista calendario por rango, incluso si cruza entre meses
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatRangeLabel(appliedRange.dateFrom, appliedRange.dateTo)}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5 pb-28 md:pb-20">
        <div className="rounded-3xl border border-slate-800/80 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-4 shadow-[0_18px_60px_rgba(2,6,23,.45)]">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_1fr]">
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/55 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Filtro de rango</p>
                  <p className="text-xs text-slate-400">Ejemplo: del 20 de marzo al 10 de abril</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Desde</label>
                  <Input
                    type="date"
                    value={reportDateFrom}
                    onChange={(event) => setReportDateFrom(event.target.value)}
                    className="bg-slate-950/80 border-slate-700/60 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Hasta</label>
                  <Input
                    type="date"
                    value={reportDateTo}
                    onChange={(event) => setReportDateTo(event.target.value)}
                    className="bg-slate-950/80 border-slate-700/60 text-white"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/10"
                  onClick={applyQuickToday}
                >
                  Hoy
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-slate-600 text-slate-200 hover:bg-slate-800"
                  onClick={() => applyQuickRangeDays(7)}
                >
                  7 dias
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-slate-600 text-slate-200 hover:bg-slate-800"
                  onClick={() => applyQuickRangeDays(30)}
                >
                  30 dias
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-slate-600 text-slate-200 hover:bg-slate-800"
                  onClick={applyQuickCurrentMonth}
                >
                  Este mes
                </Button>
              </div>

              <div className="mt-3 rounded-2xl border border-slate-700/70 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                Rango aplicado: {formatRangeLabel(appliedRange.dateFrom, appliedRange.dateTo)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/55 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Filtro de agentes</p>
                  <p className="text-xs text-slate-400">Aplique el rango y luego seleccione los agentes a mostrar</p>
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

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Dias del rango</p>
                  <p className="mt-2 text-3xl font-bold text-white">{rangeSummary.rangeDayCount}</p>
                </div>
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">Meses visibles</p>
                  <p className="mt-2 text-3xl font-bold text-white">{rangeSummary.monthCount}</p>
                </div>
                <div className="rounded-2xl border border-violet-500/25 bg-violet-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-violet-300">Dias con registros</p>
                  <p className="mt-2 text-3xl font-bold text-white">{rangeSummary.dayCountWithEntries}</p>
                </div>
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-amber-300">Total gastado</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {rangeSummary.hasAnyCost ? formatBs(rangeSummary.totalCostBs) : formatBs(0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300">Total depositado</p>
                  <p className="mt-2 text-2xl font-bold text-white">{formatBs(depositSummary.totalAmountBs)}</p>
                </div>
                <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-rose-300">Saldo / debe</p>
                  <p className={`mt-2 text-2xl font-bold ${getNetToneClass(rangeNetBs)}`}>
                    {formatSignedBs(rangeNetBs)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-8 text-center text-slate-400">
            Cargando calendario por rango...
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {monthValues.map((monthValue) => {
              const monthSummary = monthSummaryMap.get(monthValue) || {
                totalCostBs: 0,
                hasAnyCost: false,
                dayCountWithEntries: 0,
              };

              return (
                <div
                  key={monthValue}
                  className="rounded-3xl border border-slate-800/80 bg-slate-900/70 shadow-[0_18px_60px_rgba(2,6,23,.35)] overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3">
                    <div>
                      <h2 className="text-base font-semibold text-white capitalize">{formatMonthHeading(monthValue)}</h2>
                      <p className="text-xs text-slate-400">
                        {monthSummary.dayCountWithEntries} dia(s) con agentes visibles en este mes
                      </p>
                    </div>
                    <div className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-100">
                      {monthSummary.hasAnyCost ? formatBs(monthSummary.totalCostBs) : formatBs(0)}
                    </div>
                  </div>

                  <div className="grid grid-cols-7 border-b border-slate-800/80 bg-slate-950/80">
                    {WEEKDAY_LABELS.map((label) => (
                      <div key={`${monthValue}-${label}`} className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                        {label}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-px bg-slate-800/70">
                    {getCalendarDays(monthValue).map((day) => {
                      const isToday = day.iso === todayIso;
                      const isWithinRange = day.iso >= appliedRange.dateFrom && day.iso <= appliedRange.dateTo;
                      const dayData = isWithinRange && day.inCurrentMonth ? dayCostMap.get(day.iso) : undefined;
                      const dayDeposit = isWithinRange && day.inCurrentMonth ? dayDepositMap.get(day.iso) : undefined;
                      const dayHasRows = Boolean(dayData && dayData.rows.length > 0);
                      const dayCostBs = dayHasRows && dayData?.hasAnyCost ? dayData.totalCostBs : 0;
                      const dayDepositBs = dayDeposit?.amountBs ?? 0;
                      const dayNetBs = dayDepositBs - dayCostBs;

                      return (
                        <div
                          key={`${monthValue}-${day.iso}`}
                          className={`min-h-[250px] p-2.5 flex flex-col ${
                            day.inCurrentMonth ? "bg-slate-950/90" : "bg-slate-950/45"
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
                              {day.inCurrentMonth ? day.dayNumber : formatIsoShort(day.iso)}
                            </div>
                            {dayHasRows ? (
                              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                                {dayData?.rows.length} agente(s)
                              </div>
                            ) : null}
                          </div>

                          {!day.inCurrentMonth ? (
                            <div className="flex-1 rounded-2xl border border-dashed border-slate-900/90 bg-slate-950/60" />
                          ) : !isWithinRange ? (
                            <div className="flex flex-1 min-h-[110px] items-center justify-center rounded-2xl border border-dashed border-slate-800/80 bg-slate-950/60 px-3 text-center text-xs text-slate-600">
                              Fuera del rango
                            </div>
                          ) : (
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
                          )}

                          <div className="mt-2 rounded-2xl border border-violet-500/25 bg-violet-500/10 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-violet-300">Resumen del dia</p>
                            <div className="mt-1.5 space-y-1 text-[11px] text-slate-200">
                              <div className="flex items-center justify-between gap-2">
                                <span>Gasto</span>
                                <span>
                                  {!day.inCurrentMonth
                                    ? "-"
                                    : !isWithinRange
                                      ? "Fuera"
                                      : dayHasRows
                                        ? dayData!.hasAnyCost
                                          ? formatBs(dayData!.totalCostBs)
                                          : "N/D"
                                        : formatBs(0)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span>Depositos</span>
                                <span>
                                  {!day.inCurrentMonth
                                    ? "-"
                                    : !isWithinRange
                                      ? "Fuera"
                                      : formatBs(dayDepositBs)}
                                </span>
                              </div>
                              <div className={`flex items-center justify-between gap-2 font-semibold ${getNetToneClass(dayNetBs)}`}>
                                <span>Neto</span>
                                <span>
                                  {!day.inCurrentMonth
                                    ? "-"
                                    : !isWithinRange
                                      ? "Fuera"
                                      : formatSignedBs(dayNetBs)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Button
        type="button"
        className="fixed bottom-20 right-4 z-20 h-12 rounded-full bg-gradient-to-r from-emerald-600 to-cyan-600 px-4 text-white shadow-[0_16px_48px_rgba(6,182,212,.28)] hover:from-emerald-500 hover:to-cyan-500 md:bottom-6"
        onClick={() => setIsDepositsDialogOpen(true)}
      >
        <Wallet className="mr-2 h-4 w-4" />
        Depositos
      </Button>

      <Dialog open={isDepositsDialogOpen} onOpenChange={setIsDepositsDialogOpen}>
        <DialogContent className="border-slate-700 bg-slate-950 text-slate-100 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Depositos del agente visor</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{depositOwnerName}</p>
                  <p className="text-xs text-slate-400">
                    Se compara contra el gasto del rango y los agentes actualmente seleccionados.
                  </p>
                </div>
                <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
                  {formatRangeLabel(appliedRange.dateFrom, appliedRange.dateTo)}
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300">Depositado</p>
                  <p className="mt-2 text-2xl font-bold text-white">{formatBs(depositSummary.totalAmountBs)}</p>
                </div>
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-amber-300">Gastado</p>
                  <p className="mt-2 text-2xl font-bold text-white">{formatBs(rangeCostBs)}</p>
                </div>
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">Saldo / debe</p>
                  <p className={`mt-2 text-2xl font-bold ${getNetToneClass(rangeNetBs)}`}>{formatSignedBs(rangeNetBs)}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                    <Plus className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Nuevo deposito</p>
                    <p className="text-xs text-slate-400">Se guarda solo el movimiento; el saldo se calcula visualmente.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {isAdmin ? (
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Agente visor / lider</label>
                      <select
                        value={depositOwnerAgentId ?? ""}
                        onChange={(event) => setDepositOwnerAgentId(event.target.value ? Number(event.target.value) : null)}
                        className="h-10 w-full rounded-md border border-slate-700/60 bg-slate-950/80 px-3 text-sm text-white outline-none"
                      >
                        <option value="">Seleccione un agente</option>
                        {depositOwnerOptions.map((agent) => (
                          <option key={`deposit-owner-${agent.id}`} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Fecha</label>
                    <Input
                      type="date"
                      value={depositDateInput}
                      onChange={(event) => setDepositDateInput(event.target.value)}
                      className="bg-slate-950/80 border-slate-700/60 text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Monto en Bs</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={depositAmountInput}
                      onChange={(event) => setDepositAmountInput(event.target.value)}
                      placeholder="Ej: 1500"
                      className="bg-slate-950/80 border-slate-700/60 text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Nota opcional</label>
                    <Input
                      value={depositNoteInput}
                      onChange={(event) => setDepositNoteInput(event.target.value)}
                      placeholder="Referencia o comentario"
                      className="bg-slate-950/80 border-slate-700/60 text-white"
                    />
                  </div>

                  <Button
                    type="button"
                    className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 border-0"
                    disabled={createDepositMutation.isPending || depositOwnerAgentId == null}
                    onClick={() => createDepositMutation.mutate()}
                  >
                    {createDepositMutation.isPending ? "Guardando..." : "Guardar deposito"}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Movimientos del rango</p>
                    <p className="text-xs text-slate-400">
                      {depositSummary.entryCount} deposito(s) en {depositSummary.dayCount} dia(s)
                    </p>
                  </div>
                  <div className="rounded-full border border-slate-700/70 bg-slate-950/80 px-3 py-1 text-xs text-slate-300">
                    {isDepositsLoading ? "Cargando..." : formatBs(depositSummary.totalAmountBs)}
                  </div>
                </div>

                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {isDepositsLoading ? (
                    <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/70 p-5 text-center text-sm text-slate-400">
                      Cargando depositos...
                    </div>
                  ) : deposits.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/70 p-5 text-center text-sm text-slate-400">
                      Sin depositos guardados para este rango.
                    </div>
                  ) : (
                    deposits.map((deposit) => {
                      const costForDay = dayCostMap.get(deposit.depositDate);
                      const netForDay = Number(deposit.amountBs || 0) - (costForDay?.hasAnyCost ? costForDay.totalCostBs : 0);
                      return (
                        <div key={`deposit-${deposit.id}`} className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white">{formatIsoLong(deposit.depositDate)}</p>
                              <p className="mt-1 text-xs text-slate-400 break-words">
                                {deposit.note?.trim() || "Sin nota"}
                              </p>
                              <p className={`mt-2 text-xs font-semibold ${getNetToneClass(netForDay)}`}>
                                Neto del dia: {formatSignedBs(netForDay)}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <p className="text-sm font-semibold text-emerald-200">{formatBs(deposit.amountBs)}</p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-rose-500/40 text-rose-200 hover:bg-rose-500/10"
                                disabled={deleteDepositMutation.isPending}
                                onClick={() => {
                                  if (window.confirm("Eliminar este deposito?")) {
                                    deleteDepositMutation.mutate(deposit.id);
                                  }
                                }}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Eliminar
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
