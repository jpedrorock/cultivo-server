import { useState, useRef, useEffect } from 'react';
import { useRoute, useLocation, Link } from 'wouter';
import { ArrowLeft, Bot, Send, ImagePlus, X, Leaf, AlertCircle, Trash2, Sparkles, ChevronRight, Images } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PageTransition } from '@/components/PageTransition';
import { TentIcon } from '@/components/TentIcon';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imagePreview?: string;
}

// ─── Quick suggestions ────────────────────────────────────────────────────────

const QUICK_CHIPS = [
  'O que está errado com essa planta?',
  'Quando devo colher? (foto dos tricomas)',
  'Como faço LST nessa fase?',
  'Minhas condições ambientais estão boas?',
  'Qual nutrição indicar nessa semana?',
];

// ─── Simple markdown renderer ─────────────────────────────────────────────────

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const parsed = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        if (/^[-•*]\s/.test(line)) {
          return (
            <div key={i} className="flex gap-1.5">
              <span className="shrink-0 mt-0.5 text-emerald-500">•</span>
              <span dangerouslySetInnerHTML={{ __html: parsed.replace(/^[-•*]\s/, '') }} />
            </div>
          );
        }
        if (/^#{1,3}\s/.test(line)) {
          return <p key={i} className="font-semibold mt-1" dangerouslySetInnerHTML={{ __html: parsed.replace(/^#{1,3}\s/, '') }} />;
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i} dangerouslySetInnerHTML={{ __html: parsed }} />;
      })}
    </div>
  );
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
          <Bot className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
          isUser
            ? 'bg-emerald-600 text-white rounded-tr-sm'
            : 'bg-card border border-border text-foreground rounded-tl-sm'
        }`}
      >
        {msg.imagePreview && (
          <img src={msg.imagePreview} alt="foto" className="rounded-lg mb-2 max-h-48 object-cover w-full" />
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <SimpleMarkdown text={msg.content} />
        )}
      </div>
    </div>
  );
}

// ─── Loading bubble ───────────────────────────────────────────────────────────

function LoadingBubble() {
  return (
    <div className="flex justify-start mb-3">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── History skeleton ─────────────────────────────────────────────────────────

function HistorySkeleton() {
  return (
    <>
      {[{ w: '60%', user: false }, { w: '45%', user: true }, { w: '70%', user: false }].map((s, i) => (
        <div key={i} className={`flex ${s.user ? 'justify-end' : 'justify-start'} mb-3`}>
          {!s.user && <div className="w-7 h-7 rounded-full bg-muted shrink-0 mr-2 animate-pulse" />}
          <div className="rounded-2xl bg-muted animate-pulse" style={{ width: s.w, height: 36 }} />
        </div>
      ))}
    </>
  );
}

// ─── Plant context bar ────────────────────────────────────────────────────────

function PlantContextBar({
  plant,
  onPress,
}: {
  plant: any;
  onPress: () => void;
}) {
  if (plant) {
    const stage =
      plant.plantStage === 'CLONE' ? 'Clone' :
      plant.plantStage === 'SEEDLING' ? 'Seedling' :
      plant.plantStage === 'VEGETATION' ? 'Vegetativa' :
      plant.plantStage === 'FLOWERING' ? 'Flora' : 'Planta';

    return (
      <button
        onClick={onPress}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-emerald-500/8 border-b border-emerald-500/15 hover:bg-emerald-500/12 active:bg-emerald-500/15 transition-colors"
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 text-white font-bold text-sm shadow-sm shadow-emerald-500/20">
          {plant.name.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground truncate">{plant.name}</p>
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20">
              {stage}
            </span>
          </div>
          <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/60 mt-0.5">
            Contexto enviado automaticamente para a IA
          </p>
        </div>

        {/* Trocar */}
        <div className="shrink-0 flex items-center gap-1 text-emerald-600/60 dark:text-emerald-400/60">
          <span className="text-[11px] font-medium">Trocar</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </button>
    );
  }

  // No plant selected
  return (
    <button
      onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-2.5 bg-muted/40 border-b border-dashed border-border hover:bg-muted/60 hover:border-emerald-500/30 transition-colors"
    >
      <div className="w-9 h-9 rounded-xl bg-muted border border-dashed border-border flex items-center justify-center shrink-0">
        <Leaf className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 text-left">
        <p className="text-sm font-medium text-foreground">Selecionar planta</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">A IA receberá dados de ambiente, saúde e fase</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

// ─── Plant gallery sheet ──────────────────────────────────────────────────────

function PlantGallerySheet({
  open,
  onClose,
  plantId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  plantId: number;
  onSelect: (base64: string, mime: 'image/jpeg' | 'image/png' | 'image/webp', preview: string) => void;
}) {
  const { data: photos = [], isLoading } = trpc.plantPhotos.list.useQuery(
    { plantId },
    { enabled: open },
  );
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);

  const handlePickPhoto = async (photoUrl: string) => {
    try {
      setLoadingUrl(photoUrl);
      const fullUrl = photoUrl.startsWith('http') ? photoUrl : `${window.location.origin}${photoUrl}`;
      const res = await fetch(fullUrl);
      const blob = await res.blob();
      const mime = (blob.type as 'image/jpeg' | 'image/png' | 'image/webp') || 'image/jpeg';
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(',')[1];
        onSelect(base64, mime, dataUrl);
        onClose();
      };
      reader.readAsDataURL(blob);
    } catch {
      toast.error('Não foi possível carregar a foto');
    } finally {
      setLoadingUrl(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl h-[70vh] flex flex-col" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
        <p className="font-semibold text-sm mb-1 shrink-0">Fotos salvas da planta</p>
        <p className="text-xs text-muted-foreground mb-3 shrink-0">Toque numa foto para enviar para análise da IA</p>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="grid grid-cols-3 gap-1.5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && photos.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
              <Images className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma foto salva para esta planta</p>
            </div>
          )}

          {!isLoading && photos.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {photos.map((photo: any) => (
                <button
                  key={photo.id}
                  onClick={() => handlePickPhoto(photo.photoUrl)}
                  disabled={loadingUrl === photo.photoUrl}
                  className="relative aspect-square rounded-xl overflow-hidden border border-border/40 active:scale-95 transition-transform disabled:opacity-50"
                >
                  <img
                    src={`/api/upload/thumbnail?url=${encodeURIComponent(photo.photoUrl)}&w=200&h=200&q=70`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {loadingUrl === photo.photoUrl && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {photo.source === 'health' && (
                    <span className="absolute bottom-1 left-1 text-[9px] px-1 py-0.5 rounded bg-amber-500/80 text-white font-medium">saúde</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Plant picker sheet ───────────────────────────────────────────────────────

// Gradients por letra para dar personalidade aos avatares
const AVATAR_GRADIENTS = [
  'from-emerald-500 to-teal-600',
  'from-blue-500 to-indigo-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
];
function avatarGradient(name: string) {
  return AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];
}

function PlantPickerSheet({
  open,
  onClose,
  onSelect,
  currentPlantId,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (plant: { id: number; name: string }) => void;
  currentPlantId: number | null;
}) {
  const { data: plants = [] } = trpc.plants.list.useQuery({});
  const { data: tents = [] } = trpc.tents.list.useQuery(undefined, { enabled: open });
  const tentMap = Object.fromEntries((tents as any[]).map((t: any) => [t.id, t.name]));
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);

  // Reset step when sheet closes
  useEffect(() => { if (!open) setSelectedGroupKey(null); }, [open]);

  // Build groups
  const groups: { key: string; tentName: string; plants: any[] }[] = [];
  const seen = new Map<string, number>();
  for (const p of plants as any[]) {
    const key = p.currentTentId ? String(p.currentTentId) : '__sem__';
    const tentName = p.currentTentId ? (tentMap[p.currentTentId] ?? `Estufa ${p.currentTentId}`) : 'Sem estufa';
    if (!seen.has(key)) { seen.set(key, groups.length); groups.push({ key, tentName, plants: [] }); }
    groups[seen.get(key)!].plants.push(p);
  }

  // If only one tent, skip straight to plants
  const activeGroup = selectedGroupKey
    ? groups.find(g => g.key === selectedGroupKey) ?? null
    : groups.length === 1 ? groups[0] : null;

  const stageLabel = (s: string) =>
    s === 'CLONE' ? 'Clone' : s === 'SEEDLING' ? 'Seedling' :
    s === 'VEGETATION' ? 'Vegetativa' : s === 'FLOWERING' ? 'Flora' : 'Planta';

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl flex flex-col px-5 pt-6"
        style={{ maxHeight: '75vh', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="shrink-0 mb-5">
          {activeGroup && groups.length > 1 ? (
            <button
              onClick={() => setSelectedGroupKey(null)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-4 hover:text-foreground transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              Todas as estufas
            </button>
          ) : null}

          {activeGroup ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <TentIcon className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-bold text-base leading-tight">{activeGroup.tentName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeGroup.plants.length} planta{activeGroup.plants.length !== 1 ? 's' : ''} — toque para selecionar
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="font-bold text-base">Conversar sobre qual planta?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Escolha a estufa</p>
            </div>
          )}
        </div>

        {plants.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Nenhuma planta ativa.</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {/* ── Step 1: tent list ── */}
          {!activeGroup && (
            <div className="space-y-2">
              {groups.map(group => (
                <button
                  key={group.key}
                  onClick={() => setSelectedGroupKey(group.key)}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl border border-border/50 hover:border-emerald-500/30 hover:bg-muted/50 active:scale-[0.98] transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <TentIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{group.tentName}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{group.plants.length} planta{group.plants.length !== 1 ? 's' : ''}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground/40 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* ── Step 2: plants list ── */}
          {activeGroup && (
            <div className="space-y-1">
              {activeGroup.plants.map((p: any) => {
                const isCurrent = p.id === currentPlantId;
                const letter = (p.name ?? '?')[0].toUpperCase();
                const grad = avatarGradient(p.name);
                return (
                  <button
                    key={p.id}
                    onClick={() => { onSelect(p); onClose(); }}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl active:scale-[0.98] transition-all text-left ${
                      isCurrent ? 'bg-emerald-500/10 hover:bg-emerald-500/15' : 'hover:bg-muted/60'
                    }`}
                  >
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm`}>
                      {letter}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{stageLabel(p.plantStage ?? '')}{p.strain?.name ? ` · ${p.strain.name}` : ''}</p>
                    </div>
                    {isCurrent
                      ? <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-white font-bold">ATUAL</span>
                      : <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlantChat() {
  const [, params] = useRoute('/chat/:plantId');
  const [, navigate] = useLocation();

  const initialPlantId = params?.plantId ? parseInt(params.plantId, 10) : null;

  const [plantId, setPlantId] = useState<number | null>(initialPlantId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [imageBase64, setImageBase64] = useState<string | undefined>();
  const [imageMime, setImageMime] = useState<'image/jpeg' | 'image/png' | 'image/webp' | undefined>();
  const [imagePreview, setImagePreview] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: aiSettings } = trpc.aiChat.getSettings.useQuery();
  const { data: plant } = trpc.plants.getById.useQuery({ id: plantId! }, { enabled: !!plantId });

  const { data: serverHistory = [], isLoading: historyLoading } = trpc.aiChat.getHistory.useQuery(
    { plantId: plantId ?? undefined },
  );

  useEffect(() => {
    // Ao trocar de planta: limpa enquanto carrega para não mostrar histórico errado
    if (historyLoading) {
      setMessages([]);
    } else {
      setMessages(
        serverHistory.map((m: any) => ({
          id: m.createdAt instanceof Date ? m.createdAt.getTime().toString() : String(m.createdAt),
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
      );
    }
  }, [historyLoading, serverHistory]);

  const utils = trpc.useUtils();

  const clearHistory = trpc.aiChat.clearHistory.useMutation({
    onSuccess: () => {
      setMessages([]);
      setConfirmClear(false);
      utils.aiChat.getHistory.invalidate({ plantId: plantId ?? undefined });
      toast.success('Conversa apagada');
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const sendMessage = trpc.aiChat.sendMessage.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: data.reply }]);
      setLoading(false);
    },
    onError: (e) => {
      toast.error(`Erro: ${e.message}`);
      setLoading(false);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSelectPlant = (p: { id: number; name: string }) => {
    setPlantId(p.id);
    navigate(`/chat/${p.id}`, { replace: true });
  };

  const handleImage = (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Use jpeg, png ou webp');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      setImageBase64(base64);
      setImageMime(file.type as any);
      setImagePreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text && !imageBase64) return;
    if (loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text || '(foto)',
      imagePreview,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setImageBase64(undefined);
    setImageMime(undefined);
    setImagePreview(undefined);
    setLoading(true);

    sendMessage.mutate({
      message: text || 'Analise essa foto.',
      plantId: plantId ?? undefined,
      imageBase64,
      imageMime,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const noKey = aiSettings && !aiSettings.hasKey;
  const hasMessages = messages.length > 0;

  return (
    <PageTransition>
      <div className="flex flex-col h-screen bg-background">

        {/* Header */}
        <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
          <div className="container mx-auto px-4 py-3 flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="shrink-0 h-9 w-9">
              <Link href="/">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>

            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold text-foreground leading-tight">IA Especialista</h1>
              <p className="text-xs text-muted-foreground">Cannabis Indoor</p>
            </div>

            {/* Clear history */}
            {hasMessages && (
              confirmClear ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground">Apagar?</span>
                  <button
                    onClick={() => clearHistory.mutate({ plantId: plantId ?? undefined })}
                    className="text-xs px-2 py-1 rounded-lg bg-destructive text-destructive-foreground font-medium"
                  >
                    Sim
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="text-xs px-2 py-1 rounded-lg bg-muted text-muted-foreground font-medium"
                  >
                    Não
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="shrink-0 w-8 h-8 rounded-lg bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )
            )}
          </div>

          {/* Plant context bar */}
          <PlantContextBar plant={plant} onPress={() => setPickerOpen(true)} />
        </header>

        {/* No API key warning */}
        {noKey && (
          <div className="container mx-auto px-4 pt-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 dark:text-amber-400">
                <p className="font-medium mb-0.5">Nenhuma chave de API configurada</p>
                <p>Configure em <Link href="/settings/account" className="underline">Configurações → Conta</Link></p>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto container mx-auto px-4 py-4 max-w-2xl">
          {historyLoading && <HistorySkeleton />}

          {/* Empty state */}
          {!historyLoading && messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-5 pb-10">
              {/* Icon */}
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                  <Bot className="w-10 h-10 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              </div>

              <div className="text-center">
                <p className="font-bold text-foreground text-base">IA Especialista em Cannabis</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs leading-relaxed">
                  {plant
                    ? `Pronto para ajudar com ${plant.name}. Envie uma foto ou pergunta.`
                    : 'Selecione uma planta acima para que a IA tenha todo o contexto.'}
                </p>
              </div>

              {/* Quick chips */}
              <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                {QUICK_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => { setInput(chip); textareaRef.current?.focus(); }}
                    className="px-3 py-2 rounded-full bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition-colors border border-border/50 hover:border-emerald-500/30 active:scale-95"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!historyLoading && messages.map(msg => <ChatBubble key={msg.id} msg={msg} />)}
          {loading && <LoadingBubble />}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="bg-card border-t border-border pb-safe">
          <div className="container mx-auto px-3 py-2.5 max-w-2xl">
            {imagePreview && (
              <div className="relative inline-block mb-2 ml-1">
                <img src={imagePreview} alt="preview" className="h-16 w-16 rounded-lg object-cover border border-border" />
                <button
                  onClick={() => { setImageBase64(undefined); setImageMime(undefined); setImagePreview(undefined); }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 w-9 h-9 rounded-xl bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground transition-colors"
                title="Tirar ou escolher foto do celular"
              >
                <ImagePlus className="w-4.5 h-4.5" />
              </button>
              {plantId && (
                <button
                  onClick={() => setGalleryOpen(true)}
                  className="shrink-0 w-9 h-9 rounded-xl bg-muted hover:bg-emerald-500/15 flex items-center justify-center text-muted-foreground hover:text-emerald-500 transition-colors"
                  title="Fotos salvas da planta"
                >
                  <Images className="w-4.5 h-4.5" />
                </button>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte sobre sua planta…"
                rows={1}
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:border-emerald-500 resize-none max-h-32 leading-5"
                style={{ overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden' }}
              />
              <button
                onClick={handleSend}
                disabled={loading || (!input.trim() && !imageBase64) || !!noKey}
                className="shrink-0 w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center text-white transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImage(f); e.target.value = ''; }}
      />

      {plantId && (
        <PlantGallerySheet
          open={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          plantId={plantId}
          onSelect={(base64, mime, preview) => {
            setImageBase64(base64);
            setImageMime(mime);
            setImagePreview(preview);
          }}
        />
      )}

      <PlantPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectPlant}
        currentPlantId={plantId}
      />
    </PageTransition>
  );
}
