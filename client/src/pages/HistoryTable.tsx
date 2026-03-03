import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download, Calendar, Filter, Table as TableIcon, Pencil, Trash2, FileDown, ClipboardList } from "lucide-react";
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
      
      let timeoutId: NodeJS.Timeout | null = null;
      
      // Show toast with undo button
      toast.info("Registro será excluído em 5 segundos", {
        duration: 5000,
        action: {
          label: "Desfazer",
          onClick: () => {
            if (timeoutId) clearTimeout(timeoutId);
            toast.success("Exclusão cancelada!");
          },
        },
      });
      
      // Schedule deletion after 5 seconds
      timeoutId = setTimeout(() => {
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

  if (tentsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = logsData?.total ? Math.ceil(logsData.total / limit) : 1;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <TableIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Histórico de Registros</h1>
                <p className="text-sm text-muted-foreground">Visualize e exporte todos os registros diários</p>
              </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <Button variant="default" onClick={() => navigate("/tent-log")} className="flex-1 md:flex-none">
                <ClipboardList className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Novo Registro</span>
              </Button>
              <Button variant="outline" onClick={handlePrint} disabled={!logsData?.logs || logsData.logs.length === 0} className="flex-1 md:flex-none">
                <Printer className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Imprimir</span>
              </Button>
              <Button onClick={exportToCSV} disabled={!logsData?.logs || logsData.logs.length === 0} className="flex-1 md:flex-none">
                <Download className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Exportar CSV</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

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

            {/* Filters and Table */}
            <Card className="print-hide">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  Filtros
                </CardTitle>
                <CardDescription>Filtre os registros por período</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Period Filter */}
              <div className="space-y-2">
                <Label htmlFor="period-filter">Período</Label>
                <Select
                  value={period}
                  onValueChange={(value) => {
                    setPeriod(value);
                    setOffset(0);
                  }}
                >
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
                <Select
                  value={limit.toString()}
                  onValueChange={(value) => {
                    setLimit(parseInt(value));
                    setOffset(0);
                  }}
                >
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Data Inicial</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setOffset(0);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">Data Final</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setOffset(0);
                    }}
                  />
                </div>
              </div>
            )}
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
                  {logsData.logs.map((log: any) => (
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
                          <div className="space-y-1 col-span-2">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">EC</p>
                            <p className="text-lg font-semibold">{log.ec || "-"}</p>
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
                  ))}
                </div>

                {/* Desktop Table Layout */}
                <div className="hidden md:block overflow-x-auto">
                  <Table className="min-w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Data</TableHead>
                        <TableHead className="whitespace-nowrap">Turno</TableHead>
                        <TableHead className="whitespace-nowrap">Estufa</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Temp<br className="md:hidden"/><span className="hidden md:inline"> (°C)</span></TableHead>
                        <TableHead className="text-right whitespace-nowrap">RH<br className="md:hidden"/><span className="hidden md:inline"> (%)</span></TableHead>
                        <TableHead className="text-right whitespace-nowrap">PPFD</TableHead>
                        <TableHead className="text-right whitespace-nowrap">pH</TableHead>
                        <TableHead className="text-right whitespace-nowrap">EC</TableHead>
                        <TableHead className="whitespace-nowrap hidden md:table-cell">Observações</TableHead>
                        <TableHead className="text-right whitespace-nowrap print-hide">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logsData.logs.map((log: any) => (
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
                      ))}
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
