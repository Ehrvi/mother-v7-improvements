/**
 * TenantDashboard.tsx — Multi-Tenant Admin Dashboard
 *
 * Premium admin-level view showing all companies/contracts (multi-tenant).
 * Sits between SHMS dashboard and MOTHER main screen.
 *
 * Architecture:
 * - Fetches from GET /api/shms/v2/admin/tenants
 * - KPI cards with global summary (Grafana/Datadog pattern)
 * - Tenant cards with health indicators, contract metadata, structure counts
 * - Click-through to SHMS dashboard for each tenant
 *
 * Scientific basis:
 * - Weissman & Bobrowski (2009) SIGMOD — Multi-tenant metadata aggregation
 * - Few (2013) — Dashboard design: KPIs first, details on demand
 * - Nielsen (1994) #8 — Aesthetic and minimalist design
 * - ISO 13374-1:2003 — Condition monitoring health indicators
 * - OWASP A01:2021 — Access Control (admin-only view)
 *
 * Design system: Uses unified oklch tokens from index.css
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Shield, Activity, Gauge, AlertTriangle,
  ChevronRight, ArrowLeft, Wallet, MapPin, Clock,
  TrendingUp, Server, Radio,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────
interface TenantStructureSummary {
  id: string; name: string; type: string; location: string;
  healthIndex: number; shmsLevel: number; sensorCount: number;
  alertStatus: 'green' | 'yellow' | 'red';
}
interface TenantData {
  tenantId: string; tenantName: string;
  plan: 'basic' | 'professional' | 'enterprise';
  maxStructures: number; maxSensorsPerStructure: number;
  cnpj?: string; contactEmail?: string; contactPhone?: string;
  sector?: string; contractStart?: string; contractEnd?: string;
  contractValue?: number; status?: string; region?: string;
  structureCount: number; sensorCount: number;
  avgHealthIndex: number;
  overallStatus: 'green' | 'yellow' | 'red';
  alertCounts: { green: number; yellow: number; red: number };
  structures: TenantStructureSummary[];
}
interface AdminResponse {
  tenants: TenantData[];
  total: number;
  globalSummary: {
    totalStructures: number; totalSensors: number;
    avgHealthIndex: number; totalContractValue: number;
    activeTenants: number; trialTenants: number;
  };
}

// ─── Status badge colors (oklch) ──────────────────────────────────────────
const STATUS_COLORS = {
  green:  { bg: 'oklch(25% 0.06 145)', fg: 'oklch(72% 0.18 145)', border: 'oklch(72% 0.18 145 / 0.3)' },
  yellow: { bg: 'oklch(30% 0.06 70)',  fg: 'oklch(75% 0.14 70)',  border: 'oklch(75% 0.14 70 / 0.3)' },
  red:    { bg: 'oklch(25% 0.08 25)',  fg: 'oklch(65% 0.22 25)',  border: 'oklch(65% 0.22 25 / 0.3)' },
};

const PLAN_BADGES: Record<string, { label: string; bg: string; fg: string }> = {
  enterprise:   { label: 'Enterprise', bg: 'oklch(25% 0.08 290)', fg: 'oklch(75% 0.16 285)' },
  professional: { label: 'Professional', bg: 'oklch(25% 0.06 200)', fg: 'oklch(72% 0.14 195)' },
  basic:        { label: 'Basic', bg: 'oklch(20% 0.03 280)', fg: 'oklch(62% 0.02 280)' },
};

const SECTOR_ICONS: Record<string, string> = {
  mining: '⛏️', hydroelectric: '💧', infrastructure: '🏗️', government: '🏛️', consulting: '📐',
};

// ─── KPI Card ──────────────────────────────────────────────────────────────
function KPICard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Building2; label: string; value: string | number; sub?: string;
  color?: string;
}) {
  return (
    <div style={{
      background: 'oklch(10% 0.02 280)',
      border: '1px solid oklch(18% 0.02 280)',
      borderRadius: 16, padding: '20px 24px',
      display: 'flex', alignItems: 'center', gap: 16,
      transition: 'all 0.2s',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: color ?? 'oklch(20% 0.06 290)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={20} style={{ color: 'oklch(75% 0.16 285)' }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'oklch(52% 0.02 270)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'oklch(92% 0.01 280)', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1 }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 11, color: 'oklch(42% 0.02 280)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Tenant Card ────────────────────────────────────────────────────────────
function TenantCard({ tenant, onSelect }: { tenant: TenantData; onSelect: () => void }) {
  const statusColor = STATUS_COLORS[tenant.overallStatus];
  const planBadge = PLAN_BADGES[tenant.plan] ?? PLAN_BADGES.basic;
  const sectorIcon = SECTOR_ICONS[tenant.sector ?? ''] ?? '🏢';
  const contractMonthly = tenant.contractValue?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—';

  return (
    <div
      onClick={onSelect}
      style={{
        background: 'oklch(10% 0.02 280)',
        border: `1px solid ${statusColor.border}`,
        borderRadius: 16,
        padding: 0,
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 8px 32px oklch(0% 0 0 / 0.3), 0 0 0 1px ${statusColor.border}`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      {/* Status bar on top */}
      <div style={{ height: 3, background: statusColor.fg }} />

      <div style={{ padding: '20px 24px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0, flex: 1 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `linear-gradient(135deg, ${statusColor.bg}, oklch(14% 0.02 280))`,
              border: `1px solid ${statusColor.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
            }}>
              {sectorIcon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontWeight: 700, color: 'oklch(92% 0.01 280)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {tenant.tenantName}
              </div>
              <div style={{ fontSize: 11, color: 'oklch(42% 0.02 280)', marginTop: 1 }}>
                {tenant.cnpj ?? tenant.tenantId}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            {/* Status badge */}
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
              padding: '3px 8px', borderRadius: 6,
              background: tenant.status === 'active' ? STATUS_COLORS.green.bg : STATUS_COLORS.yellow.bg,
              color: tenant.status === 'active' ? STATUS_COLORS.green.fg : STATUS_COLORS.yellow.fg,
              border: `1px solid ${tenant.status === 'active' ? STATUS_COLORS.green.border : STATUS_COLORS.yellow.border}`,
            }}>
              {tenant.status === 'active' ? '● Ativo' : tenant.status === 'trial' ? '◐ Trial' : tenant.status ?? '—'}
            </span>
            {/* Plan badge */}
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
              padding: '3px 8px', borderRadius: 6,
              background: planBadge.bg, color: planBadge.fg,
            }}>
              {planBadge.label}
            </span>
          </div>
        </div>

        {/* Region */}
        {tenant.region && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12, fontSize: 11, color: 'oklch(52% 0.02 270)' }}>
            <MapPin size={12} /> {tenant.region}
          </div>
        )}

        {/* Metrics row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <MetricPill icon={Building2} value={tenant.structureCount} label="Estruturas" />
          <MetricPill icon={Radio} value={tenant.sensorCount} label="Sensores" />
          <MetricPill
            icon={Activity}
            value={`${tenant.avgHealthIndex}%`}
            label="Saúde"
            color={statusColor.fg}
          />
          <MetricPill icon={Wallet} value={contractMonthly} label="/mês" small />
        </div>

        {/* Alert summary bar */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
          {tenant.alertCounts.red > 0 && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: STATUS_COLORS.red.bg, color: STATUS_COLORS.red.fg, border: `1px solid ${STATUS_COLORS.red.border}` }}>
              🔴 {tenant.alertCounts.red} críticos
            </span>
          )}
          {tenant.alertCounts.yellow > 0 && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: STATUS_COLORS.yellow.bg, color: STATUS_COLORS.yellow.fg, border: `1px solid ${STATUS_COLORS.yellow.border}` }}>
              🟡 {tenant.alertCounts.yellow} alertas
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: STATUS_COLORS.green.bg, color: STATUS_COLORS.green.fg, border: `1px solid ${STATUS_COLORS.green.border}` }}>
            🟢 {tenant.alertCounts.green} OK
          </span>
        </div>

        {/* Structures list */}
        <div style={{ borderTop: '1px solid oklch(18% 0.02 280)', paddingTop: 12 }}>
          {tenant.structures.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 0', fontSize: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'oklch(72% 0.02 280)' }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: STATUS_COLORS[s.alertStatus].fg,
                  boxShadow: `0 0 4px ${STATUS_COLORS[s.alertStatus].fg}`,
                }} />
                {s.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'oklch(52% 0.02 270)', fontSize: 10 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: STATUS_COLORS[s.alertStatus].fg }}>
                  {s.healthIndex}%
                </span>
                <span>L{s.shmsLevel}</span>
                <span>{s.sensorCount} sensors</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer: enter button */}
        <div style={{
          marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 6, color: 'oklch(68% 0.16 285)', fontSize: 12, fontWeight: 600,
        }}>
          Acessar Dashboard <ChevronRight size={14} />
        </div>
      </div>
    </div>
  );
}

function MetricPill({ icon: Icon, value, label, color, small }: {
  icon: typeof Building2; value: string | number; label: string; color?: string; small?: boolean;
}) {
  return (
    <div style={{
      background: 'oklch(8% 0.02 280)',
      borderRadius: 8, padding: '8px 10px',
      textAlign: 'center',
    }}>
      <Icon size={12} style={{ color: color ?? 'oklch(52% 0.02 270)', marginBottom: 4, display: 'block', margin: '0 auto 4px' }} />
      <div style={{
        fontSize: small ? 11 : 16, fontWeight: 700,
        color: color ?? 'oklch(92% 0.01 280)',
        fontFamily: "'JetBrains Mono', monospace",
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: 'oklch(42% 0.02 280)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────
export default function TenantDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/shms/v2/admin/tenants', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: 'oklch(6% 0.02 280)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid oklch(58% 0.18 295 / 0.3)',
          borderTopColor: 'oklch(58% 0.18 295)', borderRadius: '50%',
          animation: 'mother-auth-spin 0.8s linear infinite',
        }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        minHeight: '100vh', background: 'oklch(6% 0.02 280)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'oklch(65% 0.22 25)', fontFamily: 'Inter, sans-serif',
      }}>
        Erro ao carregar tenants: {error}
      </div>
    );
  }

  const { tenants, globalSummary } = data;

  return (
    <div style={{
      minHeight: '100vh', background: 'oklch(6% 0.02 280)',
      color: 'oklch(92% 0.01 280)', fontFamily: "'Inter', sans-serif",
    }}>
      {/* ── Header ── */}
      <header style={{
        padding: '16px 32px',
        background: 'oklch(8% 0.02 280)',
        borderBottom: '1px solid oklch(18% 0.02 280)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'oklch(14% 0.02 280)', border: '1px solid oklch(22% 0.02 280)',
              borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
              color: 'oklch(72% 0.02 280)', display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 500,
            }}
          >
            <ArrowLeft size={14} /> MOTHER
          </button>
          <div>
            <h1 style={{
              fontSize: 18, fontWeight: 700, margin: 0,
              fontFamily: "'Orbitron', sans-serif", letterSpacing: '-0.01em',
              background: 'linear-gradient(90deg, oklch(85% 0.15 300), oklch(72% 0.14 195))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Painel Multi-Tenant
            </h1>
            <p style={{ fontSize: 11, color: 'oklch(42% 0.02 280)', margin: 0 }}>
              MOTHER SHMS — Empresas & Contratos Cadastrados
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/admin')}
            style={{
              background: 'oklch(14% 0.02 280)', border: '1px solid oklch(22% 0.02 280)',
              borderRadius: 10, padding: '8px 14px', cursor: 'pointer',
              color: 'oklch(72% 0.02 280)', fontSize: 12, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Shield size={14} /> Usuários
          </button>
          <button
            onClick={() => navigate('/shms')}
            style={{
              background: 'linear-gradient(135deg, oklch(58% 0.18 295), oklch(45% 0.15 300))',
              border: 'none', borderRadius: 10, padding: '8px 16px', cursor: 'pointer',
              color: 'oklch(92% 0.01 280)', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 0 20px oklch(58% 0.18 295 / 0.15)',
            }}
          >
            <Gauge size={14} /> SHMS Dashboard
          </button>
        </div>
      </header>

      <div style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto' }}>
        {/* ── KPI Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <KPICard icon={Building2} label="Empresas" value={tenants.length} sub={`${globalSummary.activeTenants} ativas · ${globalSummary.trialTenants} trial`} />
          <KPICard icon={Server} label="Estruturas" value={globalSummary.totalStructures} sub="Barragens, taludes, pontes, túneis" color="oklch(25% 0.06 200)" />
          <KPICard icon={Radio} label="Sensores" value={globalSummary.totalSensors} sub="Piezômetros, inclinômetros, strain" color="oklch(25% 0.06 145)" />
          <KPICard icon={TrendingUp} label="Saúde Média" value={`${globalSummary.avgHealthIndex}%`} sub="ISO 13374-1 Health Index" color="oklch(30% 0.06 70)" />
          <KPICard icon={Wallet} label="MRR Total" value={`R$ ${(globalSummary.totalContractValue / 1000).toFixed(0)}k`} sub="Receita recorrente mensal" color="oklch(25% 0.08 290)" />
          <KPICard icon={AlertTriangle} label="Alertas" value={tenants.reduce((s, t) => s + t.alertCounts.red + t.alertCounts.yellow, 0)} sub={`${tenants.reduce((s, t) => s + t.alertCounts.red, 0)} críticos`} color="oklch(25% 0.08 25)" />
        </div>

        {/* ── Tenant Grid ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16, 
        }}>
          <h2 style={{
            fontSize: 14, fontWeight: 600, margin: 0,
            fontFamily: "'Orbitron', sans-serif",
            color: 'oklch(72% 0.02 280)',
          }}>
            Empresas & Contratos ({tenants.length})
          </h2>
          <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'oklch(42% 0.02 280)' }}>
            <Clock size={12} /> Atualizado há 30s
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>
          {tenants
            .sort((a, b) => (b.contractValue ?? 0) - (a.contractValue ?? 0))
            .map(tenant => (
              <TenantCard
                key={tenant.tenantId}
                tenant={tenant}
                onSelect={() => navigate('/shms')}
              />
            ))}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 40, paddingTop: 20,
          borderTop: '1px solid oklch(14% 0.02 280)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 10, color: 'oklch(32% 0.02 280)',
        }}>
          <span>MOTHER SHMS Multi-Tenant · ISO 13374-1:2003 · OWASP A01:2021 · Row-Level Security</span>
          <span>Weissman & Bobrowski (2009, SIGMOD) · GISTM 2020 §4.3</span>
        </div>
      </div>
    </div>
  );
}
