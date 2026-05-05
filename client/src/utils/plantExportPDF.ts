// Pure utility — opens a print window with plant health report

interface PlantExportParams {
  plant: { name: string; code?: string | null; status?: string | null; plantStage?: string | null; cycleWeek?: number | null; createdAt: string | Date };
  strain?: { name: string } | null;
  tent?: { name: string } | null;
  healthLogs?: any[];
}

export function exportPlantPDF({ plant, strain, tent, healthLogs = [] }: PlantExportParams) {
  const generatedAt = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const healthRows = healthLogs.slice(0, 50).map((l: any) => `
    <tr>
      <td>${new Date(l.logDate ?? l.createdAt).toLocaleDateString("pt-BR")}</td>
      <td>${l.symptoms ?? '—'}</td>
      <td>${l.treatment ?? '—'}</td>
      <td>${l.notes ?? '—'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Planta — ${plant.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; padding: 32px; font-size: 13px; }
    .header { border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header h1 { font-size: 22px; font-weight: 700; }
    .header .sub { font-size: 12px; color: #666; margin-top: 4px; }
    .header-right { font-size: 11px; color: #888; text-align: right; line-height: 1.7; }
    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .info-cell { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
    .info-cell .lbl { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
    .info-cell .val { font-size: 14px; font-weight: 600; margin-top: 3px; }
    h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; margin: 20px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f9fafb; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
    td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; color: #374151; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #bbb; display: flex; justify-content: space-between; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>🌿 ${plant.name}</h1>
      <div class="sub">${plant.code ? `Código: ${plant.code}` : ''} ${strain ? `· Strain: ${strain.name}` : ''}</div>
    </div>
    <div class="header-right">
      <div>${tent ? `Estufa: ${tent.name}` : ''}</div>
      <div>Gerado em ${generatedAt}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-cell"><div class="lbl">Estágio</div><div class="val">${plant.plantStage === 'PLANT' ? 'Planta' : plant.plantStage === 'SEEDLING' ? 'Muda' : plant.plantStage}</div></div>
    <div class="info-cell"><div class="lbl">Semana do Ciclo</div><div class="val">${plant.cycleWeek != null ? `Semana ${plant.cycleWeek}` : '—'}</div></div>
    <div class="info-cell"><div class="lbl">Status</div><div class="val">${plant.status ?? '—'}</div></div>
    <div class="info-cell"><div class="lbl">Observações de Saúde</div><div class="val">${healthLogs.length}</div></div>
  </div>

  ${healthLogs.length > 0 ? `
  <h2>Histórico de Saúde (últimos ${Math.min(healthLogs.length, 50)})</h2>
  <table>
    <thead><tr><th>Data</th><th>Sintomas</th><th>Tratamento</th><th>Notas</th></tr></thead>
    <tbody>${healthRows}</tbody>
  </table>` : ''}

  <div class="footer">
    <span>App Cultivo &nbsp;·&nbsp; ${window.location.origin}</span>
    <span>${plant.name} &nbsp;·&nbsp; ${generatedAt}</span>
  </div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { return false; }
  win.document.write(html);
  win.document.close();
  return true;
}
