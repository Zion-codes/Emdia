# Runbook de Release EAS e Lojas — Em Dia v2.0.0

Este guia descreve o processo completo de build nativo via **Expo Application Services (EAS)**, gerenciamento seguro de credenciais e distribuição em faixa de teste (**Google Play Teste Interno** e **Apple TestFlight**) antes da liberação pública em produção.

---

## 1. Pré-requisitos

1. Conta Expo/EAS com acesso ao projeto (`app.zioncodes.emdia`).
2. Conta **Google Play Console** (com o app criado para o package `app.zioncodes.emdia`).
3. Conta **Apple Developer Program** e **App Store Connect** (com o App ID `app.zioncodes.emdia` registrado).
4. Política de Privacidade publicada em URL HTTPS pública a partir de [docs/privacy-policy/index.html](./privacy-policy/index.html) e preenchida nas duas lojas.
5. Sessão autenticada no EAS CLI:
   ```bash
   npx eas-cli login
   ```
6. Caso `extra.eas.projectId` ainda não esteja vinculado em `app.json`, vincular o projeto uma única vez:
   ```bash
   npx eas-cli init
   ```

---

## 2. Credenciais e Assinatura (Android e iOS)

Todas as credenciais de assinatura devem ser gerenciadas remotamente pelo EAS. **Nunca** versione arquivos `.jks`, `.keystore`, `.p8`, `.p12`, `.mobileprovision` ou `google-play-service-account.json` no repositório (todos já estão listados no `.gitignore`).

### Android (AAB)
- O EAS gera e armazena o **Upload Keystore** automaticamente no primeiro build `production`, ou você pode configurar previamente via:
  ```bash
  npx eas-cli credentials --platform android
  ```
- Para submissão automatizada na Play Console via `eas submit`, configure uma **Service Account JSON** do Google Cloud com permissão de lançamento no Play Console e informe o caminho apenas localmente ou via segredo do EAS (`GOOGLE_SERVICES_ACCOUNT_JSON` / prompt interativo do `eas submit`), sem gravar no Git.

### iOS (IPA)
- O EAS gerencia o **Apple Distribution Certificate** e o **App Store Provisioning Profile** para `app.zioncodes.emdia`:
  ```bash
  npx eas-cli credentials --platform ios
  ```
- O versionamento automático está configurado em `eas.json` com `"appVersionSource": "remote"` e `"autoIncrement": true` no perfil `production` (incrementando `versionCode` no Android e `buildNumber` no iOS a cada build de produção).

---

## 3. Perfis de Build (`eas.json`)

| Perfil | Finalidade | Formato |
| --- | --- | --- |
| `development` | Dev Client para testes locais em dispositivo físico | APK (Android) / Ad-hoc (iOS) |
| `preview` | Homologação interna rápida | APK (Android) / Internal (iOS) |
| `production` | Distribuição nas lojas | AAB (Android) / Store IPA (iOS) |

---

## 4. Geração dos Builds de Produção

Antes de disparar os builds, valide a qualidade local:

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
```

Gerar builds de produção:

```bash
npm run eas:build:prod:android
npm run eas:build:prod:ios
```

Ou ambos simultaneamente:

```bash
npm run eas:build:prod
```

---

## 5. Distribuição Inicial em Faixa de Teste

### Google Play Console — Teste Interno (`internal`)
O perfil `submit.production.android` em `eas.json` já aponta para `"track": "internal"` e `"releaseStatus": "draft"`:

```bash
npm run eas:submit:android
```

1. No Google Play Console, acesse **Teste > Teste interno**.
2. Revise o rascunho criado, adicione os testadores internos e publique apenas para a faixa interna.
3. Valide instalação, SQLite, biometria, backup/restauração e telas principais em aparelho físico.

### Apple App Store Connect — TestFlight
```bash
npm run eas:submit:ios
```

1. Aguarde o processamento do build no App Store Connect > **TestFlight**.
2. Confirme a declaração de criptografia (já marcada como `ITSAppUsesNonExemptEncryption: false` em `app.json`).
3. Distribua para testadores internos/externos no TestFlight e valide em iPhone físico (incluindo Face ID e backup/restauração).

---

## 6. Promoção para Produção Pública

Somente após aprovação nos testes internos (Play Console + TestFlight):
1. Confirme que os metadados em [docs/store/store-listing-pt-br.md](./store/store-listing-pt-br.md), screenshots, Feature Graphic (1024×500) e URL da Política de Privacidade estão completos nas duas lojas.
2. No Google Play Console, promova a versão validada de **Teste interno** para **Produção**.
3. No App Store Connect, selecione o build validado no TestFlight e envie para revisão da App Store (*Submit for Review*).

---

## 7. Passo a passo dos comandos e necessidade de cada um

Esta seção resume todos os comandos do fluxo de qualidade, publicação da política de privacidade e pipeline EAS (mantido apenas no Git até o momento em que você decidir publicar nas lojas).

### A. Validação local (obrigatória antes de qualquer release)

1. `npm run typecheck` (`tsc --noEmit`)
   - **Necessidade:** garante zero erros de tipagem TypeScript antes de compilar código nativo no EAS.
2. `npm run lint` (`eslint .`)
   - **Necessidade:** valida regras de estilo, hooks do React e retornos explícitos nas camadas críticas.
3. `npm run format:check` (`prettier --check .`)
   - **Necessidade:** garante formatação padronizada em JSON, TS/TSX e HTML (como `docs/privacy-policy/index.html`).
4. `npm test` (`jest --coverage`)
   - **Necessidade:** executa a suíte de testes unitários e de integração garantindo 100% de cobertura antes de gerar builds ou publicar.

### B. Política de Privacidade no Netlify

O arquivo [netlify.toml](../netlify.toml) já aponta `publish = "docs/privacy-policy"` e o projeto `emdia-privacidade` (`siteId`: `46da7a24-5c34-46b7-8f97-97678fc26971`) já está criado no painel [app.netlify.com/projects/emdia-privacidade](https://app.netlify.com/projects/emdia-privacidade), com URL `https://emdia-privacidade.netlify.app`.

1. **Publicação manual direta (sem vínculo Git):**
   ```bash
   npx netlify-cli deploy --prod --dir=docs/privacy-policy --site 46da7a24-5c34-46b7-8f97-97678fc26971
   ```
   - **Necessidade:** envia apenas a pasta estática `docs/privacy-policy` para produção no Netlify e coloca a página no ar imediatamente (útil se você não quiser conectar o repositório GitHub no Netlify).
2. **Publicação contínua via Git (alternativa no painel):**
   - No painel do projeto `emdia-privacidade`, conecte o repositório `ze-fernando/emdia` na branch `main`.
   - **Necessidade:** sempre que `docs/privacy-policy/index.html` for atualizado na `main`, o Netlify lê o `netlify.toml` e republica automaticamente.

### C. Pipeline EAS (quando decidir subir nas lojas)

1. `npx eas-cli login`
   - **Necessidade:** autentica sua sessão local na conta Expo/EAS que será dona dos builds e credenciais.
2. `npx eas-cli init`
   - **Necessidade:** cria/vincula o projeto no EAS e grava `extra.eas.projectId` em `app.json` (pré-requisito para qualquer `eas build` ou `eas submit`).
3. `npx eas-cli credentials --platform android` e `npx eas-cli credentials --platform ios`
   - **Necessidade:** gera e armazena remotamente nos servidores do EAS a **Upload Keystore** (Android) e o **Distribution Certificate + Provisioning Profile** (iOS), evitando versionar chaves privadas no Git.
4. `npm run eas:build:dev`
   - **Necessidade:** gera o Development Client (APK Android / ad-hoc iOS) para testar módulos nativos (`expo-sqlite`, `expo-local-authentication`, `expo-sharing`) em aparelho físico durante o desenvolvimento.
5. `npm run eas:build:preview`
   - **Necessidade:** gera builds internos de homologação (APK no Android e distribuição interna no iOS) para validar o app compilado fora da loja.
6. `npm run eas:build:prod:android` e `npm run eas:build:prod:ios`
   - **Necessidade:** gera os artefatos finais de loja (`.aab` assinado para Play Store e `.ipa` para App Store) usando `"appVersionSource": "remote"` e `"autoIncrement": true` para incrementar `versionCode` e `buildNumber` automaticamente.
7. `npm run eas:submit:android`
   - **Necessidade:** envia o `.aab` gerado para a faixa `internal` (`draft`) da Google Play Console; exige conta Play Console ativa e chave Service Account JSON informada localmente ou via segredo do EAS.
8. `npm run eas:submit:ios`
   - **Necessidade:** envia o `.ipa` gerado para o **TestFlight** no App Store Connect; exige conta Apple Developer Program ativa e App ID `app.zioncodes.emdia` registrado.
