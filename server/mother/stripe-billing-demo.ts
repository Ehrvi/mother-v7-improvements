/**
 * stripe-billing-demo.ts — DEMO SOFTWARE — NÃO COMERCIAL
 *
 * ⚠️ AVISO IMPORTANTE — DIRETRIZ DO PROPRIETÁRIO (Everton Garcia, Wizards Down Under):
 * ═══════════════════════════════════════════════════════════════════════════════════
 * ESTE MÓDULO É APENAS DEMONSTRAÇÃO (DEMO SOFTWARE).
 * NÃO ESTÁ CONECTADO a nenhum endpoint de produção.
 * NÃO deve ser importado em production-entry.ts ou a2a-server.ts.
 * NÃO deve ser usado para processar pagamentos reais.
 * NÃO há integração real com a API do Stripe — nenhuma chave de API do Stripe está configurada.
 *
 * STATUS: DEMO-ONLY — NÃO CONECTADO (R33 — Ciclo 191)
 * CONEXÃO PLANEJADA: Apenas após MOTHER atingir Score de Maturidade ≥ 75/100
 *                   e após aprovação explícita do proprietário para comercialização.
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * Conselho C188 Seção 9.4 — Phase 7 — Stripe billing real
 * Base científica:
 *   - PCI DSS v4.0 — Payment Card Industry Data Security Standard
 *   - ISO/IEC 27001:2022 A.5.14 — Information transfer
 *   - Conselho C188 Seção 9.4 — Planos: Starter/Professional/Enterprise
 *
 * Função (DEMO): Demonstra a estrutura de planos e preços para SHMS Geotécnico.
 * Planos: Starter (R$150/sensor), Professional (R$120/sensor), Enterprise (R$90/sensor).
 *
 * @module stripe-billing-demo
 * @version 1.0.0-demo
 * @cycle C191
 * @status DEMO-ONLY — NOT CONNECTED
 * @council C188 Seção 9.4
 */

// ============================================================
// DEMO NOTICE — AVISO DE DEMO
// ============================================================
const DEMO_WARNING = `
⚠️  STRIPE BILLING DEMO — NÃO COMERCIAL — SEM PAGAMENTOS REAIS
Este módulo é demonstração. MOTHER ainda não tem clientes pagantes.
Score de maturidade atual: ~52/100 (alvo para comercialização: ≥75/100)
Proprietário: Everton Garcia, Wizards Down Under
`;

export const DEMO_STATUS = {
  isDemo: true,
  isConnected: false,
  stripeConfigured: false,
  commercialReady: false,
  currentMaturityScore: 52,
  targetMaturityScore: 75,
  reason: 'MOTHER ainda é demo software. Billing real requer Score ≥ 75/100 e aprovação do proprietário.',
  owner: 'Everton Garcia, Wizards Down Under',
  council: 'Conselho C188 Seção 9.4',
} as const;

// ============================================================
// PLANOS E PREÇOS (DEMO — Conselho C188 Seção 9.4)
// ============================================================

export type BillingPlan = 'starter' | 'professional' | 'enterprise';

export interface PlanConfig {
  name: BillingPlan;
  displayName: string;
  pricePerSensorBRL: number;    // R$ por sensor/mês
  maxSensors: number;
  maxAlertsPerDay: number;
  maxApiCallsPerMonth: number;
  features: string[];
  stripeProductId: string;      // DEMO — ID fictício
  stripePriceId: string;        // DEMO — ID fictício
}

/**
 * Planos de preços conforme Conselho C188 Seção 9.4.
 * ⚠️ DEMO ONLY — preços e IDs Stripe são fictícios.
 *
 * Base científica: Conselho C188 Seção 9.4 — pricing model baseado em
 * usage-based billing (sensor count) para SaaS B2B geotécnico.
 */
export const BILLING_PLANS: Record<BillingPlan, PlanConfig> = {
  starter: {
    name: 'starter',
    displayName: 'Starter',
    pricePerSensorBRL: 150,     // R$150/sensor/mês — Conselho C188 Seção 9.4
    maxSensors: 5,
    maxAlertsPerDay: 10,
    maxApiCallsPerMonth: 1000,
    features: [
      'Até 5 sensores IoT',
      'Alertas ICOLD 3-level',
      'Dashboard básico',
      'Suporte por email',
    ],
    stripeProductId: 'prod_DEMO_STARTER_001',   // DEMO — fictício
    stripePriceId: 'price_DEMO_STARTER_001',    // DEMO — fictício
  },
  professional: {
    name: 'professional',
    displayName: 'Professional',
    pricePerSensorBRL: 120,     // R$120/sensor/mês — Conselho C188 Seção 9.4
    maxSensors: 20,
    maxAlertsPerDay: 100,
    maxApiCallsPerMonth: 20000,
    features: [
      'Até 20 sensores IoT',
      'Alertas ICOLD 3-level + SMS',
      'Dashboard avançado + Digital Twin',
      'LSTM predictor',
      'Suporte prioritário',
    ],
    stripeProductId: 'prod_DEMO_PROFESSIONAL_001',  // DEMO — fictício
    stripePriceId: 'price_DEMO_PROFESSIONAL_001',   // DEMO — fictício
  },
  enterprise: {
    name: 'enterprise',
    displayName: 'Enterprise',
    pricePerSensorBRL: 90,      // R$90/sensor/mês — Conselho C188 Seção 9.4
    maxSensors: 999,
    maxAlertsPerDay: 9999,
    maxApiCallsPerMonth: 999999,
    features: [
      'Sensores ilimitados',
      'Alertas multi-canal (email, SMS, webhook)',
      'Dashboard personalizado + Digital Twin',
      'LSTM predictor + LoRA fine-tuning',
      'SLA 99.9%',
      'Suporte dedicado 24/7',
      'Relatórios ISO/IEC 27001',
    ],
    stripeProductId: 'prod_DEMO_ENTERPRISE_001',  // DEMO — fictício
    stripePriceId: 'price_DEMO_ENTERPRISE_001',   // DEMO — fictício
  },
};

// ============================================================
// DEMO FUNCTIONS (NÃO CONECTADAS)
// ============================================================

export interface DemoInvoice {
  invoiceId: string;
  tenantId: string;
  plan: BillingPlan;
  sensorCount: number;
  totalBRL: number;
  period: string;
  status: 'DEMO — NÃO PROCESSADO';
  scientificBasis: string;
}

/**
 * Calcula fatura demo para um tenant.
 * ⚠️ DEMO ONLY — não processa pagamento real, não chama Stripe API.
 *
 * Base científica: Conselho C188 Seção 9.4 — usage-based billing
 */
export function calculateDemoInvoice(
  tenantId: string,
  plan: BillingPlan,
  sensorCount: number,
  period: string = new Date().toISOString().slice(0, 7)
): DemoInvoice {
  console.warn(DEMO_WARNING);
  const planConfig = BILLING_PLANS[plan];
  const totalBRL = planConfig.pricePerSensorBRL * Math.min(sensorCount, planConfig.maxSensors);
  return {
    invoiceId: `INV_DEMO_${tenantId}_${period}`,
    tenantId,
    plan,
    sensorCount,
    totalBRL,
    period,
    status: 'DEMO — NÃO PROCESSADO',
    scientificBasis: 'Conselho C188 Seção 9.4 — usage-based billing para SaaS B2B geotécnico',
  };
}

/**
 * Retorna todos os planos disponíveis.
 * ⚠️ DEMO ONLY — planos fictícios.
 */
export function listDemoPlans(): PlanConfig[] {
  console.warn(DEMO_WARNING);
  return Object.values(BILLING_PLANS);
}

/**
 * Retorna projeção de MRR demo (Monthly Recurring Revenue).
 * ⚠️ DEMO ONLY — projeção fictícia baseada em 3 clientes demo.
 *
 * KPI Conselho C188 Seção 9.5: MRR alvo = R$50.000+
 */
export function getDemoMRRProjection(): {
  currentMRR: number;
  projectedMRR: number;
  targetMRR: number;
  status: string;
} {
  console.warn(DEMO_WARNING);
  return {
    currentMRR: 0,          // DEMO — sem clientes reais
    projectedMRR: 3600,     // DEMO — 3 clientes × ~R$1.200/mês estimado
    targetMRR: 50000,       // Conselho C188 Seção 9.5 — alvo C192
    status: 'DEMO — Sem clientes reais. Score de maturidade: ~52/100 (alvo: ≥75/100)',
  };
}
