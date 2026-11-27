# Metadados das Lojas (pt-BR) — Em Dia v2.0.0

- **Nome do aplicativo:** `Em Dia`
- **Identificador (Android / iOS):** `app.zioncodes.emdia`
- **Versão:** `2.0.0`
- **Política de Privacidade (arquivo fonte):** [docs/privacy-policy.md](../privacy-policy.md)
- **Política de Privacidade (página estática):** [docs/privacy-policy/index.html](../privacy-policy/index.html)
- **URL pública da Política de Privacidade:** `https://emdia-privacidade.netlify.app` (projeto criado no Netlify; realizar o primeiro deploy ou vincular ao Git antes da submissão nas lojas)

---

## Google Play Console

- **Título do app (máx. 30 caracteres):** `Em Dia`
- **Descrição curta (máx. 80 caracteres):**
  `Controle financeiro 100% local: contas, cartões, faturas, metas e orçamentos.`
- **Categoria:** `Finanças`
- **Classificação indicativa:** Livre (preencher questionário padrão sem conteúdo restrito / sem anúncios / sem compras no app)
- **Descrição completa (máx. 4000 caracteres):**

```text
Organize suas finanças pessoais com privacidade total e sem depender de internet ou cadastro.

O Em Dia é um aplicativo de controle financeiro pessoal 100% local (offline-first). Todos os seus lançamentos, contas, cartões e metas ficam salvos apenas no seu aparelho.

Principais recursos:
• Visão geral clara do mês: saldo, receitas, despesas e acompanhamento rápido dos seus gastos.
• Contas e cartões de crédito: controle múltiplas contas, limites, fechamento, vencimento e faturas parciais ou quitadas.
• Lançamentos e parcelamentos: registre receitas, despesas, transferências, recorrências mensais e compras parceladas com geração automática das parcelas.
• Divisão por participantes: acompanhe gastos compartilhados com outras pessoas de forma organizada.
• Orçamentos por categoria: defina limites mensais e visualize o quanto já foi utilizado.
• Metas financeiras e investimentos: acompanhe sua evolução e reservas com clareza.
• Modo privacidade e biometria: oculte valores na tela com um toque e proteja o acesso ao app com a biometria do seu aparelho.
• Backup e restauração local: exporte e restaure seus dados em arquivo JSON quando quiser, sob seu controle.

Privacidade em primeiro lugar:
• Sem criação de conta ou login obrigatório.
• Sem envio de dados financeiros para servidores externos.
• Sem anúncios e sem rastreamento.
```

- **Notas da versão (`2.0.0`):**

```text
Lançamento do Em Dia 2.0:
• Nova arquitetura 100% local em SQLite com suporte a contas, cartões, faturas, orçamentos, metas e investimentos.
• Suporte a compras parceladas, recorrências mensais e divisão entre participantes.
• Proteção biométrica e modo privacidade para ocultar valores na tela.
• Exportação e restauração de backup local em JSON.
```

- **Checklist de Assets (Play Store):**
  - Ícone do app: `assets/icon.png` (1024×1024) e `assets/adaptive-icon.png` (1024×1024).
  - Recurso gráfico (Feature Graphic): `1024 × 500` PNG/JPG (gerar antes da publicação).
  - Capturas de tela (Phone): mínimo 2 imagens em proporção 9:16 (ex.: `1080 × 1920`), recomendadas 4–6 telas (Início, Lançamentos, Cartões/Fatura, Orçamentos, Metas, Configurações).

- **Questionário Data Safety (Play Console):**
  - O app coleta ou compartilha algum dos tipos de dados de usuário obrigatórios? **Não**.
  - Todos os dados financeiros são processados e armazenados apenas localmente no dispositivo do usuário.

---

## Apple App Store Connect

- **Nome (máx. 30 caracteres):** `Em Dia`
- **Subtítulo (máx. 30 caracteres):** `Finanças pessoais offline`
- **Categoria principal:** `Finanças`
- **Texto promocional (máx. 170 caracteres):**
  `Controle suas contas, cartões, faturas, orçamentos e metas com privacidade total: 100% local no seu iPhone, sem conta e sem anúncios.`
- **Palavras-chave (máx. 100 caracteres):**
  `finanças,gastos,orçamento,cartão,fatura,controle financeiro,offline,metas,despesas,economia`
- **Descrição:** usar a mesma descrição completa em `pt-BR` da seção Google Play Console acima.
- **Notas da versão (`2.0.0`):** usar as mesmas notas da versão `2.0.0` acima.
- **URL de Política de Privacidade:** `https://emdia-privacidade.netlify.app`
- **URL de Suporte:** `<PREENCHER_COM_URL_SUPORTE_ZION_CODES>`
- **Conformidade de Criptografia (`app.json`):** `ITSAppUsesNonExemptEncryption: false` já configurado em `expo.ios.infoPlist`.
- **Declaração App Privacy:** selecionar **No, we do not collect data from this app** (*Data Not Collected*).
- **Checklist de Screenshots (App Store):**
  - iPhone 6.9" (`1320 × 2868` ou `1290 × 2796`): mínimo 3 telas (recomendado 5–6).
  - iPhone 6.5" (`1284 × 2778` ou `1242 × 2688`): opcional se 6.9" estiver preenchido, recomendado validar no App Store Connect.
