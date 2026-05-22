/**
 * Páginas legais (Privacy Policy + Terms of Service) servidas em /privacy
 * e /terms. HTML estático inline pra que crawlers da Apple/Google consigam
 * ler sem JavaScript.
 *
 * IMPORTANTE: este é um TEMPLATE base alinhado com LGPD/GDPR/CCPA, mas
 * NÃO substitui revisão jurídica. Antes de submeter pra App Store em
 * produção, contrate um advogado pra revisar e adaptar à sua jurisdição
 * e contrato com subprocessadores reais.
 */

const SUPPORT_EMAIL = "suporte@cultivo.pro";
const COMPANY_NAME = "Cultivo App";
const LAST_UPDATED = "20 de maio de 2026";

const baseStyle = `
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      max-width: 720px;
      margin: 0 auto;
      padding: 24px 20px 80px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      line-height: 1.65;
      color: #1a1a1a;
      background: #fff;
      font-size: 16px;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0a0e14; color: #e5e7eb; }
      a { color: #4ade80; }
      h1, h2 { color: #f3f4f6; }
      .meta { color: #9ca3af; }
      hr { border-color: #1f2937; }
      code { background: #1f2937; color: #e5e7eb; }
    }
    h1 { font-size: 28px; margin: 24px 0 8px; line-height: 1.25; }
    h2 { font-size: 20px; margin: 32px 0 8px; line-height: 1.35; }
    h3 { font-size: 16px; margin: 20px 0 6px; }
    p, ul, ol { margin: 0 0 12px; }
    ul, ol { padding-left: 24px; }
    li { margin-bottom: 4px; }
    .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
    .nav { font-size: 14px; margin-bottom: 16px; }
    .nav a { margin-right: 12px; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    hr { margin: 32px 0; border: 0; border-top: 1px solid #e5e7eb; }
    a { color: #059669; text-decoration: underline; }
    a:hover { text-decoration: none; }
  </style>
`;

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0a0e14" />
<meta name="robots" content="index, follow" />
<title>${title} — ${COMPANY_NAME}</title>
${baseStyle}
</head>
<body>
<div class="nav">
  <a href="/">← Voltar</a>
  <a href="/privacy">Privacidade</a>
  <a href="/terms">Termos</a>
</div>
${body}
<hr />
<p class="meta">
  © ${new Date().getFullYear()} ${COMPANY_NAME} · Contato: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a><br/>
  Última atualização: ${LAST_UPDATED}
</p>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────────────────
// PRIVACY POLICY
// ────────────────────────────────────────────────────────────────────────────

export const privacyPolicyHtml = wrap("Política de Privacidade", `
<h1>Política de Privacidade</h1>
<p class="meta">Última atualização: ${LAST_UPDATED}</p>

<p>
  Esta Política descreve como o <strong>${COMPANY_NAME}</strong> (“nós”, “Cultivo”,
  “app”) coleta, usa, armazena e compartilha seus dados pessoais quando você
  usa o aplicativo (web em <a href="https://app.cultivo.pro">app.cultivo.pro</a>
  e nativo em iOS/Android). Lemos com calma e em linguagem direta — sem
  juridiquês desnecessário.
</p>

<h2>1. Quem somos</h2>
<p>
  Operador: ${COMPANY_NAME} (pessoa física, em estruturação como pessoa jurídica).<br/>
  Contato para questões de privacidade: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
</p>

<h2>2. Que dados coletamos</h2>
<ul>
  <li><strong>Conta</strong>: email, nome (opcional), senha (armazenada como hash argon2id — não conseguimos recuperar a senha original).</li>
  <li><strong>Dados de cultivo</strong>: estufas, ciclos, plantas, registros diários (temperatura, umidade, pH, EC, PPFD), fotos das plantas, observações de saúde, técnicas LST/topping.</li>
  <li><strong>Identificadores técnicos</strong>: token JWT de autenticação, ID interno de grupo, identificador do dispositivo (gerado pelo Capacitor).</li>
  <li><strong>Notificações</strong>: token de push (FCM Android / APNs iOS) e preferências de horários.</li>
  <li><strong>Integrações opcionais</strong>: credenciais de IA (chave de API criptografada com AES-256-GCM se você adicionar), credenciais Tuya/SmartLife (idem), dispositivos ESP32 pareados.</li>
  <li><strong>Compras</strong>: identificador da assinatura no RevenueCat / App Store / Play Store. <em>Não</em> armazenamos dados do seu cartão.</li>
  <li><strong>Logs de servidor</strong>: IP, user-agent, timestamp, request ID. Emails em logs são mascarados (ex: <code>j*******@dominio.com</code>) para proteção.</li>
</ul>

<h3>O que NÃO coletamos</h3>
<ul>
  <li>Localização GPS</li>
  <li>Lista de contatos</li>
  <li>Mensagens fora do app</li>
  <li>Tracking entre apps (sem IDFA cross-app no iOS)</li>
</ul>

<h2>3. Como usamos seus dados</h2>
<ul>
  <li>Operar o serviço (login, sincronização, salvar seus cultivos).</li>
  <li>Cobrar assinatura quando aplicável (Pro / Pro Grupo).</li>
  <li>Enviar notificações que você configurou (alertas de ambiente, lembretes diários).</li>
  <li>Detectar uso anormal e prevenir abuso (rate limiting, anti-bot).</li>
  <li>Melhorar o app com base em telemetria agregada (sem identificar você individualmente).</li>
</ul>

<h2>4. Com quem compartilhamos</h2>
<p>Nós compartilhamos o mínimo necessário com subprocessadores listados abaixo:</p>
<ul>
  <li><strong>Google</strong> — apenas se você fizer login com Google OAuth (recebemos email e nome).</li>
  <li><strong>Apple</strong> — IAP via StoreKit (ID de transação anonimizado pela Apple).</li>
  <li><strong>Google Play</strong> — IAP via Play Billing (idem).</li>
  <li><strong>RevenueCat</strong> — orquestração das assinaturas. Recebe seu ID interno como “appUserId”, sem dados pessoais.</li>
  <li><strong>OpenAI / Anthropic / Google Gemini / DeepSeek / Moonshot</strong> — somente se você adicionar uma chave de API própria. O texto da mensagem e a foto enviada vão diretamente para o provedor que <em>você</em> escolheu, com a chave <em>sua</em>.</li>
  <li><strong>Tuya / SmartLife</strong> — somente se você vincular sua conta (Pro). Recebem credenciais que você forneceu.</li>
  <li><strong>AdMob (Google)</strong> — anúncios no plano Free, com sinal “Non-Personalized Ads” por padrão até você consentir o contrário via prompt ATT no iOS.</li>
  <li><strong>Hospedagem (Coolify / Hetzner ou similar)</strong> — banco MySQL e arquivos de upload ficam em servidores que controlamos, criptografados em repouso conforme padrão do provedor.</li>
</ul>
<p>
  Não vendemos seus dados. Não compartilhamos com data brokers. Não há tracking
  cross-app sem ATT explícito no iOS.
</p>

<h2>5. Armazenamento e segurança</h2>
<ul>
  <li>Todo tráfego em HTTPS (TLS 1.2+).</li>
  <li>Senhas armazenadas como hash argon2id (parâmetros OWASP 2024).</li>
  <li>Token JWT em <strong>Keychain</strong> (iOS) / <strong>EncryptedSharedPreferences</strong> (Android) — não vaza em backup iCloud.</li>
  <li>Chaves de API de IA criptografadas no banco com AES-256-GCM.</li>
  <li>Cookies de sessão com flags <code>HttpOnly</code>, <code>Secure</code>, <code>SameSite=Lax</code>.</li>
  <li>Headers de segurança: CSP estrita, HSTS, X-Content-Type-Options.</li>
  <li>Rate limit em endpoints sensíveis (login, registro, recuperação de senha).</li>
</ul>

<h2>6. Seus direitos</h2>
<p>De acordo com a LGPD (Brasil), GDPR (Europa) e CCPA (Califórnia), você pode:</p>
<ul>
  <li><strong>Acessar</strong> seus dados — todos visíveis no app.</li>
  <li><strong>Exportar</strong> em formato JSON — em <em>Configurações → Backup</em> ou <em>Configurações → Assinatura → Exportar meus dados</em>.</li>
  <li><strong>Corrigir</strong> nome, senha, configurações — em <em>Configurações → Conta</em>.</li>
  <li><strong>Excluir sua conta</strong> permanentemente — em <em>Configurações → Conta → Excluir conta</em>. Isso remove todos seus dados de imediato; algumas cópias podem persistir em backups por até 30 dias por motivos técnicos.</li>
  <li><strong>Revogar consentimento</strong> — logout, cancelar assinatura na Apple ID / Google Play, ou solicitar via email.</li>
  <li><strong>Reclamar à ANPD</strong> (Brasil), <strong>autoridade local</strong> (Europa), ou <strong>California AG</strong>.</li>
</ul>

<h2>7. Retenção</h2>
<p>
  Seus dados ficam armazenados enquanto sua conta estiver ativa. Após exclusão,
  removemos imediatamente do banco de dados primário; backups são purgados em
  até 30 dias. Logs com IP/timestamp são retidos por 90 dias para detecção de
  abuso e depois deletados ou anonimizados.
</p>

<h2>8. Crianças</h2>
<p>
  O app não é destinado a menores de 17 anos. O conteúdo (cultivo de plantas
  indoor, incluindo cannabis em jurisdições onde é legal) tem classificação
  17+ na App Store e Mature 17+ na Play Store. Não coletamos dados de menores
  conscientemente. Se você é responsável legal e identificou conta de menor,
  contate <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.
</p>

<h2>9. Transferência internacional</h2>
<p>
  Nossos servidores ficam em datacenters na Europa (Alemanha) ou Brasil
  (dependendo do plano de hospedagem). Subprocessadores listados na seção 4
  podem processar dados em outros países, sempre sob cláusulas contratuais
  padrão (SCCs) ou mecanismos equivalentes.
</p>

<h2>10. Mudanças nesta política</h2>
<p>
  Atualizações relevantes são notificadas in-app e por email (se aplicável).
  Mudanças menores ficam apenas registradas pela data no topo desta página.
  Uso continuado após mudança constitui aceitação.
</p>

<h2>11. Contato</h2>
<p>
  Dúvidas, exercício de direitos, denúncias:
  <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
</p>
`);

// ────────────────────────────────────────────────────────────────────────────
// TERMS OF SERVICE
// ────────────────────────────────────────────────────────────────────────────

export const termsOfServiceHtml = wrap("Termos de Uso", `
<h1>Termos de Uso</h1>
<p class="meta">Última atualização: ${LAST_UPDATED}</p>

<p>
  Estes Termos regulam o uso do <strong>${COMPANY_NAME}</strong> (“app”,
  “serviço”). Ao criar conta ou usar o serviço você concorda com eles.
  Recomendamos ler antes — em linguagem direta, sem juridiquês onde dá.
</p>

<h2>1. Quem pode usar</h2>
<ul>
  <li>Idade mínima: <strong>17 anos</strong>.</li>
  <li>Você deve usar o app apenas em jurisdições onde o cultivo doméstico da
    planta de interesse seja legal ou descriminalizado. Você é responsável
    por verificar isso. Nós fornecemos uma ferramenta de gestão de cultivo —
    não fornecemos sementes, produtos, nem facilitamos transações.</li>
  <li>Conta única por pessoa. Não compartilhe credenciais.</li>
</ul>

<h2>2. Sua conta</h2>
<ul>
  <li>Você é responsável pela senha. Use senha forte (mínimo 12 caracteres no
    nosso sistema). Não somos responsáveis por acesso indevido decorrente de
    senha fraca ou compartilhada.</li>
  <li>Mantenha email atualizado para recuperar acesso.</li>
  <li>Podemos suspender ou encerrar contas em caso de violação dos Termos,
    abuso do serviço, ou ordem judicial.</li>
</ul>

<h2>3. Seu conteúdo</h2>
<ul>
  <li>Fotos, dados de cultivo, observações e qualquer conteúdo que você inclui
    no app pertencem a você.</li>
  <li>Você nos concede licença <em>limitada e não-exclusiva</em> para armazenar,
    processar e exibir esse conteúdo apenas para operar o serviço (sincronizar
    entre dispositivos, gerar gráficos, processar com IA quando você pedir).</li>
  <li>Não vamos publicar, vender ou compartilhar seu conteúdo com terceiros
    além dos subprocessadores listados na Política de Privacidade.</li>
</ul>

<h2>4. Uso aceitável</h2>
<p>É <strong>proibido</strong>:</p>
<ul>
  <li>Usar o app para atividades ilegais na sua jurisdição.</li>
  <li>Tentar comprometer a segurança (scraping em massa, força bruta, exploração de bugs em vez de reportar).</li>
  <li>Revender acesso, sub-licenciar ou redistribuir o serviço.</li>
  <li>Usar bots automatizados além do uso pessoal razoável.</li>
  <li>Subir conteúdo ofensivo, discriminatório, com nudez não-consensual, ou que viole direitos de terceiros.</li>
</ul>
<p>
  Reporte vulnerabilidades de segurança para
  <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> — agradecemos e não
  perseguimos pesquisadores éticos.
</p>

<h2>5. Plano Free vs Pro vs Pro Grupo</h2>
<ul>
  <li><strong>Free</strong>: gratuito, com limites (1 estufa, 3 calculadoras) e anúncios.</li>
  <li><strong>Pro Individual</strong>: assinatura mensal ou anual, libera tudo do app para você.</li>
  <li><strong>Pro Grupo</strong>: assinatura mensal ou anual, libera tudo + até 3 membros no mesmo grupo.</li>
</ul>
<p>Os planos pagos são adquiridos via Apple App Store ou Google Play.</p>

<h3>Renovação e cancelamento</h3>
<ul>
  <li>Assinaturas renovam automaticamente conforme as regras da Apple/Google.</li>
  <li>Você cancela diretamente nas configurações da sua Apple ID ou Google Account, a qualquer momento. O cancelamento vale ao final do período já pago.</li>
  <li>Reembolsos: solicitados via Apple (<a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a>) ou Google (<a href="https://play.google.com">play.google.com</a>) — nós não processamos diretamente.</li>
</ul>

<h3>Mudanças de plano</h3>
<ul>
  <li>Upgrade aplica imediatamente, com cobrança proporcional.</li>
  <li>Downgrade (Team → Solo → Free): você continua acessando o tier antigo até o fim do período pago. Após isso, recursos excedentes ficam bloqueados (ex: estufas extras ficam read-only). Seus dados não são deletados — você pode reativar Pro depois e voltar ao acesso completo.</li>
</ul>

<h2>6. Conteúdo gerado por IA</h2>
<p>
  Se você ativar o chat com IA, suas mensagens e fotos são enviadas para o
  provedor que <strong>você configurou</strong> (OpenAI, Anthropic, Gemini,
  etc.) usando a chave de API que <strong>você</strong> forneceu. Respostas
  são <em>sugestões educacionais</em>, não conselho profissional. Verifique
  com cultivadores experientes antes de tomar decisões importantes.
</p>

<h2>7. Limitação de responsabilidade</h2>
<ul>
  <li>O serviço é fornecido “como está”. Não garantimos disponibilidade 100%
    nem ausência total de bugs.</li>
  <li>Não somos responsáveis por perda de colheita, sementes, equipamento ou
    qualquer prejuízo decorrente do uso (ou erro de uso) das calculadoras,
    sugestões de IA, ou notificações.</li>
  <li>Em qualquer caso, nossa responsabilidade total não excederá o valor
    pago por você nos últimos 12 meses (ou US$50 se você usou apenas Free).</li>
</ul>

<h2>8. Indenização</h2>
<p>
  Você concorda em isentar o ${COMPANY_NAME} de qualquer reclamação de
  terceiros decorrente do seu uso indevido do serviço, violação destes Termos,
  ou violação de leis aplicáveis à sua jurisdição.
</p>

<h2>9. Encerramento</h2>
<ul>
  <li>Você pode encerrar a conta a qualquer momento em <em>Configurações → Conta → Excluir conta</em>.</li>
  <li>Podemos suspender ou encerrar sua conta com 30 dias de aviso (ou imediatamente em caso de violação grave).</li>
  <li>Após encerramento, exportações solicitadas continuam disponíveis por 7 dias.</li>
</ul>

<h2>10. Mudanças nestes termos</h2>
<p>
  Podemos atualizar estes Termos com notificação prévia (in-app ou email) de
  30 dias para mudanças materiais. Mudanças menores ficam refletidas pela
  data no topo. Uso continuado após mudança constitui aceitação.
</p>

<h2>11. Lei aplicável e foro</h2>
<p>
  Estes Termos são regidos pelas leis do Brasil. Qualquer disputa será
  resolvida no foro da cidade do operador, salvo quando legislação local
  do consumidor exigir o contrário.
</p>

<h2>12. Contato</h2>
<p>
  Dúvidas sobre estes Termos:
  <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
</p>
`);
