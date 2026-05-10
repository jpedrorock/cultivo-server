/**
 * aiChat — assistente especialista em cannabis indoor.
 *
 * Antes vivia inline em server/routers.ts (linhas ~150-419 helpers e
 * 7533-7931 router). Extraído pra cá pra reduzir o monstro principal e
 * isolar tudo de IA num lugar só.
 *
 * Cada usuário configura sua própria chave de API (OpenAI / Anthropic /
 * Gemini / DeepSeek / Kimi). Todas as keys são criptografadas no banco via
 * aiCrypto.ts. Histórico de chat (até 50 msgs por planta+user) persiste
 * em aiChatMessages.
 *
 * Rate limit em memória: 20 mensagens/hora/usuário (reseta com restart
 * do servidor). Em multi-instância, mover pra Redis.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc, isNull, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  userAiSettings,
  aiChatMessages,
  plants,
  strains,
  tents,
  cycles,
  dailyLogs,
  plantHealthLogs,
} from "../../drizzle/schema";
import { validatePlantOwnership } from "./_helpers";

// ════════════════════════════════════════════════════════════════════════════
// Helpers de prompt
// ════════════════════════════════════════════════════════════════════════════

function buildBaseSystemPrompt(): string {
  return `Você é um especialista em cultivo de cannabis indoor com 20 anos de experiência prática.
Responda SEMPRE em português brasileiro. Seja direto, prático e objetivo.
Use linguagem técnica mas acessível. Quando houver foto, analise-a cuidadosamente.

Seus domínios de especialidade:
- Diagnóstico visual de deficiências nutricionais, pragas e doenças
- Técnicas de treinamento: LST, topping, FIM, super crop, ScrOG, mainlining, lollipopping
- Leitura de tricomas e determinação do ponto ideal de colheita
- Nutrição, ajuste de pH e EC em cada fase do cultivo
- Ambiência: VPD, DLI, temperatura, umidade relativa, espectro de luz
- Gestão de espaço, fotoperiodo e transição vega→flora

Ao diagnosticar problemas, siga esta estrutura:
1. O que está acontecendo
2. Possível causa (deficiência/excesso/praga/ambiente)
3. Como corrigir (ação imediata + prevenção)
`;
}

function buildPlantContext(ctx: {
  plantName: string; strainName: string; daysOld: number; weekNumber: number;
  phase: string; tentName: string; avgTemp: string; avgRh: string;
  avgPpfd: string; avgPh: string; avgEc: string;
  healthLogs: { logDate: any; healthStatus: string | null; symptoms: string | null; notes: string | null }[];
}): string {
  const healthStr = ctx.healthLogs.length
    ? ctx.healthLogs.map(h =>
        `  - ${new Date(h.logDate).toLocaleDateString('pt-BR')}: ${h.healthStatus ?? ''} ${h.symptoms ? `| Sintomas: ${h.symptoms}` : ''} ${h.notes ? `| Nota: ${h.notes}` : ''}`
      ).join('\n')
    : "  Sem registros de saúde";

  return `
━━━ CONTEXTO DA PLANTA ━━━
Nome: ${ctx.plantName}
Strain: ${ctx.strainName}
Dias de vida: ${ctx.daysOld} | Semana ${ctx.weekNumber} | Fase: ${ctx.phase}
Estufa: ${ctx.tentName}

CONDIÇÕES AMBIENTAIS (últimos 7 dias):
  Temperatura média: ${ctx.avgTemp}°C
  Umidade relativa: ${ctx.avgRh}%
  PPFD: ${ctx.avgPpfd} μmol/m²/s
  pH: ${ctx.avgPh}
  EC: ${ctx.avgEc} mS/cm

HISTÓRICO DE SAÚDE (últimos 5 registros):
${healthStr}
━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers de chamada às APIs dos providers
// ════════════════════════════════════════════════════════════════════════════

/** Modelos fallback por provedor (em ordem de preferência) */
const PROVIDER_FALLBACKS: Record<string, string[]> = {
  gemini:    ["gemini-2.0-flash-lite", "gemini-2.5-pro-preview-03-25", "gemini-2.0-flash", "gemini-pro"],
  openai:    ["gpt-4o-mini", "gpt-3.5-turbo"],
  anthropic: ["claude-haiku-4-5-20251001", "claude-3-haiku-20240307"],
  deepseek:  ["deepseek-chat"],
  kimi:      ["moonshot-v1-8k"],
};

/** Busca modelos disponíveis do Gemini via ListModels API */
async function fetchGeminiModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m: any) => (m.name as string).replace("models/", ""))
      .filter((name: string) => name.startsWith("gemini"));
  } catch {
    return [];
  }
}

/** Verifica se o erro é de modelo não encontrado/depreciado */
function isModelNotFoundError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes("not found") || lower.includes("no longer available") ||
    lower.includes("not supported") || lower.includes("deprecated") ||
    lower.includes("does not exist");
}

/** Extrai uma mensagem legível de uma resposta de erro de API */
async function parseProviderError(res: Response, provider: string): Promise<string> {
  const status = res.status;
  let body = "";
  try { body = await res.text(); } catch { /* ignore */ }

  // Tentar parsear JSON para extrair mensagem
  let msg = "";
  try {
    const json = JSON.parse(body);
    msg =
      json?.error?.message ||      // OpenAI / Gemini
      json?.error?.msg ||
      json?.message ||              // genérico
      json?.error?.error?.message || // Anthropic nested
      "";
  } catch { /* body não é JSON */ }

  if (!msg) msg = body.slice(0, 150);

  // Mensagens amigáveis por status
  if (status === 401) return `Chave de API inválida ou expirada. Verifique em Configurações → Conta.`;
  if (status === 403) return `Acesso negado pela API. Verifique se a chave tem permissão para o modelo.`;
  if (status === 429) return `Limite de requisições atingido (${provider}). Aguarde um momento e tente novamente. Se persistir, verifique sua cota em ${provider === "gemini" ? "aistudio.google.com" : "platform.openai.com"}.`;
  if (status >= 500) return `Servidor da ${provider} com problema temporário. Tente novamente em alguns segundos.`;

  return msg || `Erro ${status} na API ${provider}.`;
}

async function callAiProvider(opts: {
  provider: string; model: string; apiKey: string; systemPrompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  message: string; imageBase64?: string; imageMime?: string;
}): Promise<string> {
  const { provider, model, apiKey, systemPrompt, history, message, imageBase64, imageMime } = opts;

  if (provider === "openai") {
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      {
        role: "user" as const,
        content: imageBase64
          ? [
              { type: "text", text: message },
              { type: "image_url", image_url: { url: `data:${imageMime ?? "image/jpeg"};base64,${imageBase64}`, detail: "high" } },
            ]
          : message,
      },
    ];
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: 1500 }),
    });
    if (!res.ok) throw new Error(await parseProviderError(res, "OpenAI"));
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content ?? "Sem resposta";
  }

  if (provider === "anthropic") {
    const userContent: any[] = imageBase64
      ? [
          { type: "image", source: { type: "base64", media_type: imageMime ?? "image/jpeg", data: imageBase64 } },
          { type: "text", text: message },
        ]
      : [{ type: "text", text: message }];

    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: userContent },
    ];
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 1500, system: systemPrompt, messages }),
    });
    if (!res.ok) throw new Error(await parseProviderError(res, "Anthropic"));
    const data: any = await res.json();
    return data.content?.[0]?.text ?? "Sem resposta";
  }

  if (provider === "gemini") {
    const parts: any[] = [];
    if (imageBase64) parts.push({ inlineData: { mimeType: imageMime ?? "image/jpeg", data: imageBase64 } });
    parts.push({ text: message });

    const contents = [
      ...history.map(h => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
      { role: "user", parts },
    ];
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { maxOutputTokens: 1500 },
        }),
      }
    );
    if (!res.ok) throw new Error(await parseProviderError(res, "Gemini"));
    const data: any = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sem resposta";
  }

  // DeepSeek e Kimi são compatíveis com a API da OpenAI — só muda a base URL
  if (provider === "deepseek" || provider === "kimi") {
    const baseUrl = provider === "deepseek"
      ? "https://api.deepseek.com/v1"
      : "https://api.moonshot.cn/v1";

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      {
        role: "user" as const,
        content: imageBase64 && provider === "deepseek"
          ? [
              { type: "text", text: message },
              { type: "image_url", image_url: { url: `data:${imageMime ?? "image/jpeg"};base64,${imageBase64}` } },
            ]
          : message, // Kimi não suporta visão por base64 na v1
      },
    ];
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: 1500 }),
    });
    if (!res.ok) throw new Error(await parseProviderError(res, provider === "deepseek" ? "DeepSeek" : "Kimi"));
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content ?? "Sem resposta";
  }

  throw new Error(`Provedor desconhecido: ${provider}`);
}

/** Chama o provider com auto-fallback se o modelo for deprecado/não encontrado */
async function callAiProviderWithFallback(opts: Parameters<typeof callAiProvider>[0]): Promise<{ reply: string; modelUsed: string }> {
  const { provider, model, apiKey } = opts;

  // Para Gemini: busca modelos reais da API antes de tentar
  let candidates: string[];
  if (provider === "gemini") {
    const liveModels = await fetchGeminiModels(apiKey);
    if (liveModels.length > 0) {
      // Prefere o modelo salvo se disponível, senão usa o primeiro da lista
      candidates = liveModels.includes(model)
        ? [model, ...liveModels.filter(m => m !== model)]
        : liveModels;
      console.log(`[aiChat] Gemini: ${liveModels.length} modelos disponíveis, usando ${candidates[0]}`);
    } else {
      // Fallback estático se ListModels falhar
      candidates = [model, ...PROVIDER_FALLBACKS[provider].filter(m => m !== model)];
    }
  } else {
    candidates = [model, ...(PROVIDER_FALLBACKS[provider] ?? []).filter(m => m !== model)];
  }

  let lastError = "";
  for (const candidate of candidates) {
    try {
      const reply = await callAiProvider({ ...opts, model: candidate });
      if (candidate !== model) {
        console.log(`[aiChat] Modelo ${model} indisponível, usando fallback: ${candidate}`);
      }
      return { reply, modelUsed: candidate };
    } catch (err: any) {
      lastError = err?.message ?? String(err);
      if (!isModelNotFoundError(lastError)) {
        throw err; // Não é erro de modelo — lança imediatamente
      }
      console.warn(`[aiChat] Modelo ${candidate} não disponível, tentando próximo...`);
    }
  }
  throw new Error(lastError || `Nenhum modelo disponível para ${provider}`);
}

// ════════════════════════════════════════════════════════════════════════════
// Rate limiting em memória — 20 msgs/hora/usuário
// (Em multi-instância, mover pra Redis)
// ════════════════════════════════════════════════════════════════════════════

const AI_RATE_LIMIT = 20;
const AI_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hora
const aiRateMap = new Map<number, { count: number; windowStart: number }>();

function checkAiRateLimit(userId: number): void {
  const now = Date.now();
  const entry = aiRateMap.get(userId);
  if (!entry || now - entry.windowStart > AI_RATE_WINDOW_MS) {
    aiRateMap.set(userId, { count: 1, windowStart: now });
    return;
  }
  if (entry.count >= AI_RATE_LIMIT) {
    const resetIn = Math.ceil((AI_RATE_WINDOW_MS - (now - entry.windowStart)) / 60000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Limite de ${AI_RATE_LIMIT} mensagens por hora atingido. Tente novamente em ${resetIn} min.`,
    });
  }
  entry.count++;
}

// ════════════════════════════════════════════════════════════════════════════
// aiChatRouter — exposto pelo appRouter como `aiChat`
// ════════════════════════════════════════════════════════════════════════════

export const aiChatRouter = router({

  // Salvar configurações de API do usuário
  saveSettings: protectedProcedure
    .input(z.object({
      provider: z.enum(["openai", "anthropic", "gemini", "deepseek", "kimi"]),
      apiKey:   z.string().min(1).max(2000).optional(), // omitir = manter chave existente
      model:    z.string().max(64).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      const existing = await database
        .select({ id: userAiSettings.id, apiKey: userAiSettings.apiKey })
        .from(userAiSettings)
        .where(eq(userAiSettings.userId, ctx.user.id))
        .limit(1);

      let encryptedKey: string;
      if (input.apiKey) {
        const { encryptApiKey } = await import("../aiCrypto");
        encryptedKey = encryptApiKey(input.apiKey);
      } else if (existing.length > 0) {
        encryptedKey = existing[0].apiKey; // manter chave existente
      } else {
        throw new Error("API key é obrigatória no primeiro cadastro");
      }

      if (existing.length > 0) {
        await database
          .update(userAiSettings)
          .set({ provider: input.provider, apiKey: encryptedKey, model: input.model ?? null })
          .where(eq(userAiSettings.userId, ctx.user.id));
      } else {
        await database.insert(userAiSettings).values({
          userId: ctx.user.id,
          provider: input.provider,
          apiKey: encryptedKey,
          model: input.model ?? null,
        });
      }
      return { success: true };
    }),

  // Buscar configurações — nunca expõe a chave
  getSettings: protectedProcedure
    .query(async ({ ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");
      const [settings] = await database
        .select({ provider: userAiSettings.provider, model: userAiSettings.model })
        .from(userAiSettings)
        .where(eq(userAiSettings.userId, ctx.user.id))
        .limit(1);
      if (!settings) return { hasKey: false, provider: null, model: null };
      return { hasKey: true, provider: settings.provider, model: settings.model };
    }),

  // Listar modelos disponíveis do provedor (para Gemini, busca da API)
  listModels: protectedProcedure
    .query(async ({ ctx }) => {
      const database = await getDb();
      if (!database) return { models: [] };

      const [settings] = await database
        .select()
        .from(userAiSettings)
        .where(eq(userAiSettings.userId, ctx.user.id))
        .limit(1);
      if (!settings) return { models: [] };

      const { decryptAndMigrate } = await import("../aiCrypto");
      const apiKey = await decryptAndMigrate(settings.apiKey, async (newCipher) => {
        await database
          .update(userAiSettings)
          .set({ apiKey: newCipher })
          .where(eq(userAiSettings.userId, ctx.user.id));
      });
      const provider = settings.provider;

      if (provider === "gemini") {
        const models = await fetchGeminiModels(apiKey);
        return { models };
      }

      // Para outros provedores, retorna lista estática
      const staticModels: Record<string, string[]> = {
        openai:    ["gpt-4o-mini", "gpt-4o"],
        anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"],
        deepseek:  ["deepseek-chat", "deepseek-reasoner"],
        kimi:      ["moonshot-v1-8k", "moonshot-v1-32k"],
      };
      return { models: staticModels[provider] ?? [] };
    }),

  // Testar se a chave e modelo estão funcionando
  testConnection: protectedProcedure
    .mutation(async ({ ctx }) => {
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      const [settings] = await database
        .select()
        .from(userAiSettings)
        .where(eq(userAiSettings.userId, ctx.user.id))
        .limit(1);
      if (!settings) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma chave configurada" });

      const { decryptAndMigrate } = await import("../aiCrypto");
      const apiKey = await decryptAndMigrate(settings.apiKey, async (newCipher) => {
        await database
          .update(userAiSettings)
          .set({ apiKey: newCipher })
          .where(eq(userAiSettings.userId, ctx.user.id));
      });
      const provider = settings.provider;
      const defaultModels: Record<string, string> = {
        openai: "gpt-4o-mini", anthropic: "claude-haiku-4-5-20251001",
        gemini: "gemini-2.0-flash-lite", deepseek: "deepseek-chat", kimi: "moonshot-v1-8k",
      };
      const model = (settings.model && settings.model.length > 0) ? settings.model : (defaultModels[provider] ?? "gemini-2.0-flash-lite");

      try {
        const result = await callAiProviderWithFallback({
          provider, model, apiKey,
          systemPrompt: "Você é um assistente de cannabis.",
          history: [],
          message: "Responda apenas: OK",
        });
        return { success: true, provider, modelUsed: result.modelUsed };
      } catch (err: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err?.message ?? "Falha na conexão" });
      }
    }),

  // Buscar histórico da conversa de uma planta
  getHistory: protectedProcedure
    .input(z.object({ plantId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      if (input.plantId) {
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
      }

      const plantCondition = input.plantId != null
        ? eq(aiChatMessages.plantId, input.plantId)
        : isNull(aiChatMessages.plantId);

      const msgs = await database
        .select({ role: aiChatMessages.role, content: aiChatMessages.content, createdAt: aiChatMessages.createdAt })
        .from(aiChatMessages)
        .where(and(eq(aiChatMessages.userId, ctx.user.id), plantCondition))
        .orderBy(asc(aiChatMessages.createdAt))
        .limit(50);

      return msgs;
    }),

  // Limpar histórico da conversa de uma planta
  clearHistory: protectedProcedure
    .input(z.object({ plantId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      if (input.plantId) {
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
      }

      const plantCondition = input.plantId != null
        ? eq(aiChatMessages.plantId, input.plantId)
        : isNull(aiChatMessages.plantId);

      await database
        .delete(aiChatMessages)
        .where(and(eq(aiChatMessages.userId, ctx.user.id), plantCondition));

      return { success: true };
    }),

  // Enviar mensagem para a IA
  sendMessage: protectedProcedure
    .input(z.object({
      message:     z.string().min(1).max(4000),
      plantId:     z.number().optional(),
      imageBase64: z.string().max(10 * 1024 * 1024).optional(),
      imageMime:   z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Rate limit: 20 mensagens/hora por usuário
      checkAiRateLimit(ctx.user.id);

      // Validar base64 de imagem se fornecida
      if (input.imageBase64) {
        try {
          const decoded = Buffer.from(input.imageBase64, "base64");
          // Verificar magic bytes para JPEG, PNG e WebP
          const magic = decoded.subarray(0, 4);
          const isJpeg = magic[0] === 0xFF && magic[1] === 0xD8;
          const isPng  = magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4E && magic[3] === 0x47;
          const isWebp = decoded.subarray(0, 12).toString("ascii", 8, 12) === "WEBP";
          if (!isJpeg && !isPng && !isWebp) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem inválida — envie JPEG, PNG ou WebP." });
          }
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          throw new TRPCError({ code: "BAD_REQUEST", message: "Base64 de imagem inválido." });
        }
      }

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      // 1. Buscar settings e descriptografar chave
      const [settings] = await database
        .select()
        .from(userAiSettings)
        .where(eq(userAiSettings.userId, ctx.user.id))
        .limit(1);
      if (!settings) throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Configure sua chave de API em Configurações → Conta → IA Especialista",
      });

      const { decryptAndMigrate } = await import("../aiCrypto");
      const apiKey = await decryptAndMigrate(settings.apiKey, async (newCipher) => {
        await database
          .update(userAiSettings)
          .set({ apiKey: newCipher })
          .where(eq(userAiSettings.userId, ctx.user.id));
      });
      const provider = settings.provider;
      const defaultModels: Record<string, string> = {
        openai: "gpt-4o-mini",
        anthropic: "claude-haiku-4-5-20251001",
        gemini: "gemini-2.0-flash-lite",
        deepseek: "deepseek-chat",
        kimi: "moonshot-v1-8k",
      };
      const model = (settings.model && settings.model.length > 0)
        ? settings.model
        : (defaultModels[provider] ?? "gemini-2.0-flash");

      // 2. Salvar mensagem do usuário no banco (tolerante — não quebra se tabela não existir)
      const userContent = input.message.trim() ? input.message : "[Foto enviada para análise]";
      const plantCondition = input.plantId != null
        ? eq(aiChatMessages.plantId, input.plantId)
        : isNull(aiChatMessages.plantId);

      try {
        await database.insert(aiChatMessages).values({
          userId:  ctx.user.id,
          plantId: input.plantId ?? null,
          role:    "user",
          content: userContent,
        });
      } catch (dbErr: any) {
        console.warn("[aiChat] Erro ao salvar msg usuário (tabela pode não existir ainda):", dbErr?.message);
      }

      // 3. Buscar histórico do banco (tolerante)
      let historyForAi: { role: "user" | "assistant"; content: string }[] = [];
      try {
        const dbHistory = await database
          .select({ role: aiChatMessages.role, content: aiChatMessages.content })
          .from(aiChatMessages)
          .where(and(eq(aiChatMessages.userId, ctx.user.id), plantCondition))
          .orderBy(desc(aiChatMessages.createdAt))
          .limit(31);

        historyForAi = dbHistory
          .reverse()
          .slice(0, -1)
          .map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content }));
      } catch (dbErr: any) {
        console.warn("[aiChat] Erro ao buscar histórico:", dbErr?.message);
      }

      // 4. Buscar contexto da planta (se fornecido)
      let systemPrompt = buildBaseSystemPrompt();

      if (input.plantId) {
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        const [plant] = await database
          .select()
          .from(plants)
          .where(eq(plants.id, input.plantId))
          .limit(1);

        if (plant) {
          const [strain] = plant.strainId
            ? await database.select({ name: strains.name }).from(strains).where(eq(strains.id, plant.strainId)).limit(1)
            : [null];

          const [tent] = plant.currentTentId
            ? await database.select({ id: tents.id, name: tents.name }).from(tents).where(eq(tents.id, plant.currentTentId)).limit(1)
            : [null];

          const [cycle] = tent
            ? await database.select().from(cycles)
                .where(and(eq(cycles.tentId, tent.id), eq(cycles.status, "ACTIVE")))
                .orderBy(desc(cycles.createdAt)).limit(1)
            : [null];

          const daysOld = plant.createdAt
            ? Math.floor((Date.now() - new Date(plant.createdAt).getTime()) / 86400000)
            : 0;
          const weekNumber = Math.floor(daysOld / 7) + 1;
          const isFlora = cycle?.floraStartDate != null;
          const phase = isFlora ? "Flora" : "Vegetativa";

          const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
          const envLogs = tent
            ? await database.select({
                tempC: dailyLogs.tempC, rhPct: dailyLogs.rhPct,
                ppfd: dailyLogs.ppfd, ph: dailyLogs.ph, ec: dailyLogs.ec,
              }).from(dailyLogs)
                .where(and(eq(dailyLogs.tentId, tent.id), sql`${dailyLogs.logDate} >= ${sevenDaysAgo}`))
                .limit(50)
            : [];

          const avg = (arr: (string | number | null | undefined)[]) => {
            const nums = arr.map(v => v != null ? parseFloat(String(v)) : null).filter((v): v is number => v !== null);
            return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : "—";
          };

          const healthLogs = await database
            .select({ logDate: plantHealthLogs.logDate, healthStatus: plantHealthLogs.healthStatus, symptoms: plantHealthLogs.symptoms, notes: plantHealthLogs.notes })
            .from(plantHealthLogs)
            .where(eq(plantHealthLogs.plantId, input.plantId))
            .orderBy(desc(plantHealthLogs.logDate))
            .limit(5);

          systemPrompt += buildPlantContext({
            plantName: plant.name ?? `Planta ${plant.id}`,
            strainName: strain?.name ?? "Desconhecida",
            daysOld, weekNumber, phase,
            tentName: tent?.name ?? "—",
            avgTemp: avg(envLogs.map((l: any) => l.tempC)),
            avgRh: avg(envLogs.map((l: any) => l.rhPct)),
            avgPpfd: avg(envLogs.map((l: any) => l.ppfd)),
            avgPh: avg(envLogs.map((l: any) => l.ph)),
            avgEc: avg(envLogs.map((l: any) => l.ec)),
            healthLogs,
          });
        }
      }

      // 5. Chamar a API do provedor com auto-fallback — erros chegam ao cliente como BAD_REQUEST
      let reply: string;
      try {
        const result = await callAiProviderWithFallback({ provider, model, apiKey, systemPrompt, history: historyForAi, message: input.message, imageBase64: input.imageBase64, imageMime: input.imageMime });
        reply = result.reply;
      } catch (aiErr: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: aiErr?.message ?? "Erro ao chamar a IA" });
      }

      // 6. Salvar resposta da IA no banco (tolerante)
      try {
        await database.insert(aiChatMessages).values({
          userId:  ctx.user.id,
          plantId: input.plantId ?? null,
          role:    "assistant",
          content: reply,
        });
      } catch (dbErr: any) {
        console.warn("[aiChat] Erro ao salvar resposta da IA:", dbErr?.message);
      }

      return { reply };
    }),
});
