/**
 * Reminders — gerenciar lembretes locais (mobile-only).
 *
 * Cria, lista e cancela notificações locais que dispara mesmo offline.
 * Storage adicional em Preferences pra ter metadata (label + hora) — o plugin
 * Capacitor não retorna isso de forma confiável após reload da app.
 *
 * Limites:
 *  - iOS: máximo 64 notificações pendentes. Avisamos quando passar de 50.
 *  - Android: sem limite prático
 *
 * Por que não em web?
 *  - Web Push exige permissão + servidor VAPID + service worker
 *  - Já temos NotificationSettings.tsx pra web push
 *  - Local notifications nativas não funcionam em web (não tem API)
 */

import { useEffect, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import { Bell, BellOff, Plus, Trash2, Droplets, Clock, Repeat, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { isNative } from "@/lib/platform";
import { haptics } from "@/lib/haptics";
import {
  scheduleLocalNotification,
  cancelLocalNotifications,
  checkNotificationPermission,
  requestNotificationPermission,
  type RepeatInterval,
} from "@/lib/localNotifications";

const STORAGE_KEY = "cultivo_reminders_v1";

interface StoredReminder {
  id: number;
  title: string;
  body: string;
  hour: number;          // 0-23
  minute: number;        // 0-59
  repeat: RepeatInterval;
  createdAt: number;
}

const PRESETS: { title: string; body: string; icon: React.ElementType; color: string }[] = [
  {
    title: "Regar plantas",
    body: "Hora de checar a umidade e regar se precisar 🌱",
    icon: Droplets,
    color: "#60a5fa",
  },
  {
    title: "Check matinal",
    body: "Bom dia! Hora de registrar temp, umidade e pH",
    icon: Clock,
    color: "#fbbf24",
  },
  {
    title: "Trocar água do reservatório",
    body: "Reservatório precisa de atenção — checa nível e pH",
    icon: Repeat,
    color: "#a78bfa",
  },
];

async function loadReminders(): Promise<StoredReminder[]> {
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (!value) return [];
    return JSON.parse(value) as StoredReminder[];
  } catch {
    return [];
  }
}

async function saveReminders(reminders: StoredReminder[]): Promise<void> {
  try {
    await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(reminders) });
  } catch {
    /* falha silenciosa — perde só persistência cross-reinstall */
  }
}

function computeNextAt(hour: number, minute: number): Date {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  // Se já passou hoje, agenda pra amanhã
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export default function Reminders() {
  const [reminders, setReminders] = useState<StoredReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<"granted" | "denied" | "prompt">("prompt");
  const [addOpen, setAddOpen] = useState(false);

  // Formulário do dialog
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [repeat, setRepeat] = useState<RepeatInterval>("daily");

  // Carrega lembretes salvos + verifica permissão
  useEffect(() => {
    (async () => {
      const [stored, perm] = await Promise.all([
        loadReminders(),
        checkNotificationPermission(),
      ]);
      setReminders(stored);
      setPermission(perm);
      setLoading(false);
    })();
  }, []);

  const handleRequestPermission = async () => {
    await haptics.light();
    const granted = await requestNotificationPermission();
    setPermission(granted ? "granted" : "denied");
    if (!granted) {
      toast.error("Permissão negada. Habilite em Ajustes do iOS/Android.");
    }
  };

  const openAddDialog = (preset?: typeof PRESETS[0]) => {
    haptics.light();
    if (preset) {
      setTitle(preset.title);
      setBody(preset.body);
    } else {
      setTitle("");
      setBody("");
    }
    setHour(8);
    setMinute(0);
    setRepeat("daily");
    setAddOpen(true);
  };

  const handleAddReminder = async () => {
    if (!title.trim() || !body.trim()) {
      haptics.warning();
      toast.error("Preencha título e mensagem.");
      return;
    }
    if (reminders.length >= 50) {
      haptics.warning();
      toast.error("Limite de 50 lembretes atingido. Apague um pra criar outro.");
      return;
    }

    await haptics.medium();

    const id = Date.now();
    const at = computeNextAt(hour, minute);

    const ok = await scheduleLocalNotification({
      id,
      title: title.trim(),
      body: body.trim(),
      at,
      repeat,
      extra: { type: "reminder", createdAt: id },
    });

    if (!ok) {
      haptics.error();
      toast.error("Não foi possível agendar. Permissão concedida?");
      return;
    }

    const newReminder: StoredReminder = {
      id,
      title: title.trim(),
      body: body.trim(),
      hour,
      minute,
      repeat,
      createdAt: id,
    };

    const updated = [...reminders, newReminder];
    setReminders(updated);
    await saveReminders(updated);

    haptics.success();
    toast.success(`Lembrete criado pra ${formatTime(hour, minute)} (${formatRepeat(repeat)})`);
    setAddOpen(false);
  };

  const handleDelete = async (id: number) => {
    await haptics.medium();
    await cancelLocalNotifications([id]);
    const updated = reminders.filter((r) => r.id !== id);
    setReminders(updated);
    await saveReminders(updated);
    toast.success("Lembrete apagado.");
  };

  // Bloqueio gracioso quando rodando em web
  if (!isNative()) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-background">
          <PageHeader backHref="/settings" title="Lembretes" />
          <main className="container mx-auto px-4 py-12 max-w-md">
            <EmptyState
              icon={Bell}
              title="Disponível no app mobile"
              description="Lembretes locais funcionam apenas no app iOS/Android. No navegador, use a tela de Notificações para alertas push do servidor."
              variant="compact"
              accent="neutral"
              action={{ label: "Ir para Notificações", href: "/settings/notifications", variant: "outline" }}
            />
          </main>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        <PageHeader backHref="/settings" title="Lembretes" />

        <main className="container mx-auto px-4 py-6 max-w-2xl">
          {loading ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Carregando...</div>
          ) : permission === "denied" ? (
            <EmptyState
              icon={BellOff}
              title="Permissão negada"
              description="Pra criar lembretes, libere notificações em Ajustes do dispositivo."
              variant="compact"
              accent="amber"
              action={{ label: "Tentar habilitar", onClick: handleRequestPermission, variant: "outline" }}
            />
          ) : permission === "prompt" ? (
            <EmptyState
              icon={Bell}
              title="Habilitar notificações"
              description="Agende lembretes que disparam mesmo com o app fechado."
              variant="compact"
              accent="primary"
              action={{ label: "Habilitar", onClick: handleRequestPermission }}
            />
          ) : (
            <div className="space-y-6">
              {/* Lista de lembretes */}
              {reminders.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="Nenhum lembrete ainda"
                  description="Use os presets abaixo pra criar um em poucos toques — rega, check matinal, troca de água."
                  variant="compact"
                />
              ) : (
                <div className="space-y-2">
                  {reminders.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Bell className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.body}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(r.hour, r.minute)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Repeat className="w-3 h-3" />
                            {formatRepeat(r.repeat)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                        aria-label="Apagar lembrete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Aviso de limite */}
              {reminders.length >= 50 && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-200">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Limite de 50 lembretes atingido (iOS suporta no máx. 64).</span>
                </div>
              )}

              {/* Presets pra criar rapidamente */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  Adicionar lembrete
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {PRESETS.map((preset) => {
                    const Icon = preset.icon;
                    return (
                      <button
                        key={preset.title}
                        type="button"
                        onClick={() => openAddDialog(preset)}
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-border bg-card hover:bg-muted/50 active:scale-[0.98] transition-all text-left"
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${preset.color}20` }}
                        >
                          <Icon className="w-4 h-4" style={{ color: preset.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{preset.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{preset.body}</p>
                        </div>
                        <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openAddDialog()}
                  className="w-full mt-3"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Criar lembrete personalizado
                </Button>
              </div>
            </div>
          )}
        </main>

        {/* Dialog de criar/editar */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Novo lembrete</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs">Título</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Regar plantas"
                  maxLength={80}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Mensagem</Label>
                <Input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hora de checar o cultivo"
                  maxLength={140}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Hora</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={hour}
                    onChange={(e) => setHour(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Minuto</Label>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={minute}
                    onChange={(e) => setMinute(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Repetir</Label>
                <Select value={repeat} onValueChange={(v) => setRepeat(v as RepeatInterval)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Todo dia</SelectItem>
                    <SelectItem value="weekly">Toda semana</SelectItem>
                    <SelectItem value="monthly">Todo mês</SelectItem>
                    <SelectItem value="never">Apenas uma vez</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="text-xs text-muted-foreground">
                Próximo disparo: <strong className="text-foreground">{formatTime(hour, minute)}</strong>
                {repeat !== "never" && ` (${formatRepeat(repeat).toLowerCase()})`}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddReminder}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}

function formatTime(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function formatRepeat(r: RepeatInterval): string {
  if (r === "daily") return "Todo dia";
  if (r === "weekly") return "Toda semana";
  if (r === "monthly") return "Todo mês";
  return "Uma vez";
}
