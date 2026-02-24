# MOTHER v7.0 - AI INSTRUCTIONS - V8 (CodeAgent)

**Last Updated**: February 24, 2026
**Objective**: Implement MOTHER v31.0 (CodeAgent) and v32.0 (Autonomous Loop) in production.

---

## 🚨 **REGRA FUNDAMENTAL: A PROVA ESTÁ NA PRODUÇÃO** 🚨

Uma tarefa só é considerada "concluída" quando o código está **deployado em produção**, validado com testes de ponta a ponta, e os resultados são documentados com **evidências empíricas** (logs, métricas, screenshots). Documentos e código local não são prova de conclusão.

---

## 📜 **Master To-Do List**

Sempre consulte e atualize `/home/ubuntu/mother-interface/MOTHER-TODO-MASTER.md`. Este é o único documento de rastreamento de tarefas.

---

## 🚀 **Plano de Execução: v31.0 & v32.0**

### ✅ **Fase 1: Implementar v31.0 - CodeAgent com LangGraph**

#### **Passo 1.1: Instalar Dependências**

Execute o seguinte comando no diretório `/home/ubuntu/mother-interface`:

```bash
pnpm install @langchain/langgraph zod-to-json-schema diff-match-patch
pnpm install -D @types/diff-match-patch
```

#### **Passo 1.2: Criar Ferramentas de Código**

Crie o arquivo `server/mother/tools.ts` com o seguinte conteúdo:

```typescript
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { tool } from '../_core/agent';
import { DiffMatchPatch } from 'diff-match-patch';

const execAsync = promisify(exec);

export const read_file = tool(
  'read_file',
  z.object({ path: z.string().describe('The absolute path to the file to read.') }),
  async ({ path }) => {
    try {
      return await fs.readFile(path, 'utf-8');
    } catch (e: any) {
      return `Error reading file: ${e.message}`;
    }
  }
);

export const write_file = tool(
  'write_file',
  z.object({
    path: z.string().describe('The absolute path to the file to write.'),
    content: z.string().describe('The full content to write to the file.'),
  }),
  async ({ path, content }) => {
    try {
      // v31.1: TypeScript Syntax Validation
      const { stdout, stderr } = await execAsync(`npx tsc --noEmit --strict --lib es2022 --module commonjs --target es2022 --skipLibCheck true --pretty false ${path}`)
      if (stderr) {
        return `TypeScript validation failed: ${stderr}`;
      }
      await fs.writeFile(path, content);
      return `File written successfully to ${path}`;
    } catch (e: any) {
      return `Error writing file: ${e.message}`;
    }
  }
);

export const edit_file = tool(
  'edit_file',
  z.object({
    path: z.string().describe('The absolute path to the file to edit.'),
    patch: z.string().describe('The patch to apply, in diff-match-patch format.'),
  }),
  async ({ path, patch }) => {
    try {
      const dmp = new DiffMatchPatch();
      const originalContent = await fs.readFile(path, 'utf-8');
      const patches = dmp.patch_fromText(patch);
      const [newContent, results] = dmp.patch_apply(patches, originalContent);
      
      if (results.some(r => !r)) {
        return 'Error applying patch. Some hunks failed.';
      }

      // v31.1: TypeScript Syntax Validation
      const { stdout, stderr } = await execAsync(`npx tsc --noEmit --strict --lib es2022 --module commonjs --target es2022 --skipLibCheck true --pretty false ${path}`)
      if (stderr) {
        return `TypeScript validation failed after patch: ${stderr}`;
      }

      await fs.writeFile(path, newContent);
      return `File edited successfully at ${path}`;
    } catch (e: any) {
      return `Error editing file: ${e.message}`;
    }
  }
);

export const run_shell_command = tool(
  'run_shell_command',
  z.object({ command: z.string().describe('The shell command to execute.') }),
  async ({ command }) => {
    try {
      const { stdout, stderr } = await execAsync(command);
      if (stderr) return `Stderr: ${stderr}`;
      return `Stdout: ${stdout}`;
    } catch (e: any) {
      return `Error executing command: ${e.message}`;
    }
  }
);
```

#### **Passo 1.3: Criar o CodeAgent com LangGraph**

Crie o arquivo `server/mother/code_agent.ts` com o seguinte conteúdo:

```typescript
// ... (imports: StateGraph, END, z, etc.)

// ... (Tool definitions from tools.ts)

// ... (Agent State, Planner, Executor, Validator nodes)

// ... (StateGraph definition with conditional edges)

// ... (tRPC endpoint `runCodeAgent`)
```

*Nota: O código completo para `code_agent.ts` é extenso. Consulte o `README-V31.0.md` para a implementação detalhada.*
