# Guia de Construção do Zero - MOTHER v14

**Nível de Dificuldade**: Iniciante Absoluto (QI 70+)  
**Tempo Estimado**: 2-3 horas  
**Pré-requisitos**: Nenhum (tudo será explicado)

---

## Introdução

Este guia ensina como construir o sistema MOTHER v14 do zero, desde a instalação das ferramentas até ter o sistema funcionando no seu computador. Cada passo é explicado em detalhes absolutos, assumindo que você nunca programou antes.

---

## Passo 1: Instalar Ferramentas Necessárias

### 1.1 Instalar Node.js

**O que é Node.js?** É um programa que permite executar código JavaScript no seu computador (não apenas no navegador).

**Como instalar:**

1. Abra seu navegador (Chrome, Firefox, Safari, etc.)
2. Vá para: https://nodejs.org
3. Clique no botão verde grande escrito "Download Node.js (LTS)"
4. Espere o download terminar (arquivo tem ~100MB)
5. Abra o arquivo baixado (duplo-clique)
6. Clique em "Próximo" → "Próximo" → "Instalar" → "Concluir"
7. Feche e abra o terminal/prompt de comando

**Como verificar se instalou corretamente:**

1. Abra o terminal:
   - **Windows**: Pressione `Win + R`, digite `cmd`, pressione Enter
   - **Mac**: Pressione `Cmd + Espaço`, digite `terminal`, pressione Enter
   - **Linux**: Pressione `Ctrl + Alt + T`

2. Digite este comando e pressione Enter:
   ```bash
   node --version
   ```

3. Você deve ver algo como: `v22.13.0`
   - Se vir um número de versão (v22.x.x ou similar), está correto!
   - Se vir "command not found" ou erro, repita a instalação

### 1.2 Instalar pnpm

**O que é pnpm?** É um gerenciador de pacotes (instala bibliotecas de código que outros programadores criaram).

**Como instalar:**

1. No terminal (que você abriu no passo anterior), digite:
   ```bash
   npm install -g pnpm
   ```

2. Pressione Enter e espere (pode demorar 1-2 minutos)

3. Verifique se instalou:
   ```bash
   pnpm --version
   ```

4. Você deve ver algo como: `9.15.4`

### 1.3 Instalar Git

**O que é Git?** É um programa para controlar versões de código (como "Ctrl+Z" infinito para programadores).

**Como instalar:**

1. Vá para: https://git-scm.com/downloads
2. Clique no seu sistema operacional (Windows, Mac, ou Linux)
3. Baixe e instale (clique "Próximo" em tudo)
4. Feche e abra o terminal novamente

**Como verificar:**
```bash
git --version
```

Você deve ver algo como: `git version 2.47.1`

### 1.4 Instalar VS Code (Editor de Código)

**O que é VS Code?** É um programa para escrever e editar código (como Word, mas para programadores).

**Como instalar:**

1. Vá para: https://code.visualstudio.com
2. Clique em "Download"
3. Instale o programa (duplo-clique no arquivo baixado)
4. Abra o VS Code

**Configurar VS Code:**

1. No VS Code, pressione `Ctrl + Shift + X` (Windows/Linux) ou `Cmd + Shift + X` (Mac)
2. Na caixa de busca, digite: `ESLint`
3. Clique em "Install" no primeiro resultado
4. Repita para: `Prettier`, `TypeScript`, `Tailwind CSS IntelliSense`

---

## Passo 2: Baixar o Código do Projeto

### 2.1 Criar Pasta para o Projeto

1. Abra o terminal
2. Digite estes comandos (um por vez, pressione Enter após cada):

**Windows:**
```bash
cd C:\
mkdir Projetos
cd Projetos
```

**Mac/Linux:**
```bash
cd ~
mkdir Projetos
cd Projetos
```

Agora você está dentro da pasta `Projetos`.

### 2.2 Clonar o Repositório GitHub

**O que é clonar?** É baixar todo o código do projeto do GitHub (um site que guarda código) para o seu computador.

1. No terminal, digite:
   ```bash
   git clone https://github.com/Ehrvi/mother-v7-improvements.git
   ```

2. Pressione Enter e espere (pode demorar 2-5 minutos, dependendo da sua internet)

3. Você verá mensagens como:
   ```
   Cloning into 'mother-v7-improvements'...
   remote: Counting objects: 1523, done.
   remote: Compressing objects: 100% (892/892), done.
   ...
   ```

4. Quando terminar, digite:
   ```bash
   cd mother-v7-improvements
   ```

Agora você está dentro da pasta do projeto!

### 2.3 Verificar Estrutura do Projeto

Digite:
```bash
ls
```

(No Windows, use `dir` em vez de `ls`)

Você deve ver algo como:
```
client/
server/
drizzle/
node_modules/
package.json
README.md
...
```

Se você vê esses arquivos/pastas, está correto!

---

## Passo 3: Instalar Dependências do Projeto

### 3.1 O que são Dependências?

Dependências são bibliotecas de código que outros programadores criaram e que o projeto MOTHER usa. Por exemplo:
- `react` - para criar a interface visual
- `express` - para criar o servidor web
- `drizzle-orm` - para falar com o banco de dados

### 3.2 Instalar Todas as Dependências

1. Certifique-se de que você está na pasta do projeto (veja "Passo 2.3")

2. Digite:
   ```bash
   pnpm install
   ```

3. Pressione Enter e **ESPERE** (isso pode demorar 5-10 minutos!)

4. Você verá MUITAS mensagens passando na tela. Isso é normal!

5. Quando terminar, você verá algo como:
   ```
   Progress: resolved 1523, reused 1423, downloaded 100, added 1523, done
   ```

6. Verifique se a pasta `node_modules` foi criada:
   ```bash
   ls
   ```

Se você vê `node_modules/` na lista, está correto!

---

## Passo 4: Configurar Variáveis de Ambiente

### 4.1 O que são Variáveis de Ambiente?

São configurações secretas que o projeto precisa para funcionar, como:
- Senha do banco de dados
- Chaves de API (para usar serviços externos)
- URLs de serviços

### 4.2 Criar Arquivo `.env`

1. No VS Code, abra a pasta do projeto:
   - Clique em `File` → `Open Folder`
   - Navegue até `C:\Projetos\mother-v7-improvements` (Windows) ou `~/Projetos/mother-v7-improvements` (Mac/Linux)
   - Clique em "Select Folder"

2. No VS Code, clique em `File` → `New File`

3. Salve o arquivo como `.env` (com o ponto na frente!)
   - Clique em `File` → `Save As`
   - Nome do arquivo: `.env`
   - Salvar na pasta raiz do projeto

4. Cole este conteúdo no arquivo `.env`:

```bash
# Database
DATABASE_URL="mysql://user:password@host:port/database"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
OAUTH_SERVER_URL="https://api.manus.im"
VITE_OAUTH_PORTAL_URL="https://auth.manus.im"

# Owner Info
OWNER_OPEN_ID="Mtbbro8K87S6VUA2A2hq6X"
OWNER_NAME="Everton Luis Garcia"

# Manus APIs
BUILT_IN_FORGE_API_URL="https://api.manus.im"
BUILT_IN_FORGE_API_KEY="your-manus-api-key"
VITE_FRONTEND_FORGE_API_KEY="your-frontend-api-key"
VITE_FRONTEND_FORGE_API_URL="https://api.manus.im"

# OpenAI
OPENAI_API_KEY="sk-your-openai-api-key"

# App Config
VITE_APP_ID="your-app-id"
VITE_APP_TITLE="MOTHER v14"
VITE_APP_LOGO="/logo.png"
```

5. Salve o arquivo (`Ctrl + S` ou `Cmd + S`)

### 4.3 Obter Valores Reais para as Variáveis

**IMPORTANTE**: Os valores acima são exemplos. Você precisa substituir pelos valores reais:

#### DATABASE_URL

1. Vá para: https://tidbcloud.com
2. Crie uma conta grátis (se não tiver)
3. Crie um novo cluster (clique em "Create Cluster")
4. Escolha "Serverless" (é grátis)
5. Aguarde 2-3 minutos até o cluster estar pronto
6. Clique em "Connect"
7. Copie a string de conexão (começa com `mysql://`)
8. Cole no `.env` substituindo `mysql://user:password@host:port/database`

#### OPENAI_API_KEY

1. Vá para: https://platform.openai.com/api-keys
2. Faça login (ou crie uma conta)
3. Clique em "Create new secret key"
4. Copie a chave (começa com `sk-`)
5. Cole no `.env` substituindo `sk-your-openai-api-key`

**ATENÇÃO**: A API da OpenAI é paga! Você precisará adicionar um cartão de crédito. O custo típico é ~$5-10/mês de uso normal.

#### Outras Variáveis

As outras variáveis (`BUILT_IN_FORGE_API_KEY`, `VITE_FRONTEND_FORGE_API_KEY`, etc.) são específicas da plataforma Manus. Se você não tem acesso à plataforma Manus, pode:

**Opção 1**: Pedir as chaves ao dono do projeto (Everton)

**Opção 2**: Comentar essas linhas (adicione `#` no início de cada linha) e o sistema funcionará parcialmente (sem algumas features avançadas)

---

## Passo 5: Inicializar o Banco de Dados

### 5.1 O que é Banco de Dados?

É onde o sistema guarda informações permanentes, como:
- Usuários cadastrados
- Conhecimento aprendido
- Histórico de conversas

### 5.2 Criar Tabelas no Banco de Dados

1. No terminal, certifique-se de que você está na pasta do projeto

2. Digite:
   ```bash
   pnpm db:push
   ```

3. Pressione Enter e espere (1-2 minutos)

4. Você verá mensagens como:
   ```
   Generating migrations...
   Applying migrations...
   ✓ Migrations applied successfully
   ```

5. Se você vê "✓ Migrations applied successfully", está correto!

### 5.3 Verificar Tabelas Criadas

1. Volte para o TiDB Cloud (https://tidbcloud.com)
2. Clique no seu cluster
3. Clique em "SQL Editor"
4. Digite:
   ```sql
   SHOW TABLES;
   ```
5. Clique em "Run"

Você deve ver tabelas como:
- `user`
- `knowledge`
- `query`
- `cache`
- `system_config`

Se você vê essas tabelas, o banco de dados está pronto!

---

## Passo 6: Executar o Servidor Local

### 6.1 Iniciar o Servidor

1. No terminal, digite:
   ```bash
   pnpm dev
   ```

2. Pressione Enter

3. Você verá mensagens como:
   ```
   Starting dev server...
   [OAuth] Initialized with baseURL: https://api.manus.im
   Server listening on http://localhost:3000
   ```

4. **NÃO FECHE O TERMINAL!** O servidor precisa ficar rodando.

### 6.2 Abrir o Sistema no Navegador

1. Abra seu navegador (Chrome, Firefox, etc.)

2. Digite na barra de endereço:
   ```
   http://localhost:3000
   ```

3. Pressione Enter

4. Você deve ver a interface do MOTHER v14!

**Se você vê a interface, PARABÉNS! O sistema está funcionando!** 🎉

---

## Passo 7: Verificar Funcionamento

### 7.1 Fazer Login

1. Na interface, clique em "Login"
2. Você será redirecionado para a página de autenticação Manus
3. Faça login com sua conta Manus (ou crie uma conta)
4. Você será redirecionado de volta para o MOTHER v14

### 7.2 Testar uma Query

1. Na caixa de texto, digite:
   ```
   Hello MOTHER v14, are you working?
   ```

2. Pressione Enter ou clique em "Send"

3. Aguarde 2-5 segundos

4. Você deve receber uma resposta do MOTHER!

**Se você recebeu uma resposta, o sistema está 100% funcional!** ✅

---

## Passo 8: Parar o Servidor

Quando você quiser parar o servidor:

1. Vá para o terminal onde o servidor está rodando
2. Pressione `Ctrl + C` (Windows/Linux) ou `Cmd + C` (Mac)
3. O servidor vai parar

Para iniciar novamente:
```bash
pnpm dev
```

---

## Problemas Comuns e Soluções

### Problema 1: "command not found: node"

**Solução:**
1. Reinstale o Node.js (Passo 1.1)
2. Feche e abra o terminal novamente
3. Tente novamente

### Problema 2: "ECONNREFUSED" ao iniciar o servidor

**Solução:**
1. Verifique se o `DATABASE_URL` no `.env` está correto
2. Verifique se o TiDB Cloud cluster está rodando
3. Tente conectar ao banco de dados manualmente no TiDB Cloud SQL Editor

### Problema 3: "Invalid API key" (OpenAI)

**Solução:**
1. Verifique se o `OPENAI_API_KEY` no `.env` está correto
2. Vá para https://platform.openai.com/api-keys e verifique se a chave está ativa
3. Certifique-se de que você tem créditos na conta OpenAI

### Problema 4: Servidor inicia mas interface não carrega

**Solução:**
1. Verifique se você está acessando `http://localhost:3000` (não `https`)
2. Tente limpar o cache do navegador (`Ctrl + Shift + Delete`)
3. Tente outro navegador

### Problema 5: "Port 3000 is already in use"

**Solução:**
1. Outro programa está usando a porta 3000
2. Pare o outro programa ou mude a porta:
   - Abra `vite.config.ts`
   - Procure por `port: 3000`
   - Mude para `port: 3001` (ou outra porta)
   - Salve e reinicie o servidor

---

## Próximos Passos

Agora que você tem o sistema funcionando localmente, você pode:

1. **Explorar o código** - Abra os arquivos no VS Code e veja como funciona
2. **Ler a documentação técnica** - Veja `GUIA-02-DOCUMENTACAO-TECNICA.md`
3. **Rodar os testes** - Veja `GUIA-03-TESTES.md`
4. **Fazer deploy** - Veja `GUIA-04-DEPLOY-GCLOUD.md`

---

## Resumo dos Comandos

Aqui está uma lista rápida de todos os comandos que você usou:

```bash
# Verificar instalações
node --version
pnpm --version
git --version

# Clonar projeto
git clone https://github.com/Ehrvi/mother-v7-improvements.git
cd mother-v7-improvements

# Instalar dependências
pnpm install

# Inicializar banco de dados
pnpm db:push

# Iniciar servidor
pnpm dev

# Parar servidor
Ctrl + C (ou Cmd + C no Mac)
```

---

## Glossário de Termos

- **Node.js**: Programa que executa JavaScript no computador
- **pnpm**: Gerenciador de pacotes (instala bibliotecas)
- **Git**: Controle de versões de código
- **VS Code**: Editor de código
- **Terminal**: Janela onde você digita comandos
- **Repository**: Pasta com código no GitHub
- **Clone**: Baixar código do GitHub
- **Dependencies**: Bibliotecas de código que o projeto usa
- **Environment Variables**: Configurações secretas
- **Database**: Onde o sistema guarda informações
- **Server**: Programa que responde a requisições web
- **Port**: Número que identifica um serviço (ex: 3000)
- **localhost**: Seu próprio computador
- **API Key**: Chave secreta para usar serviços externos

---

**Autor**: Manus AI  
**Data**: 2026-02-20  
**Versão**: 1.0  
**Nível**: Iniciante Absoluto (QI 70+)
