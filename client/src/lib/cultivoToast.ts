/**
 * cultivoToast — wrapper consistente em cima do sonner.
 *
 * Auditoria de design teardown apontou inconsistência massiva em toasts:
 * - Alguns com emoji (🌱⏰🔄), outros sem
 * - Alguns com "!" no final, outros com "..."
 * - Alguns com substantivo + verbo ("Sensor vinculado!"), outros frase
 *   completa ("3 registros sincronizados com sucesso")
 *
 * Helper força padrão único:
 * - Sem emoji (mantém só em onboarding/celebração explícita)
 * - Padrão "{Substantivo} {verbo-pretérito}" (ex: "Estufa criada", "Token removido")
 * - Sentenças factuais, sem "!" desnecessário
 * - Para erros: "Erro ao {ação}: {motivo}" — claro o que falhou
 *
 * Uso:
 *   import { cultivoToast } from "@/lib/cultivoToast";
 *
 *   // Sucesso de criação/edição/remoção
 *   cultivoToast.created("Estufa")           // "Estufa criada"
 *   cultivoToast.updated("Planta")           // "Planta atualizada"
 *   cultivoToast.removed("Token")            // "Token removido"
 *   cultivoToast.linked("Sensor")            // "Sensor vinculado"
 *
 *   // Sucesso custom (quando entity+verbo não cabem)
 *   cultivoToast.success("Foto enviada")
 *
 *   // Erro com contexto
 *   cultivoToast.error("Erro ao salvar", error.message)
 *   cultivoToast.error("Falha no upload", "Arquivo muito grande")
 *
 *   // Info / warning (raros, mas consistentes)
 *   cultivoToast.info("Sincronização em andamento")
 *   cultivoToast.warning("Sem conexão — usando dados locais")
 *
 * Para casos especiais que precisam emoji/celebração (ex: streak completo,
 * primeira colheita), usar `toast.success` direto do sonner.
 */
import { toast } from "sonner";

type Entity =
  | "Estufa" | "Planta" | "Strain" | "Ciclo" | "Tarefa" | "Token" | "Sensor"
  | "Cena" | "Dispositivo" | "Foto" | "Registro" | "Configuração" | "Alerta"
  | "Display" | "Backup" | "Template" | "Lembrete";

/**
 * Determina o gênero da entidade pra concordância correta.
 * Maioria das entidades cultivo são femininas. Lista de exceções masculinas.
 */
const MASCULINE_ENTITIES: Set<Entity> = new Set([
  "Ciclo", "Token", "Sensor", "Dispositivo", "Registro", "Alerta",
  "Display", "Backup", "Template", "Lembrete",
]);

function gender(entity: Entity): "f" | "m" {
  return MASCULINE_ENTITIES.has(entity) ? "m" : "f";
}

function conjugate(verb: "criado" | "atualizado" | "removido" | "vinculado" | "salvo", entity: Entity): string {
  const isFem = gender(entity) === "f";
  // Substituir 'o' final por 'a' pra feminino
  return isFem ? verb.replace(/o$/, "a") : verb;
}

export const cultivoToast = {
  /** "{Entity} criada/criado" */
  created(entity: Entity, customMessage?: string) {
    toast.success(customMessage ?? `${entity} ${conjugate("criado", entity)}`);
  },

  /** "{Entity} atualizada/atualizado" */
  updated(entity: Entity, customMessage?: string) {
    toast.success(customMessage ?? `${entity} ${conjugate("atualizado", entity)}`);
  },

  /** "{Entity} removida/removido" */
  removed(entity: Entity, customMessage?: string) {
    toast.success(customMessage ?? `${entity} ${conjugate("removido", entity)}`);
  },

  /** "{Entity} vinculada/vinculado" */
  linked(entity: Entity, customMessage?: string) {
    toast.success(customMessage ?? `${entity} ${conjugate("vinculado", entity)}`);
  },

  /** "{Entity} salva/salvo" */
  saved(entity: Entity, customMessage?: string) {
    toast.success(customMessage ?? `${entity} ${conjugate("salvo", entity)}`);
  },

  /** Sucesso custom — usar quando os helpers acima não cabem. Texto factual, sem emoji. */
  success(message: string) {
    toast.success(message);
  },

  /**
   * Erro com contexto. Padrão: "{Ação que falhou}: {motivo}".
   * Se motivo não vier, só mostra a ação.
   */
  error(action: string, reason?: string) {
    toast.error(reason ? `${action}: ${reason}` : action);
  },

  /** Info neutra. Use pra avisos não-acionáveis. */
  info(message: string) {
    toast.info(message);
  },

  /** Warning — algo merece atenção mas não é erro. */
  warning(message: string) {
    toast.warning(message);
  },
};
