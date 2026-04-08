import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Copy, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type CityKey = "santaCruz" | "laPaz" | "cochabamba" | "tarija";
type ProductKey = "citrato" | "berberina" | "berberina2";

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

const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

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

function parseCount(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default function ReportPage() {
  const { toast } = useToast();
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [reportDate, setReportDate] = useState(todayValue);
  const [operatorName, setOperatorName] = useState("");
  const [callsMade, setCallsMade] = useState("0");
  const [callsAnswered, setCallsAnswered] = useState("0");
  const [callsMissed, setCallsMissed] = useState("0");
  const [callsPending, setCallsPending] = useState("0");

  const [salesByCity, setSalesByCity] = useState<Record<CityKey, Record<ProductKey, string>>>(() => ({
    santaCruz: { citrato: "0", berberina: "0", berberina2: "0" },
    laPaz: { citrato: "0", berberina: "0", berberina2: "0" },
    cochabamba: { citrato: "0", berberina: "0", berberina2: "0" },
    tarija: { citrato: "0", berberina: "0", berberina2: "0" },
  }));

  const totalsByCity = useMemo(() => {
    const totals: Record<CityKey, number> = {
      santaCruz: 0,
      laPaz: 0,
      cochabamba: 0,
      tarija: 0,
    };
    CITIES.forEach(({ key }) => {
      const city = salesByCity[key];
      totals[key] = PRODUCTS.reduce((sum, product) => sum + parseCount(city[product.key]), 0);
    });
    return totals;
  }, [salesByCity]);

  const totalSales = useMemo(() => {
    return CITIES.reduce((sum, city) => sum + totalsByCity[city.key], 0);
  }, [totalsByCity]);

  const reportText = useMemo(() => {
    const lines: string[] = [];
    lines.push("INFORME");
    const formattedDate = formatReportDate(reportDate);
    if (formattedDate) {
      lines.push(formattedDate);
    }
    if (operatorName.trim()) {
      lines.push(`OPERADOR: ${operatorName.trim()}`);
    }

    const callLines = [
      { label: "Llamadas realizadas", value: parseCount(callsMade) },
      { label: "Llamadas contestadas", value: parseCount(callsAnswered) },
      { label: "No contestada", value: parseCount(callsMissed) },
      { label: "Pendientes", value: parseCount(callsPending) },
    ].filter((item) => item.value > 0);

    if (callLines.length > 0) {
      lines.push("");
      callLines.forEach((item) => lines.push(`${item.label}: ${item.value}`));
    }

    CITIES.forEach(({ key, label }) => {
      const totalCity = totalsByCity[key];
      if (totalCity <= 0) return;
      lines.push("");
      lines.push(`VENTAS ${label.toUpperCase()}: ${totalCity}`);
      PRODUCTS.forEach((product) => {
        const value = parseCount(salesByCity[key][product.key]);
        if (value <= 0) return;
        lines.push(`${product.label}: ${value}`);
      });
    });

    lines.push("");
    lines.push(`Total Ventas: ${totalSales}`);

    return lines.join("\n").trim();
  }, [
    reportDate,
    operatorName,
    callsMade,
    callsAnswered,
    callsMissed,
    callsPending,
    salesByCity,
    totalsByCity,
    totalSales,
  ]);

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

  return (
    <div className="min-h-screen bg-slate-900 text-foreground flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/60 bg-slate-900/80 backdrop-blur-md">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-slate-200 hover:text-white" data-testid="button-back-report">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-emerald-400" />
          <h1 className="text-lg font-semibold text-white">Informe diario</h1>
        </div>
      </div>

      <div className="flex-1 w-full p-4 md:p-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card className="border-slate-700/60 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-base text-white">Datos generales</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="report-date">Fecha</Label>
                <Input
                  id="report-date"
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="bg-slate-800/60 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="operator-name">Operador</Label>
                <Input
                  id="operator-name"
                  placeholder="Nombre completo"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="bg-slate-800/60 border-slate-700 text-white"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-700/60 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-base text-white">Llamadas</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="calls-made">Realizadas</Label>
                <Input
                  id="calls-made"
                  type="number"
                  min={0}
                  value={callsMade}
                  onChange={(e) => setCallsMade(e.target.value)}
                  className="bg-slate-800/60 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="calls-answered">Contestadas</Label>
                <Input
                  id="calls-answered"
                  type="number"
                  min={0}
                  value={callsAnswered}
                  onChange={(e) => setCallsAnswered(e.target.value)}
                  className="bg-slate-800/60 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="calls-missed">No contestada</Label>
                <Input
                  id="calls-missed"
                  type="number"
                  min={0}
                  value={callsMissed}
                  onChange={(e) => setCallsMissed(e.target.value)}
                  className="bg-slate-800/60 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="calls-pending">Pendientes</Label>
                <Input
                  id="calls-pending"
                  type="number"
                  min={0}
                  value={callsPending}
                  onChange={(e) => setCallsPending(e.target.value)}
                  className="bg-slate-800/60 border-slate-700 text-white"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-700/60 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-base text-white">Ventas por ciudad</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {CITIES.map((city) => (
                <div key={city.key} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white">{city.label}</h3>
                    <span className="text-xs text-slate-400">
                      Total: <span className="text-slate-200 font-semibold">{totalsByCity[city.key]}</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {PRODUCTS.map((product) => (
                      <div key={product.key} className="space-y-2">
                        <Label htmlFor={`${city.key}-${product.key}`} className="text-xs text-slate-300">
                          {product.label}
                        </Label>
                        <Input
                          id={`${city.key}-${product.key}`}
                          type="number"
                          min={0}
                          value={salesByCity[city.key][product.key]}
                          onChange={(e) => updateCityValue(city.key, product.key, e.target.value)}
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
        </div>
      </div>
    </div>
  );
}
