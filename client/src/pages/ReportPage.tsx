import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Agent } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Copy, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type CityKey = "santaCruz" | "laPaz" | "cochabamba" | "tarija";
type ProductKey = "citrato" | "berberina" | "berberina2";

type ReportCalls = {
  made: number;
  answered: number;
  missed: number;
  pending: number;
};

type ReportPayload = {
  reportDate: string;
  operatorName: string;
  calls: ReportCalls;
  salesByCity: Record<CityKey, Record<ProductKey, number>>;
};

const CITIES: Array<{ key: CityKey; label: string }> = [
  { key: "santaCruz", label: "Santa Cruz" },
  { key: "laPaz", label: "La Paz" },
  { key: "cochabamba", label: "Cochabamba" },
  { key: "tarija", label: "Tarija" },
];

const PRODUCTS: Array<{ key: ProductKey; label: string }> = [
  { key: "citrato", label: "Citrato de Magnesio" },
  { key: "berberina", label: "Berberina" },
  { key: "berberina2", label: "Berberina 2.0" },
];

const dayNames = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function formatReportDate(value: string) {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  const day = dayNames[parsed.getDay()] || "";
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const yyyy = parsed.getFullYear();
  return `${day} ${dd}/${mm}/${yyyy}`;
}

function parseCount(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function createEmptySalesByCity(): Record<CityKey, Record<ProductKey, string>> {
  return {
    santaCruz: { citrato: "0", berberina: "0", berberina2: "0" },
    laPaz: { citrato: "0", berberina: "0", berberina2: "0" },
    cochabamba: { citrato: "0", berberina: "0", berberina2: "0" },
    tarija: { citrato: "0", berberina: "0", berberina2: "0" },
  };
}

function normalizeSalesByCityNumbers(raw?: Record<string, Record<string, number>>) {
  const base: Record<CityKey, Record<ProductKey, number>> = {
    santaCruz: { citrato: 0, berberina: 0, berberina2: 0 },
    laPaz: { citrato: 0, berberina: 0, berberina2: 0 },
    cochabamba: { citrato: 0, berberina: 0, berberina2: 0 },
    tarija: { citrato: 0, berberina: 0, berberina2: 0 },
  };

  if (!raw) return base;

  CITIES.forEach(({ key }) => {
    PRODUCTS.forEach((product) => {
      const value = (raw as any)?.[key]?.[product.key];
      base[key][product.key] = parseCount(value);
    });
  });

  return base;
}

function normalizeSalesByCityStrings(raw?: Record<string, Record<string, number>>) {
  const base = createEmptySalesByCity();
  if (!raw) return base;
  CITIES.forEach(({ key }) => {
    PRODUCTS.forEach((product) => {
      const value = (raw as any)?.[key]?.[product.key];
      base[key][product.key] = String(parseCount(value));
    });
  });
  return base;
}

function buildReportText(data: ReportPayload) {
  const lines: string[] = [];
  lines.push("INFORME");
  const formattedDate = formatReportDate(data.reportDate);
  if (formattedDate) {
    lines.push(formattedDate);
  }
  if (data.operatorName.trim()) {
    lines.push(`OPERADOR: ${data.operatorName.trim()}`);
  }

  const callLines = [
    { label: "Llamadas realizadas", value: parseCount(data.calls.made) },
    { label: "Llamadas contestadas", value: parseCount(data.calls.answered) },
    { label: "No contestada", value: parseCount(data.calls.missed) },
    { label: "Pendientes", value: parseCount(data.calls.pending) },
  ].filter((item) => item.value > 0);

  if (callLines.length > 0) {
    lines.push("");
    callLines.forEach((item) => lines.push(`${item.label}: ${item.value}`));
  }

  const totalsByCity: Record<CityKey, number> = {
    santaCruz: 0,
    laPaz: 0,
    cochabamba: 0,
    tarija: 0,
  };
  CITIES.forEach(({ key }) => {
    const city = data.salesByCity[key];
    totalsByCity[key] = PRODUCTS.reduce((sum, product) => sum + parseCount(city[product.key]), 0);
  });

  CITIES.forEach(({ key, label }) => {
    const totalCity = totalsByCity[key];
    if (totalCity <= 0) return;
    lines.push("");
    lines.push(`VENTAS ${label.toUpperCase()}: ${totalCity}`);
    PRODUCTS.forEach((product) => {
      const value = parseCount(data.salesByCity[key][product.key]);
      if (value <= 0) return;
      lines.push(`${product.label}: ${value}`);
    });
  });

  const totalSales = CITIES.reduce((sum, city) => sum + totalsByCity[city.key], 0);
  lines.push("");
  lines.push(`Total Ventas: ${totalSales}`);

  return lines.join("\n").trim();
}

export default function ReportPage() {
  const { toast } = useToast();
  const { isAdmin, isAgent } = useAuth();
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [reportDate, setReportDate] = useState(todayValue);
  const [operatorName, setOperatorName] = useState("");
  const [callsMade, setCallsMade] = useState("0");
  const [callsAnswered, setCallsAnswered] = useState("0");
  const [callsMissed, setCallsMissed] = useState("0");
  const [callsPending, setCallsPending] = useState("0");

  const [salesByCity, setSalesByCity] = useState<Record<CityKey, Record<ProductKey, string>>>(() => createEmptySalesByCity());

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const lastPayloadRef = useRef<string>("");

  const [adminDate, setAdminDate] = useState(todayValue);
  const [adminAgentId, setAdminAgentId] = useState<number | null>(null);

  const canEdit = isAgent;

  const salesByCityNumbers = useMemo(() => {
    const values: Record<CityKey, Record<ProductKey, number>> = {
      santaCruz: { citrato: 0, berberina: 0, berberina2: 0 },
      laPaz: { citrato: 0, berberina: 0, berberina2: 0 },
      cochabamba: { citrato: 0, berberina: 0, berberina2: 0 },
      tarija: { citrato: 0, berberina: 0, berberina2: 0 },
    };
    CITIES.forEach(({ key }) => {
      PRODUCTS.forEach((product) => {
        values[key][product.key] = parseCount(salesByCity[key][product.key]);
      });
    });
    return values;
  }, [salesByCity]);

  const totalsByCity = useMemo(() => {
    const totals: Record<CityKey, number> = {
      santaCruz: 0,
      laPaz: 0,
      cochabamba: 0,
      tarija: 0,
    };
    CITIES.forEach(({ key }) => {
      const city = salesByCityNumbers[key];
      totals[key] = PRODUCTS.reduce((sum, product) => sum + parseCount(city[product.key]), 0);
    });
    return totals;
  }, [salesByCityNumbers]);

  const totalSales = useMemo(() => {
    return CITIES.reduce((sum, city) => sum + totalsByCity[city.key], 0);
  }, [totalsByCity]);

  const currentPayload = useMemo<ReportPayload>(() => ({
    reportDate,
    operatorName: operatorName.trim(),
    calls: {
      made: parseCount(callsMade),
      answered: parseCount(callsAnswered),
      missed: parseCount(callsMissed),
      pending: parseCount(callsPending),
    },
    salesByCity: salesByCityNumbers,
  }), [reportDate, operatorName, callsMade, callsAnswered, callsMissed, callsPending, salesByCityNumbers]);

  const reportText = useMemo(() => buildReportText(currentPayload), [currentPayload]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      toast({ title: "Reporte copiado" });
    } catch (error) {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  };

  const updateCityValue = (cityKey: CityKey, productKey: ProductKey, value: string) => {
    setSalesByCity((prev) => ({
      ...prev,
      [cityKey]: {
        ...prev[cityKey],
        [productKey]: value,
      },
    }));
  };

  const applyReportData = (report: ReportPayload | null, fallbackOperatorName?: string | null) => {
    const nextOperator = report?.operatorName?.trim() || fallbackOperatorName?.trim() || "";
    const nextCalls = report?.calls || { made: 0, answered: 0, missed: 0, pending: 0 };
    const nextSales = report?.salesByCity ? normalizeSalesByCityStrings(report.salesByCity) : createEmptySalesByCity();

    setOperatorName(nextOperator);
    setCallsMade(String(nextCalls.made ?? 0));
    setCallsAnswered(String(nextCalls.answered ?? 0));
    setCallsMissed(String(nextCalls.missed ?? 0));
    setCallsPending(String(nextCalls.pending ?? 0));
    setSalesByCity(nextSales);

    const baselinePayload: ReportPayload = {
      reportDate,
      operatorName: nextOperator,
      calls: {
        made: parseCount(nextCalls.made),
        answered: parseCount(nextCalls.answered),
        missed: parseCount(nextCalls.missed),
        pending: parseCount(nextCalls.pending),
      },
      salesByCity: normalizeSalesByCityNumbers(report?.salesByCity),
    };

    lastPayloadRef.current = JSON.stringify(baselinePayload);
  };

  useEffect(() => {
    if (!isAgent) return;
    let cancelled = false;
    setIsHydrated(false);
    setSaveStatus("idle");

    const loadReport = async () => {
      try {
        const res = await fetch(`/api/reports/me?date=${encodeURIComponent(reportDate)}`);
        if (!res.ok) throw new Error("No se pudo cargar reporte");
        const data = await res.json();
        if (cancelled) return;
        applyReportData(data?.report || null, data?.latestOperatorName || null);
      } catch (error) {
        if (!cancelled) {
          toast({ title: "Error", description: "No se pudo cargar reporte", variant: "destructive" });
        }
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    };

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, [isAgent, reportDate, toast]);

  useEffect(() => {
    if (!canEdit || !isHydrated) return;

    const payload = currentPayload;
    const payloadKey = JSON.stringify(payload);
    if (payloadKey === lastPayloadRef.current) return;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    setSaveStatus("saving");
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/reports/me", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("No se pudo guardar");
        lastPayloadRef.current = payloadKey;
        setSaveStatus("saved");
        setLastSavedAt(new Date().toISOString());
      } catch (error) {
        setSaveStatus("error");
        toast({ title: "Error", description: "No se pudo guardar el reporte", variant: "destructive" });
      }
    }, 800);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [canEdit, currentPayload, isHydrated, toast]);

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents", "report"],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("No se pudo cargar agentes");
      return res.json();
    },
  });

  useEffect(() => {
    if (!isAdmin) return;
    if (agents.length > 0 && adminAgentId === null) {
      setAdminAgentId(agents[0].id);
    }
  }, [agents, adminAgentId, isAdmin]);

  const { data: adminReportResponse, isLoading: adminReportLoading } = useQuery<{
    report: ReportPayload | null;
  }>({
    queryKey: ["/api/reports/agent", adminAgentId, adminDate],
    enabled: isAdmin && Number.isInteger(adminAgentId),
    queryFn: async () => {
      const res = await fetch(`/api/reports/agent/${adminAgentId}?date=${encodeURIComponent(adminDate)}`);
      if (!res.ok) throw new Error("No se pudo cargar reporte");
      return res.json();
    },
  });

  const adminReport = adminReportResponse?.report
    ? {
        ...adminReportResponse.report,
        salesByCity: normalizeSalesByCityNumbers(adminReportResponse.report.salesByCity),
      }
    : null;
  const adminReportText = adminReport ? buildReportText(adminReport) : "Sin reporte para esta fecha.";

  const lastSavedLabel = useMemo(() => {
    if (!lastSavedAt) return "";
    try {
      return new Date(lastSavedAt).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }, [lastSavedAt]);

  const handleCopyAdmin = async () => {
    try {
      await navigator.clipboard.writeText(adminReportText);
      toast({ title: "Reporte copiado" });
    } catch (error) {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-foreground flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/60 bg-slate-900/80 backdrop-blur-md">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-slate-200 hover:text-white" data-testid="button-back-report">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-emerald-400" />
          <h1 className="text-lg font-semibold text-white">Informe diario</h1>
          {canEdit && (
            <span
              className={cn(
                "text-xs font-medium",
                saveStatus === "saving" && "text-amber-300",
                saveStatus === "saved" && "text-emerald-300",
                saveStatus === "error" && "text-red-300",
                saveStatus === "idle" && "text-slate-400",
              )}
            >
              {saveStatus === "saving" && "Guardando..."}
              {saveStatus === "saved" && `Guardado${lastSavedLabel ? ` ${lastSavedLabel}` : ""}`}
              {saveStatus === "error" && "Error al guardar"}
              {saveStatus === "idle" && "Auto-guardado"}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 w-full p-4 md:p-6 grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <Card className="border-slate-700/60 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-base text-white">Datos generales</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="report-date" className="text-xs uppercase tracking-wide text-slate-300">Fecha</Label>
                <Input
                  id="report-date"
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  disabled={!canEdit}
                  className="bg-slate-800/60 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="operator-name" className="text-xs uppercase tracking-wide text-slate-300">Operador</Label>
                <Input
                  id="operator-name"
                  placeholder="Nombre completo"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  disabled={!canEdit}
                  className="bg-slate-800/60 border-slate-700 text-white"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-700/60 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-base text-white">Llamadas</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 space-y-2">
                <Label htmlFor="calls-made" className="text-xs uppercase tracking-wide text-slate-300">Realizadas</Label>
                <Input
                  id="calls-made"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={callsMade}
                  onChange={(e) => setCallsMade(e.target.value)}
                  placeholder="Ej: 27"
                  disabled={!canEdit}
                  className="bg-slate-800/60 border-slate-700 text-white"
                />
                <p className="text-[11px] text-slate-500">Total de llamadas del dia.</p>
              </div>
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 space-y-2">
                <Label htmlFor="calls-answered" className="text-xs uppercase tracking-wide text-slate-300">Contestadas</Label>
                <Input
                  id="calls-answered"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={callsAnswered}
                  onChange={(e) => setCallsAnswered(e.target.value)}
                  placeholder="Ej: 13"
                  disabled={!canEdit}
                  className="bg-slate-800/60 border-slate-700 text-white"
                />
                <p className="text-[11px] text-slate-500">Llamadas con respuesta.</p>
              </div>
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 space-y-2">
                <Label htmlFor="calls-missed" className="text-xs uppercase tracking-wide text-slate-300">No contestada</Label>
                <Input
                  id="calls-missed"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={callsMissed}
                  onChange={(e) => setCallsMissed(e.target.value)}
                  placeholder="Ej: 19"
                  disabled={!canEdit}
                  className="bg-slate-800/60 border-slate-700 text-white"
                />
                <p className="text-[11px] text-slate-500">Sin respuesta del cliente.</p>
              </div>
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 space-y-2">
                <Label htmlFor="calls-pending" className="text-xs uppercase tracking-wide text-slate-300">Pendientes</Label>
                <Input
                  id="calls-pending"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={callsPending}
                  onChange={(e) => setCallsPending(e.target.value)}
                  placeholder="Ej: 0"
                  disabled={!canEdit}
                  className="bg-slate-800/60 border-slate-700 text-white"
                />
                <p className="text-[11px] text-slate-500">Por llamar o reintentar.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-700/60 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-base text-white">Ventas por ciudad</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {CITIES.map((city) => (
                <div key={city.key} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-white">{city.label}</h3>
                    <span className="text-xs text-slate-400">
                      Total: <span className="text-slate-200 font-semibold">{totalsByCity[city.key]}</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {PRODUCTS.map((product) => (
                      <div key={product.key} className="space-y-1">
                        <Label htmlFor={`${city.key}-${product.key}`} className="text-[11px] uppercase tracking-wide text-slate-300">
                          {product.label}
                        </Label>
                        <Input
                          id={`${city.key}-${product.key}`}
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={salesByCity[city.key][product.key]}
                          onChange={(e) => updateCityValue(city.key, product.key, e.target.value)}
                          placeholder="0"
                          disabled={!canEdit}
                          className="bg-slate-800/60 border-slate-700 text-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {isAdmin && (
            <Card className="border-slate-700/60 bg-slate-900/50">
              <CardHeader>
                <CardTitle className="text-base text-white">Reporte por agente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="admin-report-date" className="text-xs uppercase tracking-wide text-slate-300">Fecha</Label>
                  <Input
                    id="admin-report-date"
                    type="date"
                    value={adminDate}
                    onChange={(e) => setAdminDate(e.target.value)}
                    className="bg-slate-800/60 border-slate-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-slate-300">Agente</Label>
                  <Select
                    value={adminAgentId ? String(adminAgentId) : ""}
                    onValueChange={(value) => setAdminAgentId(Number(value))}
                  >
                    <SelectTrigger className="bg-slate-800/60 border-slate-700 text-white">
                      <SelectValue placeholder="Seleccione agente" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={String(agent.id)}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    {adminReportLoading ? "Cargando..." : adminReport ? "Reporte encontrado" : "Sin reporte"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyAdmin}
                    disabled={!adminReport}
                    className="border-slate-600 text-slate-200"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar
                  </Button>
                </div>
                <Textarea
                  value={adminReportText}
                  readOnly
                  className={cn("min-h-[280px] bg-slate-950/60 border-slate-700 text-slate-100 text-sm")}
                />
              </CardContent>
            </Card>
          )}

          {canEdit && (
            <Card className="border-slate-700/60 bg-slate-900/50 sticky top-4">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base text-white">Texto para copiar</CardTitle>
                <Button variant="outline" size="sm" onClick={handleCopy} className="border-slate-600 text-slate-200">
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar
                </Button>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={reportText}
                  readOnly
                  className={cn("min-h-[360px] bg-slate-950/60 border-slate-700 text-slate-100 text-sm")}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}


