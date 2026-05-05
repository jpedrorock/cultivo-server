import { Link } from 'wouter';
import { Database, BookOpen, ChevronRight, User, Shield, Bell, Sliders, Palette, Wifi } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { PageTransition, StaggerList, ListItemAnimation } from '@/components/PageTransition';
import { useAuth } from '@/_core/hooks/useAuth';

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
  icon,
  label,
  description,
  amber,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  amber?: boolean;
}) {
  return (
    <Link href={href} className="block w-full">
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
    </Link>
  );
}
