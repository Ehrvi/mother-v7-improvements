# Tutorial: Verificação de Banco de Dados em Produção

**Propósito:** Ensinar Everton a verificar o conteúdo do banco de dados de produção para confirmar que a IA não está "alucinando"  
**Nível:** Intermediário  
**Tempo estimado:** 10-15 minutos  
**Data:** 2026-02-20

---

## 🎯 OBJETIVO

Você aprenderá a:
1. Conectar ao banco de dados TiDB de produção via MySQL CLI
2. Executar queries SQL para verificar dados
3. Contar entries de conhecimento
4. Verificar embeddings e quality scores
5. Validar integridade dos dados

---

## 📋 PRÉ-REQUISITOS

### 1. Informações de Conexão

Você precisa das seguintes informações (disponíveis no Manus Management UI → Settings → Database):

- **Host:** `gateway01.us-west-2.prod.aws.tidbcloud.com`
- **Port:** `4000`
- **Database:** `mother_interface_db`
- **Username:** `<seu_username>.root`
- **Password:** `<sua_senha>`

### 2. Ferramentas Necessárias

**Opção A: MySQL CLI (Recomendado)**
```bash
# Instalar no Ubuntu/Debian
sudo apt-get install mysql-client

# Instalar no macOS
brew install mysql-client

# Instalar no Windows
# Baixar MySQL Installer: https://dev.mysql.com/downloads/installer/
```

**Opção B: MySQL Workbench (GUI)**
- Download: https://dev.mysql.com/downloads/workbench/
- Interface gráfica, mais fácil para iniciantes

**Opção C: DBeaver (GUI, multiplataforma)**
- Download: https://dbeaver.io/download/
- Suporta múltiplos bancos de dados

---

## 🔌 PASSO 1: CONECTAR AO BANCO DE DADOS

### Via MySQL CLI

```bash
mysql -h gateway01.us-west-2.prod.aws.tidbcloud.com \
      -P 4000 \
      -u <username>.root \
      -p \
      --ssl-mode=REQUIRED \
      mother_interface_db
```

**Explicação dos parâmetros:**
- `-h`: Host do banco de dados
- `-P`: Porta (4000 para TiDB)
- `-u`: Username
- `-p`: Solicita senha (digite quando solicitado)
- `--ssl-mode=REQUIRED`: Conexão segura (obrigatório para TiDB)
- `mother_interface_db`: Nome do database

**Exemplo prático:**
```bash
mysql -h gateway01.us-west-2.prod.aws.tidbcloud.com \
      -P 4000 \
      -u 4dXxQjjXzxfQNnp.root \
      -p \
      --ssl-mode=REQUIRED \
      mother_interface_db
```

**Após conectar, você verá:**
```
Enter password: ********
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 123456
Server version: 8.0.11-TiDB-v8.5.0

mysql>
```

---

## 📊 PASSO 2: VERIFICAR ESTRUTURA DO BANCO

### 2.1 Listar Todas as Tabelas

```sql
SHOW TABLES;
```

**Resultado esperado:**
```
+------------------------------+
| Tables_in_mother_interface_db|
+------------------------------+
| cache_entries                |
| knowledge                    |
| learning_patterns            |
| queries                      |
| system_metrics               |
| users                        |
+------------------------------+
6 rows in set (0.05 sec)
```

### 2.2 Ver Estrutura da Tabela `knowledge`

```sql
DESCRIBE knowledge;
```

**Resultado esperado:**
```
+------------------+--------------+------+-----+---------+----------------+
| Field            | Type         | Null | Key | Default | Extra          |
+------------------+--------------+------+-----+---------+----------------+
| id               | int          | NO   | PRI | NULL    | auto_increment |
| title            | varchar(500) | NO   |     | NULL    |                |
| content          | text         | NO   |     | NULL    |                |
| category         | varchar(100) | YES  |     | NULL    |                |
| source           | varchar(50)  | YES  |     | NULL    |                |
| embedding        | json         | YES  |     | NULL    |                |
| quality_score    | int          | YES  |     | NULL    |                |
| confidence_score | int          | YES  |     | NULL    |                |
| created_at       | datetime     | YES  |     | NULL    |                |
| updated_at       | datetime     | YES  |     | NULL    |                |
+------------------+--------------+------+-----+---------+----------------+
```

---

## 🔍 PASSO 3: VERIFICAR CONHECIMENTO

### 3.1 Contar Total de Entries

```sql
SELECT COUNT(*) AS total_entries FROM knowledge;
```

**Resultado esperado (após sync completo):**
```
+---------------+
| total_entries |
+---------------+
|           208 |
+---------------+
```

**Interpretação:**
- **159 entries** (antes do sync GOD-LEVEL)
- **+49 entries** (GOD-LEVEL: PM, IM, FM)
- **= 208 entries** (total esperado)

### 3.2 Contar Entries por Categoria

```sql
SELECT 
  category, 
  COUNT(*) AS count 
FROM knowledge 
GROUP BY category 
ORDER BY count DESC;
```

**Resultado esperado:**
```
+---------------------------+-------+
| category                  | count |
+---------------------------+-------+
| cybersecurity             |    44 |
| lessons_learned           |    26 |
| project_management        |    17 |
| information_management    |    16 |
| file_management           |    16 |
| version_control           |    15 |
| methodologies             |    12 |
| standards                 |    10 |
| ...                       |   ... |
+---------------------------+-------+
```

### 3.3 Contar Entries por Source

```sql
SELECT 
  source, 
  COUNT(*) AS count 
FROM knowledge 
GROUP BY source 
ORDER BY count DESC;
```

**Resultado esperado:**
```
+----------+-------+
| source   | count |
+----------+-------+
| user     |   108 |
| learning |    93 |
| external |     7 |
+----------+-------+
```

**Interpretação:**
- **user:** Conhecimento inserido manualmente (cybersecurity, lessons learned)
- **learning:** Conhecimento aprendido pela IA (GOD-LEVEL docs)
- **external:** Conhecimento de fontes externas (APIs, web scraping)

---

## 🎓 PASSO 4: VERIFICAR CONHECIMENTO GOD-LEVEL

### 4.1 Listar Entries de Project Management

```sql
SELECT 
  id, 
  title, 
  category,
  quality_score 
FROM knowledge 
WHERE title LIKE 'Project Management:%' 
ORDER BY id DESC 
LIMIT 10;
```

**Resultado esperado:**
```
+-----+----------------------------------------------+---------------------+---------------+
| id  | title                                        | category            | quality_score |
+-----+----------------------------------------------+---------------------+---------------+
| 208 | Project Management: KEY TAKEAWAYS            | project_management  |            95 |
| 207 | Project Management: LEADERSHIP IN PROJECT... | leadership          |            95 |
| 206 | Project Management: EARNED VALUE MANAGEMENT  | project_management  |            95 |
| 205 | Project Management: AGILE-SPECIFIC CONCEPTS  | methodologies       |            95 |
| ... | ...                                          | ...                 |           ... |
+-----+----------------------------------------------+---------------------+---------------+
```

### 4.2 Listar Entries de Information Management

```sql
SELECT 
  id, 
  title, 
  category,
  quality_score 
FROM knowledge 
WHERE title LIKE 'Information Management:%' 
ORDER BY id DESC 
LIMIT 10;
```

### 4.3 Listar Entries de File Management

```sql
SELECT 
  id, 
  title, 
  category,
  quality_score 
FROM knowledge 
WHERE title LIKE 'File Management:%' 
ORDER BY id DESC 
LIMIT 10;
```

---

## 🧪 PASSO 5: VERIFICAR EMBEDDINGS

### 5.1 Contar Entries com Embeddings

```sql
SELECT 
  COUNT(*) AS with_embeddings,
  (SELECT COUNT(*) FROM knowledge) AS total,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM knowledge), 2) AS percentage
FROM knowledge 
WHERE embedding IS NOT NULL;
```

**Resultado esperado:**
```
+------------------+-------+------------+
| with_embeddings  | total | percentage |
+------------------+-------+------------+
|              208 |   208 |     100.00 |
+------------------+-------+------------+
```

**Interpretação:**
- **100% coverage** = Todas entries têm embeddings (busca semântica funcionando)
- **< 100%** = Algumas entries sem embeddings (precisa re-sync)

### 5.2 Verificar Tamanho dos Embeddings

```sql
SELECT 
  id,
  title,
  JSON_LENGTH(embedding) AS embedding_dimensions
FROM knowledge 
WHERE embedding IS NOT NULL 
LIMIT 5;
```

**Resultado esperado:**
```
+-----+----------------------------------------------+----------------------+
| id  | title                                        | embedding_dimensions |
+-----+----------------------------------------------+----------------------+
| 204 | Project Management: 1. PMBOK GUIDE 8TH...    |                 1536 |
| 205 | Project Management: 2. PROJECT MANAGEMENT... |                 1536 |
| 206 | Project Management: 3. PROJECT MANAGEMENT... |                 1536 |
| ... | ...                                          |                  ... |
+-----+----------------------------------------------+----------------------+
```

**Interpretação:**
- **1536 dimensions** = OpenAI `text-embedding-3-small` (correto)
- **Outro valor** = Modelo diferente ou erro

---

## 📈 PASSO 6: VERIFICAR QUALITY SCORES

### 6.1 Distribuição de Quality Scores

```sql
SELECT 
  quality_score,
  COUNT(*) AS count
FROM knowledge 
GROUP BY quality_score 
ORDER BY quality_score DESC;
```

**Resultado esperado:**
```
+---------------+-------+
| quality_score | count |
+---------------+-------+
|            95 |    49 |
|            90 |    44 |
|            85 |    26 |
|            80 |    89 |
+---------------+-------+
```

**Interpretação:**
- **95:** GOD-LEVEL knowledge (PM, IM, FM)
- **90:** Cybersecurity knowledge
- **85:** Lessons learned
- **80:** General knowledge

### 6.2 Média de Quality Score

```sql
SELECT 
  AVG(quality_score) AS avg_quality,
  MIN(quality_score) AS min_quality,
  MAX(quality_score) AS max_quality
FROM knowledge;
```

**Resultado esperado:**
```
+-------------+-------------+-------------+
| avg_quality | min_quality | max_quality |
+-------------+-------------+-------------+
|       86.50 |          80 |          95 |
+-------------+-------------+-------------+
```

---

## 🔐 PASSO 7: VERIFICAR INTEGRIDADE DOS DADOS

### 7.1 Verificar Entries Duplicadas (por título)

```sql
SELECT 
  title, 
  COUNT(*) AS count 
FROM knowledge 
GROUP BY title 
HAVING count > 1;
```

**Resultado esperado:**
```
Empty set (0.05 sec)
```

**Interpretação:**
- **Empty set** = Nenhuma duplicata (correto)
- **Rows retornadas** = Duplicatas encontradas (precisa limpeza)

### 7.2 Verificar Entries sem Conteúdo

```sql
SELECT 
  id, 
  title 
FROM knowledge 
WHERE content IS NULL OR content = '';
```

**Resultado esperado:**
```
Empty set (0.05 sec)
```

### 7.3 Verificar Entries sem Categoria

```sql
SELECT 
  id, 
  title 
FROM knowledge 
WHERE category IS NULL OR category = '';
```

**Resultado esperado:**
```
Empty set (0.05 sec)
```

---

## 📅 PASSO 8: VERIFICAR TIMESTAMPS

### 8.1 Entries Mais Recentes

```sql
SELECT 
  id, 
  title, 
  created_at 
FROM knowledge 
ORDER BY created_at DESC 
LIMIT 10;
```

**Resultado esperado:**
```
+-----+----------------------------------------------+---------------------+
| id  | title                                        | created_at          |
+-----+----------------------------------------------+---------------------+
| 208 | File Management: KEY TAKEAWAYS               | 2026-02-20 22:50:00 |
| 207 | File Management: 15. FILE SYNCHRONIZATION    | 2026-02-20 22:49:40 |
| 206 | File Management: 14. CLOUD STORAGE SOLUTIONS | 2026-02-20 22:49:20 |
| ... | ...                                          | ...                 |
+-----+----------------------------------------------+---------------------+
```

### 8.2 Entries por Data

```sql
SELECT 
  DATE(created_at) AS date, 
  COUNT(*) AS count 
FROM knowledge 
GROUP BY DATE(created_at) 
ORDER BY date DESC;
```

**Resultado esperado:**
```
+------------+-------+
| date       | count |
+------------+-------+
| 2026-02-20 |    49 |
| 2026-02-19 |    13 |
| 2026-02-18 |    44 |
| 2026-02-17 |   102 |
+------------+-------+
```

---

## 🔍 PASSO 9: BUSCAR CONHECIMENTO ESPECÍFICO

### 9.1 Buscar por Palavra-Chave

```sql
SELECT 
  id, 
  title, 
  category 
FROM knowledge 
WHERE title LIKE '%OWASP%' OR content LIKE '%OWASP%';
```

### 9.2 Buscar por Categoria

```sql
SELECT 
  id, 
  title, 
  quality_score 
FROM knowledge 
WHERE category = 'cybersecurity' 
ORDER BY quality_score DESC;
```

### 9.3 Buscar Lições Aprendidas

```sql
SELECT 
  id, 
  title, 
  quality_score 
FROM knowledge 
WHERE category = 'lessons_learned' 
ORDER BY id DESC;
```

---

## 🚨 PASSO 10: TROUBLESHOOTING

### Problema 1: Não Consigo Conectar

**Erro:** `ERROR 2003 (HY000): Can't connect to MySQL server`

**Soluções:**
1. Verificar host, port, username, password
2. Verificar firewall (porta 4000 deve estar aberta)
3. Verificar se `--ssl-mode=REQUIRED` está presente
4. Testar conexão com `telnet gateway01.us-west-2.prod.aws.tidbcloud.com 4000`

### Problema 2: Acesso Negado

**Erro:** `ERROR 1045 (28000): Access denied for user`

**Soluções:**
1. Verificar username (deve incluir `.root`)
2. Verificar senha (copiar do Manus Management UI)
3. Verificar se usuário tem permissões no database

### Problema 3: Database Não Encontrado

**Erro:** `ERROR 1049 (42000): Unknown database 'mother_interface_db'`

**Soluções:**
1. Listar databases disponíveis: `SHOW DATABASES;`
2. Verificar nome correto do database
3. Conectar sem especificar database e depois usar `USE mother_interface_db;`

---

## 📚 QUERIES ÚTEIS (CHEAT SHEET)

```sql
-- Contar total de entries
SELECT COUNT(*) FROM knowledge;

-- Contar por categoria
SELECT category, COUNT(*) FROM knowledge GROUP BY category;

-- Contar por source
SELECT source, COUNT(*) FROM knowledge GROUP BY source;

-- Verificar embeddings
SELECT COUNT(*) FROM knowledge WHERE embedding IS NOT NULL;

-- Média de quality score
SELECT AVG(quality_score) FROM knowledge;

-- Entries mais recentes
SELECT id, title, created_at FROM knowledge ORDER BY created_at DESC LIMIT 10;

-- Buscar por palavra-chave
SELECT id, title FROM knowledge WHERE title LIKE '%palavra%';

-- Verificar duplicatas
SELECT title, COUNT(*) FROM knowledge GROUP BY title HAVING COUNT(*) > 1;

-- Entries sem embeddings
SELECT id, title FROM knowledge WHERE embedding IS NULL;

-- Entries com quality score baixo
SELECT id, title, quality_score FROM knowledge WHERE quality_score < 80;
```

---

## ✅ CHECKLIST DE VERIFICAÇÃO

Use este checklist após cada deploy para validar o banco de dados:

- [ ] Conectar ao banco de dados com sucesso
- [ ] Total de entries correto (esperado: 208)
- [ ] Distribuição por categoria correta (cybersecurity: 44, lessons: 26, PM: 17, IM: 16, FM: 16)
- [ ] Distribuição por source correta (user: 108, learning: 93, external: 7)
- [ ] 100% de entries com embeddings
- [ ] Embeddings com 1536 dimensions (OpenAI text-embedding-3-small)
- [ ] Média de quality score >= 85
- [ ] Nenhuma entry duplicada
- [ ] Nenhuma entry sem conteúdo
- [ ] Nenhuma entry sem categoria
- [ ] Timestamps corretos (entries recentes aparecem no topo)

---

## 🎓 PRÓXIMOS PASSOS

Após dominar a verificação básica, você pode:

1. **Aprender SQL avançado:** JOINs, subqueries, window functions
2. **Criar dashboards:** Conectar Power BI, Tableau, Grafana ao TiDB
3. **Automatizar verificações:** Scripts Python/Node.js para validação automática
4. **Monitorar performance:** Analisar query performance com `EXPLAIN`
5. **Backup e restore:** Implementar estratégia de backup regular

---

## 📖 REFERÊNCIAS

- **MySQL Documentation:** https://dev.mysql.com/doc/
- **TiDB Documentation:** https://docs.pingcap.com/tidb/stable
- **SQL Tutorial:** https://www.w3schools.com/sql/
- **MySQL Workbench:** https://www.mysql.com/products/workbench/
- **DBeaver:** https://dbeaver.io/

---

**Autor:** MOTHER v7.0  
**Data:** 2026-02-20  
**Versão:** 1.0  
**Status:** Completo
