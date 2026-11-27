# Política de Privacidade — Em Dia

**Última atualização:** 27 de novembro de 2026  
**Versão do aplicativo:** 2.0.0  
**Desenvolvedor:** Zion Codes (`app.zioncodes.emdia`)

O **Em Dia** é um aplicativo de controle financeiro pessoal projetado com arquitetura **100% local (offline-first)**. Sua privacidade é garantida por design: todos os seus dados permanecem exclusivamente no seu dispositivo.

## 1. Dados armazenados e local de armazenamento

Todas as informações registradas no aplicativo — incluindo contas, cartões, transações, parcelas, faturas, orçamentos, metas, investimentos, preferências de tema/privacidade e nome de perfil — são gravadas **exclusivamente no armazenamento interno do seu aparelho** (banco de dados local SQLite e armazenamento chave-valor do sistema).

- Não exigimos criação de conta, login ou cadastro de e-mail/CPF.
- Não mantemos servidores remotos para receber, processar ou armazenar seus dados financeiros.
- Não enviamos, vendemos, alugamos ou compartilhamos qualquer dado com terceiros.

## 2. Coleta automática, telemetria e publicidade

O **Em Dia** **não** utiliza:
- Ferramentas de analytics, rastreamento de uso ou telemetria;
- SDKs de publicidade ou redes de anúncios;
- Cookies ou identificadores de rastreamento entre aplicativos.

## 3. Biometria e segurança no dispositivo

O aplicativo oferece bloqueio opcional por autenticação biométrica (Face ID, Touch ID ou impressão digital) por meio da API nativa do sistema operacional (`expo-local-authentication`).

- A verificação biométrica é realizada inteiramente pelo sistema operacional (Android ou iOS).
- O **Em Dia** **não** acessa, captura, armazena ou transmite dados biométricos.

## 4. Backup e restauração manual

O aplicativo permite exportar e restaurar backups em arquivo JSON diretamente sob seu controle manual:

- A exportação utiliza a interface nativa de compartilhamento/salvamento do sistema operacional para que você escolha onde guardar o arquivo.
- A restauração lê apenas o arquivo selecionado explicitamente por você no seletor de documentos do sistema.
- No Android, o backup automático em nuvem do sistema operacional é desativado (`allowBackup: false`) para evitar cópias não autorizadas dos dados financeiros locais.

## 5. Retenção e exclusão de dados

Como todos os dados ficam apenas no seu aparelho, você tem controle total sobre eles a qualquer momento:
- Ao limpar os dados do aplicativo nas configurações do sistema ou desinstalar o **Em Dia**, todas as informações armazenadas localmente são removidas de forma permanente (exceto arquivos de backup que você tenha exportado manualmente para fora do app).

## 6. Alterações nesta política

Eventuais atualizações desta Política de Privacidade serão publicadas nesta página com a respectiva data de revisão.

## 7. Contato

Em caso de dúvidas sobre esta Política de Privacidade ou sobre o funcionamento do **Em Dia**, entre em contato com a **Zion Codes** através dos canais oficiais listados na página do aplicativo na Google Play Store ou Apple App Store.
