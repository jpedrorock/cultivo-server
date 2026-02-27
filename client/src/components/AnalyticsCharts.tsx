import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, Droplets, Sun, FlaskConical } from "lucide-react";

interface LogData {
  id: number;
  logDate: string;
  turn: string;
  tentName: string;
  tempC: number | null;
  rhPct: number | null;
  ppfd: number | null;
  ph: number | null;
  ec: number | null;
}

interface AnalyticsChartsProps {
  logs: LogData[];
}

export function AnalyticsCharts({ logs }: AnalyticsChartsProps) {
  // Preparar dados para os gráficos
  const chartData = logs
    .filter(log => log.tempC !== null || log.rhPct !== null || log.ppfd !== null)
    .filter(log => log.logDate && !isNaN(new Date(log.logDate).getTime())) // Filter out invalid dates
    .map(log => {
      const logDate = new Date(log.logDate);
      return {
        date: format(logDate, 'dd/MM', { locale: ptBR }),
        fullDate: format(logDate, 'dd/MM/yyyy', { locale: ptBR }),
        shift: log.turn === 'AM' ? 'Manhã' : 'Tarde',
        tent: log.tentName,
        temp: log.tempC,
        rh: log.rhPct,
        ppfd: log.ppfd,
        ph: log.ph,
        ec: log.ec,
      };
    })
    .reverse(); // Mais antigo primeiro para melhor visualização

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold text-sm">{data.fullDate} - {data.shift}</p>
          <p className="text-xs text-muted-foreground mb-2">{data.tent}</p>
          {payload.map((entry: any, index: number) => {
            const value = entry.value;
            const formattedValue = value !== null && typeof value === 'number' ? value.toFixed(1) : 'N/A';
            return (
              <p key={index} className="text-sm" style={{ color: entry.color }}>
                {entry.name}: {formattedValue}
              </p>
            );
          })}
        </div>
      );
    }
    return null;
  };

  const hasTemperatureData = chartData.some(d => d.temp !== null);
  const hasHumidityData = chartData.some(d => d.rh !== null);
  const hasPPFDData = chartData.some(d => d.ppfd !== null);
  const hasPHData = chartData.some(d => d.ph !== null);
  const hasECData = chartData.some(d => d.ec !== null);

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h2 className="text-2xl font-bold">Análise de Dados</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Temperatura */}
        {hasTemperatureData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-red-500" />
                Temperatura
              </CardTitle>
              <CardDescription>Evolução da temperatura ao longo do tempo</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis domain={['dataMin - 2', 'dataMax + 2']} className="text-xs" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="temp" 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Temp (°C)"
                    connectNulls
                    animationDuration={800}
                    animationBegin={0}
                    animationEasing="ease-out"
                  />
                  <Brush dataKey="date" height={30} stroke="#ef4444" fill="transparent" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Umidade Relativa */}
        {hasHumidityData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="w-5 h-5 text-blue-500" />
                Umidade Relativa
              </CardTitle>
              <CardDescription>Evolução da umidade ao longo do tempo</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis domain={[0, 100]} className="text-xs" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="rh" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="RH (%)"
                    connectNulls
                    animationDuration={800}
                    animationBegin={0}
                    animationEasing="ease-out"
                  />
                  <Brush dataKey="date" height={30} stroke="#3b82f6" fill="transparent" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* PPFD */}
        {hasPPFDData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sun className="w-5 h-5 text-yellow-500" />
                PPFD (Intensidade de Luz)
              </CardTitle>
              <CardDescription>Evolução do PPFD ao longo do tempo</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis domain={['dataMin - 50', 'dataMax + 50']} className="text-xs" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="ppfd" 
                    stroke="#eab308" 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="PPFD (μmol/m²/s)"
                    connectNulls
                    animationDuration={800}
                    animationBegin={0}
                    animationEasing="ease-out"
                  />
                  <Brush dataKey="date" height={30} stroke="#eab308" fill="transparent" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* pH e EC */}
        {(hasPHData || hasECData) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-purple-500" />
                pH e EC
              </CardTitle>
              <CardDescription>Evolução do pH e EC ao longo do tempo</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis yAxisId="left" domain={[0, 14]} className="text-xs" />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 'dataMax + 0.5']} className="text-xs" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  {hasPHData && (
                    <Line 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="ph" 
                      stroke="#22c55e" 
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      name="pH"
                      connectNulls
                      animationDuration={800}
                      animationBegin={0}
                      animationEasing="ease-out"
                    />
                  )}
                  {hasECData && (
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="ec" 
                      stroke="#a855f7" 
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      name="EC (mS/cm)"
                      connectNulls
                      animationDuration={800}
                      animationBegin={100}
                      animationEasing="ease-out"
                    />
                  )}
                  <Brush dataKey="date" height={30} stroke="#a855f7" fill="transparent" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
