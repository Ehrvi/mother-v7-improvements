/**
 * Knowledge injection — Ciclo 184-WIF
 * Entries: R19 (WIF obrigatório), MASTER PROMPT V55.0 (checklist BD)
 */
const mysql = require('mysql2/promise');

const url = process.env.DATABASE_URL || '';
const urlObj = new URL(url.replace('mysql://', 'http://'));

const entries = [
  {
    title: 'R19 (C184-WIF) — WIF obrigatório, SA key proibida em GitHub Actions',
    content: 'R19 adicionada em C184-WIF: GitHub Actions DEVE usar Workload Identity Federation (WIF) para autenticacao GCP. Chaves SA estaticas (JSON) sao PROIBIDAS. GCP_SA_KEY foi eliminado permanentemente. Novos workflows DEVEM usar google-github-actions/auth@v2 com workload_identity_provider: projects/233196174701/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider e service_account: mother-cloudrun-sa@mothers-library-mcp.iam.gserviceaccount.com. Workflow DEVE declarar permissions: id-token: write. PAT do GitHub para operacoes de workflow DEVE ter escopo workflow e ser armazenado no GCP Secret Manager como mother-github-pat-workflow. Base cientifica: OIDC RFC 8705 (2020), NIST SP 800-63B (2017), SPIFFE/SVID (2018).',
    domain: 'rules',
    category: 'security',
    source: 'wif_c184'
  },
  {
    title: 'MASTER PROMPT V55.0 — Protocolo Anti-Amnesia com checklist de internalizacao do BD',
    content: 'MASTER PROMPT V55.0 criado em C184-WIF. Principal mudanca: Passo 1 do Protocolo Anti-Amnesia V55.0 reforcado com checklist de internalizacao obrigatoria do BD. O agente DEVE verificar mentalmente apos check_knowledge.cjs: (1) GCP_SA_KEY deletado e WIF ativo, (2) QueryComplexity enum em dgm-cycle3-additions.ts, (3) RLVR 5 componentes com pesos, (4) DGM 3/3 ciclos readyForAutoMerge=true, (5) G-Eval 82.0/100 meta >85. R19 adicionada. NC-WIF-001 encerrada. BK-003 resolvido. TODO-ROADMAP V9 referenciado. AWAKE V261 referenciado. Commit mais recente: 93bdc41.',
    domain: 'protocol',
    category: 'initialization',
    source: 'wif_c184'
  }
];

async function main() {
  const conn = await mysql.createConnection({
    host: urlObj.hostname,
    port: parseInt(urlObj.port) || 3306,
    user: urlObj.username,
    password: urlObj.password,
    database: urlObj.pathname.slice(1).split('?')[0],
    ssl: { rejectUnauthorized: false }
  });

  console.log('=== Injecao de conhecimento C184-WIF ===');
  
  for (const e of entries) {
    const [existing] = await conn.execute('SELECT id FROM knowledge WHERE title = ?', [e.title]);
    if (existing.length > 0) {
      console.log('  SKIP (ja existe):', e.title.substring(0, 60));
      continue;
    }
    await conn.execute(
      'INSERT INTO knowledge (title, content, domain, category, source) VALUES (?, ?, ?, ?, ?)',
      [e.title, e.content, e.domain, e.category, e.source]
    );
    console.log('  OK:', e.title.substring(0, 60));
  }

  const [all] = await conn.execute('SELECT id, title, domain FROM knowledge ORDER BY id');
  console.log('\n=== BD completo (' + all.length + ' entradas) ===');
  for (const r of all) {
    console.log('  ID ' + r.id + ' [' + r.domain + '] ' + r.title.substring(0, 65));
  }

  await conn.end();
}

main().catch(e => {
  console.error('Erro:', e.message);
  process.exit(1);
});
