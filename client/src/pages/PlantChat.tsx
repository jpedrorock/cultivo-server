import { useState, useRef, useEffect } from 'react';
import { useRoute, useLocation, Link } from 'wouter';
import { ArrowLeft, Bot, Send, ImagePlus, X, ChevronDown, Leaf, AlertCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PageTransition } from '@/components/PageTransition';
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
        // Bold **text**
        const parsed = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Bullet list
        if (/^[-•*]\s/.test(line)) {
          return (
            <div key={i} className="flex gap-1.5">
              <span className="shrink-0 mt-0.5 text-emerald-500">•</span>
              <span dangerouslySetInnerHTML={{ __html: parsed.replace(/^[-•*]\s/, '') }} />
            </div>
          );
        }
        // Heading ## or ###
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

// ─── Skeleton loading bubble ──────────────────────────────────────────────────

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

// ─── Plant picker sheet ───────────────────────────────────────────────────────

function PlantPickerSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (plant: { id: number; name: string }) => void;
}) {
  const { data: plants = [] } = trpc.plants.list.useQuery({});

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[60vh] overflow-y-auto">
        <p className="font-semibold text-sm mb-3">Selecionar planta</p>
        {plants.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma planta ativa.</p>
        )}
        <div className="space-y-1">
          {plants.map((p: any) => (
            <button
              key={p.id}
              onClick={() => { onSelect(p); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left"
            >
              <Leaf className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                {p.strain?.name && <p className="text-xs text-muted-foreground">{p.strain.name}</p>}
              </div>
            </button>
          ))}
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: aiSettings } = trpc.aiChat.getSettings.useQuery();
  const { data: plant } = trpc.plants.getById.useQuery({ id: plantId! }, { enabled: !!plantId });

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

    const history = messages.slice(-16).map(m => ({ role: m.role, content: m.content }));

    sendMessage.mutate({
      message: text || 'Analise essa foto.',
      plantId: plantId ?? undefined,
      imageBase64,
      imageMime,
      history,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const noKey = aiSettings && !aiSettings.hasKey;

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
            <button
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-xs font-medium text-foreground max-w-[140px]"
            >
              <Leaf className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">{plant?.name ?? 'Selecionar planta'}</span>
              <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
            </button>
          </div>

          {/* Context banner */}
          {plant && (
            <div className="container mx-auto px-4 pb-2">
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400 overflow-x-auto whitespace-nowrap">
                <span className="font-medium">{plant.name}</span>
                {plant.plantStage && (
                  <span className="text-emerald-600 dark:text-emerald-500">
                    {plant.plantStage === 'CLONE' ? 'Clone' : plant.plantStage === 'SEEDLING' ? 'Seedling' : 'Planta'}
                  </span>
                )}
                <span className="text-emerald-500/70">Contexto automático ativo</span>
              </div>
            </div>
          )}
        </header>

        {/* No API key warning */}
        {noKey && (
          <div className="container mx-auto px-4 pt-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 dark:text-amber-400">
                <p className="font-medium mb-0.5">Nenhuma chave de API configurada</p>
                <p>Configure sua chave em <Link href="/settings/account" className="underline">Configurações → Conta</Link> para usar o chat de IA.</p>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto container mx-auto px-4 py-4 max-w-2xl">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-4 pb-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Bot className="w-8 h-8 text-white" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">IA Especialista em Cannabis</p>
                <p className="text-sm text-muted-foreground mt-1">Pergunte sobre sua planta, diagnóstico, tricomas, LST…</p>
              </div>
              {/* Quick chips */}
              <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                {QUICK_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => { setInput(chip); textareaRef.current?.focus(); }}
                    className="px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition-colors text-left"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => <ChatBubble key={msg.id} msg={msg} />)}
          {loading && <LoadingBubble />}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="bg-card border-t border-border pb-safe">
          <div className="container mx-auto px-3 py-2.5 max-w-2xl">
            {/* Image preview */}
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
              >
                <ImagePlus className="w-4.5 h-4.5" />
              </button>
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

      <PlantPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectPlant}
      />
    </PageTransition>
  );
}
