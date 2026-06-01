/**
 * aiChat.test.ts — Testes unitários para o router aiChat
 *
 * Estratégia de mock:
 *  - getDb  → vi.mock('./db') — retorna objeto DB fake com chain Drizzle
 *  - fetch  → global.fetch sobrescrito (chamadas externas à API de IA)
 *  - aiCrypto → vi.mock('./aiCrypto') — sem criptografia real
 *
 * Rate limit: mapa em memória é module-level; cada teste usa userId >= 2000
 * para não contaminar o limite dos outros testes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { createTestContext } from "./test-helpers";

// ── vi.hoisted ────────────────────────────────────────────────────────────────

const mockGetDb = vi.hoisted(() => vi.fn());
const mockFetch  = vi.hoisted(() => vi.fn());
const queueState = vi.hoisted(() => ({ items: [] as any[][] }));

// ── vi.mock factories ─────────────────────────────────────────────────────────

vi.mock("./db", () => ({ getDb: mockGetDb }));

vi.mock("./aiCrypto", () => ({
  decryptAndMigrate: vi.fn().mockImplementation(async (cipher: string) => cipher),
  encryptApiKey: vi.fn().mockImplementation((key: string) => `enc:${key}`),
}));

// ── global fetch ──────────────────────────────────────────────────────────────
// Node não tem fetch global; atribuímos antes dos testes.
(global as any).fetch = mockFetch;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Cria um mock Drizzle DB que suporta o chain builder.
 *
 * As queries SELECT terminam em .limit() (ou await direto via .then).
 * Cada chamada a .limit() ou .then() retira o próximo item de queueState.items.
 *
 * INSERT/DELETE/UPDATE resolvem imediatamente (sem erro).
 */
function makeDbChain(): any {
  const chain: any = {
    select:  () => chain,
    from:    () => chain,
    where:   () => chain,
    orderBy: () => chain,
    // Terminadores assíncronos — puxam da fila
    // NOTA: NÃO adicionar propriedade `then` aqui — tornaria o objeto
    // "thenable" e `await getDb()` o desempacotaria para [] ao invés de
    // retornar o chain. Drizzle queries sempre terminam em .limit() neste
    // codebase, então não precisamos do fallback via .then.
    limit:   () => Promise.resolve(queueState.items.shift() ?? []),
    // Mutations — sucesso silencioso
    insert: () => ({ values: () => Promise.resolve({}) }),
    delete: () => ({ where: () => Promise.resolve({}) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve({}) }) }),
  };
  return chain;
}

let nextUserId = 2000;

function makeCaller(uid?: number) {
  const id = uid ?? ++nextUserId;
  return appRouter.createCaller(
    createTestContext({ user: { ...createTestContext().user, id } })
  );
}

// =============================================================================
describe("aiChat router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueState.items = [];

    // DB padrão: disponível, retorna listas vazias (sem settings → sem histórico)
    mockGetDb.mockResolvedValue(makeDbChain());

    // Fetch padrão: OpenAI-compatible success
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Resposta padrão da IA." } }],
      }),
    });
  });

  // ── Validação Zod ─────────────────────────────────────────────────────────

  it("sendMessage: rejeita mensagem vazia (Zod min:1)", async () => {
    await expect(
      makeCaller().aiChat.sendMessage({ message: "" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("sendMessage: rejeita imageMime fora do enum permitido", async () => {
    await expect(
      makeCaller().aiChat.sendMessage({
        message: "Olha",
        imageMime: "image/bmp" as any,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // ── Validação de imagem (antes do DB) ─────────────────────────────────────

  it("sendMessage: rejeita imagem com magic bytes inválidos (não JPEG/PNG/WebP)", async () => {
    const invalidBase64 = Buffer.from("INVALID_IMAGE_DATA").toString("base64");
    await expect(
      makeCaller().aiChat.sendMessage({
        message: "Veja minha planta",
        imageBase64: invalidBase64,
        imageMime: "image/jpeg",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Imagem inválida"),
    });
  });

  // ── DB indisponível ────────────────────────────────────────────────────────

  it("sendMessage: retorna INTERNAL_SERVER_ERROR quando DB nulo", async () => {
    mockGetDb.mockResolvedValue(null);
    await expect(
      makeCaller().aiChat.sendMessage({ message: "Oi" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  // ── Sem configuração de IA ─────────────────────────────────────────────────

  it("sendMessage: retorna BAD_REQUEST quando usuário não tem chave de IA", async () => {
    // queueState.items vazio → settings query retorna []
    await expect(
      makeCaller().aiChat.sendMessage({ message: "Como está minha planta?" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Configure sua chave"),
    });
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("sendMessage: retorna reply da IA quando configuração existe", async () => {
    queueState.items.push(
      [{ provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini" }], // settings
      [], // history: vazio
    );
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "A planta parece saudável!" } }],
      }),
    });

    const result = await makeCaller().aiChat.sendMessage({ message: "VPD ok?" });
    expect(result.reply).toBe("A planta parece saudável!");
  });

  it("sendMessage: passa histórico de conversa para o provider de IA", async () => {
    // DB retorna em DESC (mais recente primeiro). sendMessage faz .reverse().slice(0,-1)
    // para remover a mensagem recém-inserida ("E na vega?") antes de enviar à IA.
    const fakeHistory = [
      { role: "user",      content: "E na vega?" },             // mais recente (removida após slice)
      { role: "assistant", content: "Entre 0.8 e 1.2 kPa." },   // permanece
      { role: "user",      content: "Qual o VPD ideal?" },       // permanece
    ];
    queueState.items.push(
      [{ provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini" }], // settings
      fakeHistory,   // history (DESC — mais recente primeiro)
    );

    let capturedBody: any;
    mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string);
      return Promise.resolve({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Entendido." } }] }),
      });
    });

    await makeCaller().aiChat.sendMessage({ message: "E na vega?" });

    expect(capturedBody.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Qual o VPD ideal?" }),
      ])
    );
  });

  // ── getSettings ───────────────────────────────────────────────────────────

  it("getSettings: retorna hasKey: false quando não configurado", async () => {
    // queueState vazio → settings query retorna []
    const result = await makeCaller().aiChat.getSettings();
    expect(result).toMatchObject({ hasKey: false, provider: null });
  });

  it("getSettings: retorna hasKey: true quando configurado", async () => {
    queueState.items.push(
      [{ provider: "anthropic", model: "claude-haiku-4-5-20251001" }]
    );
    const result = await makeCaller().aiChat.getSettings();
    expect(result).toMatchObject({ hasKey: true, provider: "anthropic" });
  });
});
