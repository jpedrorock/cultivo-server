import { Link, useLocation } from 'wouter';
import { Database, BookOpen, ChevronRight, User, Shield, Bell, Sliders, Palette, Wifi, Sparkles, Users, FileText, Lock as LockIcon, PlayCircle, Clock, Info } from 'lucide-react';
import { usePlan } from '@/_core/hooks/usePlan';
import { PageHeader } from '@/components/PageHeader';
import { PageTransition, StaggerList, ListItemAnimation } from '@/components/PageTransition';
import { useAuth } from '@/_core/hooks/useAuth';
import { resetTour } from '@/hooks/useOnboardingTour';
import { isNative } from '@/lib/platform';
import { toast } from 'sonner';

function UserAvatar({ user, size = 'md' }: { user: { name?: string | null; email?: string; avatarUrl?: string | null } | null; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  const text = size === 'lg' ? 'text-lg' : 'text-sm';
  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.name || ''} className={`${dim} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${dim} rounded-full bg-primary flex items-center justify-center shrink-0`}>
      <span className={`text-white font-bold ${text}`}>{initial}</span>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { tier, isPro, isTeam } = usePlan();
  const [, setLocation] = useLocation();

  const handleReplayTour = async () => {
    await resetTour();
    toast.success("Tour resetado! Volte para a Home pra ver de novo.");
    setLocation("/");
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <PageHeader backHref="/" title="Configurações" />

        <main className="container mx-auto px-4 py-6 pb-28 sm:pb-8 max-w-2xl md:max-w-3xl">
          <StaggerList className="space-y-6">

            {/* Perfil resumido */}
            <ListItemAnimation>
              <div className="flex items-center gap-3 px-1">
                <UserAvatar user={user} size="lg" />
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{user?.name || 'Sem nome'}</p>
                  <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
                </div>
              </div>
            </ListItemAnimation>

            {/* Card de assinatura — destaque grande */}
            <ListItemAnimation>
              {tier === "team" ? (
                <Link href="/settings/subscription" className="block">
                  <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent p-4 active:scale-[0.98] transition-transform">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5 text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">Cultivo Pro Grupo</p>
                        <p className="text-xs text-muted-foreground">Sua assinatura está ativa</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  </div>
                </Link>
              ) : tier === "pro" ? (
                <Link href="/settings/subscription" className="block">
                  <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-4 active:scale-[0.98] transition-transform">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">Cultivo Pro</p>
                        <p className="text-xs text-muted-foreground">Sua assinatura está ativa</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  </div>
                </Link>
              ) : (
                <Link href="/settings/subscription" className="block">
                  <div className="rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-violet-500/10 p-5 active:scale-[0.98] transition-transform shadow-lg shadow-emerald-500/10">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/30">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-0.5">Cultivo Pro</p>
                        <h3 className="text-lg font-bold text-foreground leading-tight">
                          Desbloqueie tudo do app
                        </h3>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                      Estufas e fotos ilimitadas, todas as calculadoras, chat com IA, integração Tuya e sem anúncios. Plano Grupo até 3 pessoas.
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">A partir de <strong className="text-foreground">$8.25/mês</strong></span>
                      <span className="text-sm font-bold text-emerald-400 flex items-center gap-1">
                        Ver planos
                        <ChevronRight className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              )}
            </ListItemAnimation>

            {/* Seção: Conta */}
            <ListItemAnimation>
              <SettingsSection title="Conta">
                <SettingsRow href="/settings/account" icon={<User className="w-4 h-4" />} label="Perfil & Cultivo" description="Nome, senha, membros e código de convite" />
              </SettingsSection>
            </ListItemAnimation>

            {/* Seção: Personalização */}
            <ListItemAnimation>
              <SettingsSection title="Personalização">
                <SettingsRow href="/settings/appearance" icon={<Palette className="w-4 h-4" />} label="Tema" description="Claro, escuro, floresta e outros" />
                <SettingsRow href="/settings/alerts" icon={<Sliders className="w-4 h-4" />} label="Alertas de ambiente" description="Margens de tolerância por fase" />
                <SettingsRow href="/settings/notifications" icon={<Bell className="w-4 h-4" />} label="Notificações" description="Push e lembretes diários" />
                {/* Lembretes locais — só native (web não suporta Local Notifications) */}
                {isNative() && (
                  <SettingsRow
                    href="/settings/reminders"
                    icon={<Clock className="w-4 h-4" />}
                    label="Lembretes locais"
                    description="Rega, checagens e tarefas sem precisar de internet"
                  />
                )}
              </SettingsSection>
            </ListItemAnimation>

            {/* Seção: Integrações */}
            <ListItemAnimation>
              <SettingsSection title="Integrações">
                <SettingsRow href="/smartlife" icon={<Wifi className="w-4 h-4" />} label="SmartLife / Tuya" description="Dispositivos, cenas e sensores" />
              </SettingsSection>
            </ListItemAnimation>

            {/* Seção: Dados */}
            <ListItemAnimation>
              <SettingsSection title="Dados">
                <SettingsRow href="/settings/backup" icon={<Database className="w-4 h-4" />} label="Backup e Restauração" description="Exportar ou importar seus dados" />
              </SettingsSection>
            </ListItemAnimation>

            {/* Seção: Suporte */}
            <ListItemAnimation>
              <SettingsSection title="Suporte">
                <SettingsRow href="/help" icon={<BookOpen className="w-4 h-4" />} label="Guia do Usuário" description="Como usar todas as funcionalidades" />
                <SettingsRow href="/quick-log?demo=1" icon={<PlayCircle className="w-4 h-4" />} label="Ver tutorial de registro" description="Demonstração de como registrar Temp/RH/pH/EC (não salva nada)" />
                <SettingsRow href="/settings/about" icon={<Info className="w-4 h-4" />} label="Sobre" description="Versão, suporte e dados locais" />
                {/* "Refazer tour" só faz sentido em mobile native — no web o tour
                    não roda (gated por isNative()), então esconde a opção. */}
                {isNative() && (
                  <SettingsRow
                    onClick={handleReplayTour}
                    icon={<PlayCircle className="w-4 h-4" />}
                    label="Ver tour de boas-vindas"
                    description="Reapresenta os 4 slides iniciais do app"
                  />
                )}
              </SettingsSection>
            </ListItemAnimation>

            {/* Seção: Legal */}
            <ListItemAnimation>
              <SettingsSection title="Legal">
                <SettingsRow href="https://cultivo.pro/pt/privacidade" icon={<LockIcon className="w-4 h-4" />} label="Política de Privacidade" description="Como tratamos seus dados" external />
                <SettingsRow href="https://cultivo.pro/pt/termos" icon={<FileText className="w-4 h-4" />} label="Termos de Uso" description="Regras de utilização do app" external />
              </SettingsSection>
            </ListItemAnimation>

            {/* Seção: Administração (admin only) */}
            {user?.role === 'admin' && (
              <ListItemAnimation>
                <SettingsSection title="Administração">
                  <SettingsRow href="/admin/users" icon={<Shield className="w-4 h-4" />} label="Gerenciar Usuários" description="Ver, excluir e alterar roles" amber />
                </SettingsSection>
              </ListItemAnimation>
            )}

          </StaggerList>
        </main>
      </div>
    </PageTransition>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">{title}</p>
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

function SettingsRow({
  href,
  onClick,
  icon,
  label,
  description,
  amber,
  external,
}: {
  /** Use href pra navegação (Link wouter) ou onClick pra ação. Exatamente um dos dois. */
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
  amber?: boolean;
  /** Se true, abre URL fora do roteador SPA (ex: páginas estáticas /privacy, /terms) */
  external?: boolean;
}) {
  const inner = (
    <div className={`flex flex-row items-center justify-start gap-3 px-4 py-3.5 w-full hover:bg-muted/60 active:bg-muted transition-colors ${amber ? 'hover:bg-amber-50/60 dark:hover:bg-amber-900/10' : ''}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${amber ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-primary/10 text-primary'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${amber ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'}`}>{label}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left">
        {inner}
      </button>
    );
  }

  if (!href) {
    // Fallback defensivo — não deveria acontecer se props bem tipadas
    return <div className="block w-full">{inner}</div>;
  }

  if (external) {
    return <a href={href} target="_blank" rel="noopener" className="block w-full">{inner}</a>;
  }

  return <Link href={href} className="block w-full">{inner}</Link>;
}
