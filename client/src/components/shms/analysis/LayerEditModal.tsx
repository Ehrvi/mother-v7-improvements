/**
 * LayerEditModal.tsx — SOTA Per-Layer Property Editor
 *
 * Inspired by:
 * - Rocscience Slide2: Material Properties sidebar with per-entity editing
 * - GEO5: Soil database dialog with hint buttons and color picker
 * - GeoSlope SLOPE/W: Material editor with clone/add
 * - Material Design 3: glassmorphic dark modal, progressive disclosure
 *
 * Scientific basis:
 * - Mohr-Coulomb strength model: c', φ', γ (Coulomb, 1776; Mohr, 1900)
 * - Hoek-Brown: GSI, mi, D for rock masses (Hoek et al., 2002)
 * - Pore water pressure: ru coefficient (Bishop, 1955)
 * - Nielsen (1994): progressive disclosure usability heuristic
 */
import { useState, useEffect, useRef } from 'react';

export interface LayerData {
  id: string;
  name: string;
  color: string;
  cohesion: number;         // c' (kPa)
  frictionAngle: number;    // φ' (°)
  unitWeight: number;       // γ (kN/m³)
  unitWeightSat: number;    // γ_sat (kN/m³)
  ru: number;               // pore water pressure ratio
  piezometricHead: number;  // piezometric head (m)
  strengthModel: 'mohr-coulomb' | 'hoek-brown';
  // Hoek-Brown (rock)
  gsi?: number;             // Geological Strength Index
  mi?: number;              // material constant
  disturbanceD?: number;    // disturbance factor (0-1)
  sigmaCI?: number;         // uniaxial compressive strength (MPa)
}

interface LayerEditModalProps {
  layer: LayerData;
  onSave: (updated: LayerData) => void;
  onClose: () => void;
}

const SOIL_PRESETS: { name: string; cohesion: number; frictionAngle: number; unitWeight: number; unitWeightSat: number }[] = [
  { name: 'Argila Mole', cohesion: 10, frictionAngle: 22, unitWeight: 16, unitWeightSat: 17 },
  { name: 'Argila Média', cohesion: 25, frictionAngle: 25, unitWeight: 17.5, unitWeightSat: 18.5 },
  { name: 'Argila Rija', cohesion: 50, frictionAngle: 28, unitWeight: 18.5, unitWeightSat: 19.5 },
  { name: 'Areia Fina', cohesion: 0, frictionAngle: 30, unitWeight: 17, unitWeightSat: 19 },
  { name: 'Areia Média', cohesion: 0, frictionAngle: 33, unitWeight: 18, unitWeightSat: 20 },
  { name: 'Areia Grossa', cohesion: 0, frictionAngle: 36, unitWeight: 19, unitWeightSat: 21 },
  { name: 'Silte', cohesion: 5, frictionAngle: 27, unitWeight: 17, unitWeightSat: 19 },
  { name: 'Pedregulho', cohesion: 0, frictionAngle: 40, unitWeight: 20, unitWeightSat: 22 },
  { name: 'Rejeito (Tailings)', cohesion: 5, frictionAngle: 28, unitWeight: 18, unitWeightSat: 20 },
  { name: 'Enrocamento', cohesion: 0, frictionAngle: 45, unitWeight: 21, unitWeightSat: 22 },
];

const LAYER_COLORS = [
  '#8B6914', '#CD853F', '#6B8E23', '#556B2F', '#808000',
  '#B8860B', '#D2691E', '#A0522D', '#8B4513', '#654321',
  '#708090', '#778899', '#2F4F4F', '#696969', '#4682B4',
];

export default function LayerEditModal({ layer, onSave, onClose }: LayerEditModalProps) {
  const [data, setData] = useState<LayerData>({ ...layer });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const set = <K extends keyof LayerData>(key: K, val: LayerData[K]) =>
    setData(prev => ({ ...prev, [key]: val }));

  const applyPreset = (preset: typeof SOIL_PRESETS[0]) => {
    setData(prev => ({
      ...prev,
      cohesion: preset.cohesion,
      frictionAngle: preset.frictionAngle,
      unitWeight: preset.unitWeight,
      unitWeightSat: preset.unitWeightSat,
    }));
    setShowPresets(false);
  };

  const InputField = ({ label, unit, value, field, min, max, step, hint }: {
    label: string; unit: string; value: number; field: keyof LayerData;
    min?: number; max?: number; step?: number; hint?: string;
  }) => (
    <div className="stab-modal__field">
      <label className="stab-modal__label">
        {label}
        {hint && <span className="stab-modal__hint" title={hint}>?</span>}
      </label>
      <div className="stab-modal__input-wrap">
        <input
          type="number"
          className="stab-modal__input"
          value={value}
          min={min}
          max={max}
          step={step ?? 0.1}
          onChange={e => set(field, +e.target.value as any)}
        />
        <span className="stab-modal__unit">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="stab-modal__overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="stab-modal" ref={modalRef}>
        {/* Header */}
        <div className="stab-modal__header">
          <div className="stab-modal__header-left">
            <span className="stab-modal__color-dot" style={{ background: data.color }} />
            <input
              className="stab-modal__name-input"
              value={data.name}
              onChange={e => set('name', e.target.value)}
              spellCheck={false}
            />
          </div>
          <button className="stab-modal__close" onClick={onClose}>✕</button>
        </div>

        {/* Color picker row */}
        <div className="stab-modal__section">
          <div className="stab-modal__section-title">Cor da Camada</div>
          <div className="stab-modal__colors">
            {LAYER_COLORS.map(c => (
              <button
                key={c}
                className={`stab-modal__color-btn ${data.color === c ? 'stab-modal__color-btn--active' : ''}`}
                style={{ background: c }}
                onClick={() => set('color', c)}
              />
            ))}
          </div>
        </div>

        {/* Preset database */}
        <div className="stab-modal__section">
          <button className="stab-modal__preset-toggle" onClick={() => setShowPresets(!showPresets)}>
            📖 Banco de Solos {showPresets ? '▾' : '▸'}
          </button>
          {showPresets && (
            <div className="stab-modal__presets">
              {SOIL_PRESETS.map(p => (
                <button key={p.name} className="stab-modal__preset-item" onClick={() => applyPreset(p)}>
                  <span className="stab-modal__preset-name">{p.name}</span>
                  <span className="stab-modal__preset-vals">
                    c'={p.cohesion} φ'={p.frictionAngle}° γ={p.unitWeight}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Strength Model Selector */}
        <div className="stab-modal__section">
          <div className="stab-modal__section-title">Modelo de Resistência</div>
          <div className="stab-modal__toggle-row">
            <button
              className={`stab-modal__toggle ${data.strengthModel === 'mohr-coulomb' ? 'stab-modal__toggle--active' : ''}`}
              onClick={() => set('strengthModel', 'mohr-coulomb')}
            >
              Mohr-Coulomb
            </button>
            <button
              className={`stab-modal__toggle ${data.strengthModel === 'hoek-brown' ? 'stab-modal__toggle--active' : ''}`}
              onClick={() => set('strengthModel', 'hoek-brown')}
            >
              Hoek-Brown
            </button>
          </div>
        </div>

        {/* Main Parameters */}
        <div className="stab-modal__section">
          <div className="stab-modal__section-title">
            {data.strengthModel === 'mohr-coulomb' ? 'Parâmetros Mohr-Coulomb' : 'Parâmetros Hoek-Brown'}
          </div>
          {data.strengthModel === 'mohr-coulomb' ? (
            <div className="stab-modal__fields-grid">
              <InputField label="c'" unit="kPa" value={data.cohesion} field="cohesion" min={0} step={1}
                hint="Coesão efetiva (Coulomb, 1776)" />
              <InputField label="φ'" unit="°" value={data.frictionAngle} field="frictionAngle" min={0} max={60} step={0.5}
                hint="Ângulo de atrito efetivo (Mohr, 1900)" />
              <InputField label="γ" unit="kN/m³" value={data.unitWeight} field="unitWeight" min={10} max={28} step={0.1}
                hint="Peso específico natural" />
              <InputField label="γ_sat" unit="kN/m³" value={data.unitWeightSat} field="unitWeightSat" min={12} max={28} step={0.1}
                hint="Peso específico saturado" />
            </div>
          ) : (
            <div className="stab-modal__fields-grid">
              <InputField label="σci" unit="MPa" value={data.sigmaCI ?? 50} field="sigmaCI" min={1} step={1}
                hint="Resistência à compressão uniaxial da rocha intacta" />
              <InputField label="GSI" unit="" value={data.gsi ?? 50} field="gsi" min={10} max={100} step={1}
                hint="Geological Strength Index (Hoek, 1994)" />
              <InputField label="mi" unit="" value={data.mi ?? 10} field="mi" min={1} max={35} step={1}
                hint="Constante do material (Hoek et al., 2002)" />
              <InputField label="D" unit="" value={data.disturbanceD ?? 0} field="disturbanceD" min={0} max={1} step={0.1}
                hint="Fator de perturbação (0=intacto, 1=perturbado)" />
            </div>
          )}
        </div>

        {/* Water */}
        <div className="stab-modal__section">
          <div className="stab-modal__section-title">💧 Poropressão</div>
          <div className="stab-modal__fields-grid">
            <InputField label="ru" unit="" value={data.ru} field="ru" min={0} max={1} step={0.05}
              hint="Razão de poropressão (Bishop, 1955)" />
            <InputField label="Nível Piez." unit="m" value={data.piezometricHead} field="piezometricHead" min={0} step={0.5}
              hint="Cota do nível piezométrico" />
          </div>
        </div>

        {/* Advanced (progressive disclosure) */}
        <div className="stab-modal__section">
          <button className="stab-modal__preset-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
            ⚙️ Avançado {showAdvanced ? '▾' : '▸'}
          </button>
          {showAdvanced && (
            <div className="stab-modal__advanced">
              <div className="stab-modal__hint-block">
                <strong>Anisotropia</strong>: Não implementado nesta versão. Disponível em Slide2 v9+.
              </div>
              <div className="stab-modal__hint-block">
                <strong>Envelope não-linear</strong>: Para envoltória de resistência curva, use pontos tabulados (futuro).
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="stab-modal__footer">
          <button className="shms-btn" onClick={onClose}>Cancelar</button>
          <button className="shms-btn shms-btn--accent" onClick={() => onSave(data)}>
            💾 Salvar Camada
          </button>
        </div>
      </div>
    </div>
  );
}
