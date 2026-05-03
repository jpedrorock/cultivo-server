import { trpc } from "@/lib/trpc";
import { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download, Calendar, Filter, Table as TableIcon, Pencil, Trash2, FileDown, ClipboardList, Share2, ArrowUpDown, ArrowUp, ArrowDown, MoreHorizontal } from "lucide-react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EditLogDialog } from "@/components/EditLogDialog";
import { AnalyticsCharts } from "@/components/AnalyticsCharts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { HistoryTableSkeleton } from "@/components/ListSkeletons";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function HistoryTable() {
  const [, navigate] = useLocation();
  const [selectedTentId, setSelectedTentId] = useState<number | undefined>(undefined);
  const [period, setPeriod] = useState<string>("30");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);
  const [editingLog, setEditingLog] = useState<any | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<number | null>(null);
  const [turnFilter, setTurnFilter] = useState<"AM" | "PM" | "ALL">("ALL");
  const [sortField, setSortField] = useState<'logDate' | 'tempC' | 'rhPct' | 'ppfd' | 'ph' | 'ec' | 'vpd'>('logDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Quantos filtros estão ativos além dos defaults (30d, turn ALL, limit 50).
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (period !== "30") n++;
    if (turnFilter !== "ALL") n++;
    if (limit !== 50) n++;
    return n;
  }, [period, turnFilter, limit]);

  const { data: tents, isLoading: tentsLoading } = trpc.tents.list.useQuery();

  // Calculate date range based on period
  const dateRange = useMemo(() => {
    if (period === "custom" && startDate && endDate) {
      return {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      };
    }
    
    if (period !== "custom" && period !== "all") {
      const days = parseInt(period);
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      return { startDate: start, endDate: end };
    }
    
    return { startDate: undefined, endDate: undefined };
  }, [period, startDate, endDate]);

  const { data: logsData, isLoading: logsLoading } = trpc.dailyLogs.listAll.useQuery({
    tentId: selectedTentId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    limit,
    offset,
  });

  const utils = trpc.useUtils();
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup pending delete timeout on unmount
  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    };
  }, []);

  const deleteMutation = trpc.dailyLogs.delete.useMutation({
    onSuccess: () => {
      toast.success("Registro excluído com sucesso!");
      utils.dailyLogs.listAll.invalidate();
      setDeletingLogId(null);
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
    },
  });

  const handleDelete = () => {
    if (deletingLogId) {
      const logId = deletingLogId;
      setDeletingLogId(null); // Close dialog immediately

      // Cancel any previous pending delete
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);

      // Show toast with undo button
      toast.info("Registro será excluído em 5 segundos", {
        duration: 5000,
        action: {
          label: "Desfazer",
          onClick: () => {
            if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
            toast.success("Exclusão cancelada!");
          },
        },
      });

      // Schedule deletion after 5 seconds
      deleteTimeoutRef.current = setTimeout(() => {
        deleteMutation.mutate({ id: logId });
      }, 5000);
    }
  };

  const handleEditSuccess = () => {
    utils.dailyLogs.listAll.invalidate();
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (!logsData?.logs || logsData.logs.length === 0) {
      toast.error("Nenhum dado para compartilhar");
      return;
    }
    const total = logsData.total || logsData.logs.length;
    const tentsNames = Array.from(new Set(logsData.logs.map((l: any) => l.tentName).filter(Boolean))).join(', ');
    const lastLog = logsData.logs[0];
    const firstLog = logsData.logs[logsData.logs.length - 1];
    const dateFrom = new Date(firstLog.logDate).toLocaleDateString('pt-BR');
    const dateTo = new Date(lastLog.logDate).toLocaleDateString('pt-BR');

    const text = [
      `📊 Histórico de Cultivo`,
      `🌱 Estufas: ${tentsNames || 'Todas'}`,
      `📅 Período: ${dateFrom} — ${dateTo}`,
      `📝 Total de registros: ${total}`,
      ``,
      `🔗 App Cultivo — cultivo.x.andy.plus`,
    ].join('\n');

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Histórico App Cultivo', text });
      } catch (err: any) {
        if (err?.name !== 'AbortError') toast.error('Erro ao compartilhar');
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        toast.success('Copiado para a área de transferência!');
      } catch {
        toast.error('Compartilhamento não suportado neste navegador');
      }
    }
  };

  const exportToCSV = () => {
    if (!logsData?.logs || logsData.logs.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    // Helper: wrap field in quotes if it contains comma, newline or quote
    const csvField = (value: any): string => {
      const str = value !== null && value !== undefined ? String(value) : "-";
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // CSV headers
    const headers = ["Data", "Turno", "Estufa", "Temp (\u00b0C)", "RH (%)", "PPFD", "pH", "EC", "Observa\u00e7\u00f5es"];
    
    // CSV rows
    const rows = logsData.logs.map((log: any) => [
      new Date(log.logDate).toLocaleDateString("pt-BR"),
      csvField(log.turn),
      csvField(log.tentName),
      csvField(log.tempC),
      csvField(log.rhPct),
      csvField(log.ppfd),
      csvField(log.ph),
      csvField(log.ec),
      csvField(log.notes),
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(","),
      ...rows.map((row: any) => row.join(","))
    ].join("\n");

    // Create blob and download
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" }); // BOM for Excel
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `historico_cultivo_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // Free memory
    toast.success(`CSV exportado com ${logsData.logs.length} registro(s)!`);
  };

  const handlePreviousPage = () => {
    if (offset > 0) {
      setOffset(Math.max(0, offset - limit));
    }
  };

  const handleNextPage = () => {
    if (logsData?.hasMore) {
      setOffset(offset + limit);
    }
  };

  // VPD helper: kPa (declarado antes do early return para manter ordem dos hooks)
  const calcVPD = (tempC: number | null | undefined, rhPct: number | null | undefined): string | null => {
    if (tempC == null || rhPct == null) return null;
    const t = parseFloat(String(tempC));
    const rh = parseFloat(String(rhPct));
    if (isNaN(t) || isNaN(rh)) return null;
    return (0.6108 * Math.exp(17.27 * t / (t + 237.3)) * (1 - rh / 100)).toFixed(2);
  };

  // Apply client-side turn filter + sort — useMemo DEVE vir antes de qualquer early return
  const displayedLogs = useMemo(() => {
    if (!logsData?.logs) return [];
    const filtered = turnFilter === "ALL"
      ? logsData.logs
      : logsData.logs.filter((l: any) => l.turn === turnFilter);

    return [...filtered].sort((a: any, b: any) => {
      let av: number, bv: number;
      if (sortField === 'logDate') {
        av = new Date(a.logDate).getTime();
        bv = new Date(b.logDate).getTime();
      } else if (sortField === 'vpd') {
        av = parseFloat(calcVPD(a.tempC, a.rhPct) ?? '0') || 0;
        bv = parseFloat(calcVPD(b.tempC, b.rhPct) ?? '0') || 0;
      } else {
        av = parseFloat(a[sortField]) || 0;
        bv = parseFloat(b[sortField]) || 0;
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [logsData?.logs, turnFilter, sortField, sortDir]);

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = logsData?.total ? Math.ceil(logsData.total / limit) : 1;

  // Early return DEPOIS de todos os hooks
  if (tentsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader backHref="/" title="Histórico" subtitle="Carregando…" />
        <main className="container mx-auto px-4 py-8">
          <HistoryTableSkeleton count={6} />
        </main>
      </div>
    );
  }

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 inline-block" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 text-primary inline-block" />
      : <ArrowDown className="w-3 h-3 ml-1 text-primary inline-block" />;
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        backHref="/"
        title={
          <>
            <TableIcon className="w-5 h-5 text-primary shrink-0" />
            <span className="truncate">Histórico</span>
          </>
        }
        subtitle="Registros diários das estufas"
        rightActions={
          <>
            {/* Ação principal: Novo Registro (sempre visível) */}
            <Button
              size="sm"
              onClick={() => navigate("/quick-log")}
              className="h-9"
              aria-label="Novo Registro"
            >
              <ClipboardList className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Novo Registro</span>
            </Button>
            {/* Ações secundárias no desktop */}
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={!logsData?.logs || logsData.logs.length === 0}
              className="hidden md:inline-flex h-9"
            >
              <Printer className="w-4 h-4 mr-2" />Imprimir
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              disabled={!logsData?.logs || logsData.logs.length === 0}
              className="hidden md:inline-flex h-9"
            >
              <Share2 className="w-4 h-4 mr-2" />Compartilhar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={!logsData?.logs || logsData.logs.length === 0}
              className="hidden md:inline-flex h-9"
            >
              <Download className="w-4 h-4 mr-2" />Exportar
            </Button>
            {/* Ações secundárias no mobile — dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden h-9 w-9" aria-label="Mais ações">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handlePrint}
                  disabled={!logsData?.logs || logsData.logs.length === 0}
                >
                  <Printer className="w-4 h-4 mr-2" />Imprimir
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleShare}
                  disabled={!logsData?.logs || logsData.logs.length === 0}
                >
                  <Share2 className="w-4 h-4 mr-2" />Compartilhar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={exportToCSV}
                  disabled={!logsData?.logs || logsData.logs.length === 0}
                >
                  <Download className="w-4 h-4 mr-2" />Exportar CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Content */}
      <main className="container mx-auto px-4 py-8 space-y-8" id="history-table-container">
        {/* Tent Selector - Responsive: Dropdown on mobile, Tabs on desktop */}
        <div className="space-y-4 print-hide">
          {/* Mobile: Dropdown */}
          <div className="md:hidden">
            <Label htmlFor="tent-select-mobile" className="text-sm font-medium mb-2 block">
              Selecionar Estufa
            </Label>
            <Select
              value={selectedTentId?.toString() || "all"}
              onValueChange={(value) => {
                setSelectedTentId(value === "all" ? undefined : parseInt(value));
                setOffset(0);
              }}
            >
              <SelectTrigger id="tent-select-mobile" className="w-full">
                <SelectValue placeholder="Selecione uma estufa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Estufas</SelectItem>
                {tents?.map((tent) => (
                  <SelectItem key={tent.id} value={tent.id.toString()}>
                    {tent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop: Tabs with horizontal scroll for many tents */}
          <Tabs
            value={selectedTentId?.toString() || "all"}
            onValueChange={(value) => {
              setSelectedTentId(value === "all" ? undefined : parseInt(value));
              setOffset(0);
            }}
            className="hidden md:block"
          >
            <div className="relative">
              <TabsList className="inline-flex w-auto min-w-full overflow-x-auto scrollable-tabs pb-2">
                <TabsTrigger value="all" className="flex-shrink-0">Todas</TabsTrigger>
                {tents?.map((tent) => (
                  <TabsTrigger key={tent.id} value={tent.id.toString()} className="flex-shrink-0 whitespace-nowrap">
                    {tent.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
        </div>

        <Tabs value={selectedTentId?.toString() || "all"}>

          <TabsContent value={selectedTentId?.toString() || "all"} className="space-y-8">
            {/* Analytics Charts - Always visible when tent is selected */}
            {selectedTentId && logsData?.logs && logsData.logs.length > 0 && (
              <AnalyticsCharts logs={logsData.logs} />
            )}

            {/* Filtros — mobile: botão que abre Sheet; desktop: Card inline */}
            <div className="md:hidden print-hide">
              <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="w-full h-11 justify-between">
                    <span className="flex items-center gap-2">
                      <Filter className="w-4 h-4" />
                      Filtros
                      {activeFilterCount > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                          {activeFilterCount}
                        </Badge>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {period === "7" ? "7 dias"
                        : period === "30" ? "30 dias"
                        : period === "90" ? "90 dias"
                        : period === "all" ? "Todos"
                        : "Personalizado"}
                      {turnFilter !== "ALL" && ` · ${turnFilter}`}
                    </span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
                  <SheetHeader className="text-left">
                    <SheetTitle className="flex items-center gap-2">
                      <Filter className="w-5 h-5" />Filtros
                    </SheetTitle>
                    <SheetDescription>Ajuste para encontrar registros específicos</SheetDescription>
                  </SheetHeader>
                  <FiltersForm
                    turnFilter={turnFilter}
                    setTurnFilter={setTurnFilter}
                    period={period}
                    setPeriod={(v) => { setPeriod(v); setOffset(0); }}
                    limit={limit}
                    setLimit={(v) => { setLimit(v); setOffset(0); }}
                    startDate={startDate}
                    setStartDate={(v) => { setStartDate(v); setOffset(0); }}
                    endDate={endDate}
                    setEndDate={(v) => { setEndDate(v); setOffset(0); }}
                  />
                  <div className="pt-4 flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setTurnFilter("ALL");
                        setPeriod("30");
                        setLimit(50);
                        setStartDate("");
                        setEndDate("");
                        setOffset(0);
                      }}
                      disabled={activeFilterCount === 0}
                    >
                      Limpar
                    </Button>
                    <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
                      Aplicar
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            <Card className="print-hide hidden md:block">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  Filtros
                </CardTitle>
                <CardDescription>Filtre os registros por período</CardDescription>
              </CardHeader>
              <CardContent>
                <FiltersForm
                  turnFilter={turnFilter}
                  setTurnFilter={setTurnFilter}
                  period={period}
                  setPeriod={(v) => { setPeriod(v); setOffset(0); }}
                  limit={limit}
                  setLimit={(v) => { setLimit(v); setOffset(0); }}
                  startDate={startDate}
                  setStartDate={(v) => { setStartDate(v); setOffset(0); }}
                  endDate={endDate}
                  setEndDate={(v) => { setEndDate(v); setOffset(0); }}
                />
              </CardContent>
            </Card>

        {/* Table */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Registros Diários</CardTitle>
                <CardDescription>
                  {logsData?.total || 0} registro(s) encontrado(s)
                </CardDescription>
              </div>
              <Badge variant="outline">
                Página {currentPage} de {totalPages}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <HistoryTableSkeleton count={8} />
            ) : !logsData?.logs || logsData.logs.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Nenhum registro encontrado"
                description="Não há registros diários para o período selecionado. Ajuste os filtros ou comece a registrar dados das suas estufas."
                actionLabel="Registrar Dados"
                onAction={() => navigate("/daily-log")}
              />
            ) : (
              <>
                {/* Mobile Card Layout */}
                <div className="md:hidden space-y-6">
                  {displayedLogs.map((log: any) => {
                    const vpdMobile = calcVPD(log.tempC, log.rhPct);
                    return (
                    <Card key={log.id} className="overflow-hidden shadow-sm">
                      <CardHeader className="pb-4 bg-muted/30">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={log.turn === "AM" ? "default" : "secondary"} className="text-xs px-2 py-0.5">
                                {log.turn || "-"}
                              </Badge>
                              <span className="text-base font-semibold">
                                {new Date(log.logDate).toLocaleDateString("pt-BR", { 
                                  day: '2-digit', 
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground font-medium">{log.tentName || "-"}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="touch-target"
                              onClick={() => setEditingLog(log)}
                              title="Editar registro"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="touch-target text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeletingLogId(log.id)}
                              title="Excluir registro"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Temperatura</p>
                            <p className="text-lg font-semibold">{log.tempC ? `${log.tempC}°C` : "-"}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Umidade</p>
                            <p className="text-lg font-semibold">{log.rhPct ? `${log.rhPct}%` : "-"}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">PPFD</p>
                            <p className="text-lg font-semibold">{log.ppfd || "-"}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">pH</p>
                            <p className="text-lg font-semibold">{log.ph || "-"}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">EC</p>
                            <p className="text-lg font-semibold">{log.ec || "-"}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">VPD (kPa)</p>
                            <p className="text-lg font-semibold font-mono">{vpdMobile ?? "-"}</p>
                          </div>
                        </div>
                        {log.notes && (
                          <div className="mt-4 pt-4 border-t">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Observações</p>
                            <p className="text-sm leading-relaxed">{log.notes}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>

                {/* Desktop Table Layout */}
                <div className="hidden md:block overflow-x-auto">
                  <Table className="min-w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="whitespace-nowrap cursor-pointer select-none hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('logDate')}
                        >
                          <span className="flex items-center">Data <SortIcon field="logDate" /></span>
                        </TableHead>
                        <TableHead className="whitespace-nowrap">Turno</TableHead>
                        <TableHead className="whitespace-nowrap">Estufa</TableHead>
                        <TableHead
                          className="text-right whitespace-nowrap cursor-pointer select-none hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('tempC')}
                        >
                          <span className="flex items-center justify-end">Temp (°C) <SortIcon field="tempC" /></span>
                        </TableHead>
                        <TableHead
                          className="text-right whitespace-nowrap cursor-pointer select-none hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('rhPct')}
                        >
                          <span className="flex items-center justify-end">RH (%) <SortIcon field="rhPct" /></span>
                        </TableHead>
                        <TableHead
                          className="text-right whitespace-nowrap cursor-pointer select-none hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('ppfd')}
                        >
                          <span className="flex items-center justify-end">PPFD <SortIcon field="ppfd" /></span>
                        </TableHead>
                        <TableHead
                          className="text-right whitespace-nowrap cursor-pointer select-none hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('ph')}
                        >
                          <span className="flex items-center justify-end">pH <SortIcon field="ph" /></span>
                        </TableHead>
                        <TableHead
                          className="text-right whitespace-nowrap cursor-pointer select-none hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('ec')}
                        >
                          <span className="flex items-center justify-end">EC <SortIcon field="ec" /></span>
                        </TableHead>
                        <TableHead
                          className="text-right whitespace-nowrap hidden lg:table-cell cursor-pointer select-none hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('vpd')}
                        >
                          <span className="flex items-center justify-end">VPD (kPa) <SortIcon field="vpd" /></span>
                        </TableHead>
                        <TableHead className="whitespace-nowrap hidden md:table-cell">Observações</TableHead>
                        <TableHead className="text-right whitespace-nowrap print-hide">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedLogs.map((log: any) => {
                        const vpd = calcVPD(log.tempC, log.rhPct);
                        return (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium">
                            {new Date(log.logDate).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell>
                            <Badge variant={log.turn === "AM" ? "default" : "secondary"}>
                              {log.turn || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell>{log.tentName || "-"}</TableCell>
                          <TableCell className="text-right">{log.tempC || "-"}</TableCell>
                          <TableCell className="text-right">{log.rhPct || "-"}</TableCell>
                          <TableCell className="text-right">{log.ppfd || "-"}</TableCell>
                          <TableCell className="text-right">{log.ph || "-"}</TableCell>
                          <TableCell className="text-right">{log.ec || "-"}</TableCell>
                          <TableCell className="text-right hidden lg:table-cell font-mono text-xs">
                            {vpd ?? "-"}
                          </TableCell>
                          <TableCell className="max-w-xs truncate hidden md:table-cell" title={log.notes || ""}>
                            {log.notes || "-"}
                          </TableCell>
                          <TableCell className="text-right print-hide">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingLog(log)}
                                title="Editar registro"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeletingLogId(log.id)}
                                title="Excluir registro"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-6 print-hide">
                  <Button
                    variant="outline"
                    onClick={handlePreviousPage}
                    disabled={offset === 0}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Mostrando {offset + 1} - {Math.min(offset + limit, logsData.total || 0)} de {logsData.total || 0}
                  </span>
                  <Button
                    variant="outline"
                    onClick={handleNextPage}
                    disabled={!logsData.hasMore}
                  >
                    Próxima
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Edit Dialog */}
      <EditLogDialog
        log={editingLog}
        open={!!editingLog}
        onOpenChange={(open) => !open && setEditingLog(null)}
        onSuccess={handleEditSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingLogId} onOpenChange={(open) => !open && setDeletingLogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface FiltersFormProps {
  turnFilter: "AM" | "PM" | "ALL";
  setTurnFilter: (v: "AM" | "PM" | "ALL") => void;
  period: string;
  setPeriod: (v: string) => void;
  limit: number;
  setLimit: (v: number) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
}

function FiltersForm({
  turnFilter,
  setTurnFilter,
  period,
  setPeriod,
  limit,
  setLimit,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: FiltersFormProps) {
  return (
    <div className="space-y-4 pt-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Turn Filter */}
        <div className="space-y-2 md:col-span-2">
          <Label>Turno</Label>
          <div className="flex gap-2">
            {(["ALL", "AM", "PM"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTurnFilter(t)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  turnFilter === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {t === "ALL" ? "Todos" : t === "AM" ? "Manhã (AM)" : "Tarde (PM)"}
              </button>
            ))}
          </div>
        </div>

        {/* Period Filter */}
        <div className="space-y-2">
          <Label htmlFor="period-filter">Período</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger id="period-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="all">Todos os registros</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Items per page */}
        <div className="space-y-2">
          <Label htmlFor="limit-filter">Registros por página</Label>
          <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v))}>
            <SelectTrigger id="limit-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Custom Date Range */}
      {period === "custom" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="start-date">Data Inicial</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date">Data Final</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
