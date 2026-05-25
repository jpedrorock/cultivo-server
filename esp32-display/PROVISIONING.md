# Provisioning — ESP32 Cultivo Display

Guia completo para preparar um ESP32 novo (fábrica) ou resetado e vinculá-lo
a uma estufa no app Cultivo. Testado em JC3248W535C (ESP32-S3 N16R8 + AXS15231B).

---

## Pré-requisitos

| Item | Detalhe |
|------|---------|
| Hardware | ESP32-S3 JC3248W535C (ou compatível com env `real`) |
| Cabo | USB-C data (não só carga) — para flash e monitor serial |
| PlatformIO | VS Code + extensão PlatformIO **ou** `pio` CLI |
| Ambiente | `cd cultivo-server/esp32-display` antes de qualquer comando `pio` |
| Rede Wi-Fi | SSID + senha do Wi-Fi da estufa |
| App Cultivo | Conta logada em `app.cultivo.pro` (web ou mobile) |

---

## Etapa 1 — Apagar flash completo

> **Por quê**: ESPs de fábrica ou com firmware antigo têm NVS corrompida.
> Sem apagar, o portal de setup pode não aparecer ou carregar configuração stale.

```bash
cd cultivo-server/esp32-display
pio run -e real -t erase
```

Aguardar até ver `Chip erase completed successfully` no terminal.

---

## Etapa 2 — Gravar firmware

```bash
pio run -e real -t upload
```

> Se aparecer `No serial port found` ou `Failed to connect`:
> - Segurar o botão BOOT do ESP enquanto inicia o upload, soltar quando `Connecting...` aparecer
> - Em alguns cabos: apertar RESET depois de iniciar o upload

Aguardar `Leaving... Hard resetting...`. O ESP vai reiniciar automaticamente.

---

## Etapa 3 — ESP sobe o AP de configuração

Após o reboot, o display mostrará a tela de setup com:

```
Rede Wi-Fi:  Cultivo-XXYY
Senha:       cultivoXXYY
Acesse:      192.168.4.1
```

Onde `XX` e `YY` são os dois últimos bytes do endereço MAC do ESP
(ex: MAC `AA:BB:CC:DD:EE:FF` → SSID `Cultivo-EEFF`, senha `cultivoeeff`).

---

## Etapa 4 — Configurar via portal web

1. **Conecte o celular ou laptop** na rede `Cultivo-XXYY` com a senha exibida.
2. Abra o navegador em **`192.168.4.1`** (ou aguarde o redirect automático do captive portal).
3. Preencha o formulário:

   | Campo | Valor |
   |-------|-------|
   | **Wi-Fi SSID** | Nome da rede Wi-Fi da estufa |
   | **Senha Wi-Fi** | Senha da rede |
   | **Server URL** | `https://app.cultivo.pro` |

4. Clique em **Salvar**. O ESP vai:
   - Salvar as credenciais na NVS
   - Desligar o AP
   - Conectar à rede informada

> O campo **Server URL** deve ser exatamente `https://app.cultivo.pro` — sem barra final,
> sem `www`, sem porta extra.

---

## Etapa 5 — Tela de pareamento (RFC 8628)

Após conectar ao Wi-Fi, o ESP exibirá a tela **"CONECTAR DISPLAY"** com um código
de 6 dígitos, por exemplo:

```
CÓDIGO:  ABC-123
Expira em 10:00
```

No app Cultivo (web ou mobile):

1. Ir em **Dispositivos** → botão `+` ou **Adicionar Display**
2. Selecionar a estufa que vai receber este display
3. Digitar o código exibido no ESP
4. Confirmar

O ESP vai detectar o pareamento em até ~5 segundos e carregar o dashboard da estufa.

---

## Checklist de sucesso

Depois do pareamento, verificar no display:

- [ ] Tela principal mostra nome da estufa
- [ ] Temperatura e umidade atualizam (badge verde = dado fresco < 2min)
- [ ] Aba "Cenas" lista as cenas/dispositivos vinculados (ou está vazia se nenhum foi adicionado)
- [ ] Aba "Tarefas" mostra as tarefas da semana atual
- [ ] Aba "Plantas" lista as plantas ativas da estufa

---

## Troubleshooting

### AP não aparece após flash

- Confirmar que o erase rodou antes do upload
- Segurar BOOT + soltar ao ver `Connecting...`
- Verificar que o cabo é data (não só carga)

### Portal não abre em 192.168.4.1

- Desligar VPN no celular/laptop
- Tentar acessar manualmente em vez de esperar redirect captive
- iOS: ir em Ajustes → Wi-Fi → tocar no ícone `ⓘ` → "Configurar Proxy" → verificar que está sem proxy

### ESP não conecta ao Wi-Fi após salvar

- Verificar maiúsculas/minúsculas do SSID e senha (campo é case-sensitive)
- Redes 5GHz: o ESP32 só suporta 2.4GHz — garantir que o SSID é da banda 2.4GHz
- Se errou a senha: apertar RESET no ESP → ESP volta pro AP → tentar de novo

### Tela de pareamento fica em loop (código expira, novo código aparece)

- Verificar que `Server URL` foi salvo como `https://app.cultivo.pro` (sem barra final)
- Verificar conectividade: abrir o monitor serial e checar `[pair] pair-init HTTP 200`
- Conta logada no app? O endpoint `/api/device/pair-init` exige autenticação

### Pareamento concluído mas display mostra dados errados

- Confirmar que vinculou ao número correto de estufa (o código de pareamento é por estufa)
- Se a estufa errada foi vinculada: ir em Config → Avançado → Resetar Total → refazer o fluxo

---

## Re-flash / OTA

Para ESPs **já provisionados**, usar OTA (sem cabo):

```bash
pio run -e real -t upload --upload-port <hostname>.local
# ou pelo IP: pio run -e real -t upload --upload-port 192.168.x.x
```

A senha OTA é derivada do MAC do ESP: `cultivoOTAaabbcc` (3 últimos bytes).
O hostname é `cultivo-XXYY.local` (idem ao SSID, via mDNS).

Releases oficiais de firmware são publicadas automaticamente via GitHub Actions
quando um tag `vX.Y.Z` é criado — consultar `docs/OTA.md` para o fluxo de release.

---

## Dados persistidos na NVS (Non-Volatile Storage)

| Chave | Descrição |
|-------|-----------|
| `ssid` | SSID do Wi-Fi |
| `pass` | Senha do Wi-Fi |
| `url` | Server URL (`https://app.cultivo.pro`) |
| `token` | Device token (gerado no pareamento) |
| `tentId` | ID da estufa vinculada |
| `sleep` | Tempo de sleep da tela (segundos) |

Para limpar tudo: **Config → Avançado → Resetar Total** (via display) ou `pio run -e real -t erase`.
