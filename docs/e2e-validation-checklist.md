# Checklist de Validação E2E — Android e iOS

> A execução em emulador Android, simulador iOS e dispositivos físicos é **externa ao sandbox Linux** onde os testes unitários e de integração em memória são executados. Este documento registra os pré-requisitos, comandos Maestro e checklist manual para validação em ambiente nativo.

## 1. Pré-requisitos

- **Identificador do app:** `app.zioncodes.emdia` (`expo.android.package` e `expo.ios.bundleIdentifier` em `app.json`).
- **Maestro CLI:** instalado e disponível no `PATH` (`maestro --version`).
- **Android:**
  - Android Studio / SDK com emulador API 33+ iniciado (`adb devices` listando o emulador) ou aparelho físico com depuração USB.
  - Build dev ou release instalado: `npx expo run:android` ou `eas build --platform android`.
- **iOS (macOS):**
  - Xcode com Simulator iniciado (`xcrun simctl list devices booted`) ou aparelho físico provisionado.
  - Build dev ou release instalado: `npx expo run:ios` ou `eas build --platform ios`.

## 2. Execução dos Flows Maestro

Execute os 3 flows em `.maestro/` após instalar o app no emulador/simulador alvo:

```bash
maestro test .maestro/
```

Ou individualmente:

```bash
maestro test .maestro/smoke-navigation.yaml
maestro test .maestro/settings-profile-theme-privacy.yaml
maestro test .maestro/settings-backup-export.yaml
```

Flows cobertos:
- `.maestro/smoke-navigation.yaml`: inicialização do app e navegação entre as 5 abas (`Início`, `Transações`, `Faturas`, `Mais`, `Configurações`).
- `.maestro/settings-profile-theme-privacy.yaml`: abertura da aba `Configurações`, edição e persistência do nome do perfil, alternância de tema (`Escuro` / `Automático`) e alternância do modo privacidade.
- `.maestro/settings-backup-export.yaml`: rolagem até a seção de backup, verificação do aviso de segurança e disparo da exportação de backup.

## 3. Checklist Manual — Android (Emulador / Aparelho)

- [ ] App inicializa sem crash após splash screen e cria/migra o banco SQLite (`PRAGMA user_version = 1`) com owner `EU`.
- [ ] Navegação inferior exibe e alterna corretamente entre `Início`, `Transações`, `Faturas`, `Mais` e `Configurações` respeitando safe area / navigation bar (`edgeToEdgeEnabled: true`).
- [ ] Edição de perfil (`Nome` e cor do avatar) persiste após fechar e reabrir o app.
- [ ] Alternância de tema (`Automático`, `Claro`, `Escuro`) atualiza imediatamente a interface e a barra de status e persiste entre sessões.
- [ ] Modo privacidade (`Ocultar valores`) persiste entre sessões.
- [ ] Bloqueio por biometria (quando biometria está cadastrada no emulador/aparelho): solicita autenticação ao ativar/desativar, bloqueia ao ir para segundo plano e desbloqueia com biometria válida.
- [ ] Exportação de backup abre a folha nativa de compartilhamento do Android com arquivo `emdia-backup-YYYYMMDD-HHmmss.json`.
- [ ] Restauração de backup: selecionar arquivo JSON válido via Document Picker exibe resumo, cria safety backup e restaura dados após confirmação.

## 4. Checklist Manual — iOS (Simulador / Aparelho)

- [ ] App inicializa com `bundleIdentifier` `app.zioncodes.emdia` sem crash e cria/migra o banco SQLite com owner `EU`.
- [ ] Navegação inferior alterna entre as 5 abas respeitando o home indicator / safe area.
- [ ] Edição de perfil (`Nome` e cor do avatar) persiste após encerrar e reabrir o app.
- [ ] Alternância de tema (`Automático`, `Claro`, `Escuro`) atualiza UI e status bar corretamente.
- [ ] Modo privacidade persiste entre sessões.
- [ ] Face ID / Touch ID (habilitado no Simulator via *Features > Face ID > Enrolled*): solicita permissão (`NSFaceIDUsageDescription`), autentica ao ativar/desativar e bloqueia/desbloqueia corretamente.
- [ ] Exportação de backup abre o `UIActivityViewController` (Share Sheet) do iOS com arquivo `emdia-backup-YYYYMMDD-HHmmss.json`.
- [ ] Restauração de backup via Arquivos (`UIDocumentPickerViewController`) exibe resumo, cria safety backup em cache e restaura todos os registros após confirmação.
