"""
LANL SHM Dataset Generator — Physics-Informed Simulation
Based on: Figueiredo et al. 2009 (OSTI:961604) — Table 2 (damage states) and Table 4 (natural frequencies)
Structure: 3-story laboratory building, 5 accelerometer channels, 17 structural states
Sampling: 200 Hz, 8192 samples per record, 10 repetitions per state

ICOLD Concrete Dam Dataset Generator
Based on: ICOLD Bulletin 158 (2018) — Piezometer and displacement monitoring
Structure: Concrete gravity dam, 8 piezometers + 3 displacement sensors
"""

import numpy as np
import pandas as pd
import os
import json

np.random.seed(42)

# ============================================================
# LANL SHM — Figueiredo 2009 — Real Published Parameters
# Table 2: Damage State Labels
# Table 4: Experimental Natural Frequencies and Damping Ratios
# ============================================================

# Table 2: State descriptions (17 states)
LANL_STATES = {
    1:  {"label": "State #1",  "condition": "Undamaged", "description": "Baseline condition",                              "damaged": False},
    2:  {"label": "State #2",  "condition": "Undamaged", "description": "Mass = 1.2 kg at the base",                      "damaged": False},
    3:  {"label": "State #3",  "condition": "Undamaged", "description": "Mass = 1.2 kg on the 1st floor",                 "damaged": False},
    4:  {"label": "State #4",  "condition": "Undamaged", "description": "87.5% stiffness reduction in column 1BD",        "damaged": False},
    5:  {"label": "State #5",  "condition": "Undamaged", "description": "87.5% stiffness reduction in column 1AD and 1BD","damaged": False},
    6:  {"label": "State #6",  "condition": "Undamaged", "description": "87.5% stiffness reduction in column 2BD",        "damaged": False},
    7:  {"label": "State #7",  "condition": "Undamaged", "description": "87.5% stiffness reduction in column 2AD and 2BD","damaged": False},
    8:  {"label": "State #8",  "condition": "Undamaged", "description": "87.5% stiffness reduction in column 3BD",        "damaged": False},
    9:  {"label": "State #9",  "condition": "Undamaged", "description": "87.5% stiffness reduction in column 3AD and 3BD","damaged": False},
    10: {"label": "State #10", "condition": "Damaged",   "description": "Gap = 0.20 mm",                                  "damaged": True},
    11: {"label": "State #11", "condition": "Damaged",   "description": "Gap = 0.15 mm",                                  "damaged": True},
    12: {"label": "State #12", "condition": "Damaged",   "description": "Gap = 0.13 mm",                                  "damaged": True},
    13: {"label": "State #13", "condition": "Damaged",   "description": "Gap = 0.10 mm",                                  "damaged": True},
    14: {"label": "State #14", "condition": "Damaged",   "description": "Gap = 0.05 mm",                                  "damaged": True},
    15: {"label": "State #15", "condition": "Damaged",   "description": "Gap = 0.20 mm and mass = 1.2 kg at the base",    "damaged": True},
    16: {"label": "State #16", "condition": "Damaged",   "description": "Gap = 0.20 mm and mass = 1.2 kg on the 1st floor","damaged": True},
    17: {"label": "State #17", "condition": "Damaged",   "description": "Gap = 0.10 mm and mass = 1.2 kg on the 1st floor","damaged": True},
}

# Table 4: Experimental Natural Frequencies (Hz) and Damping Ratios (%)
# Columns: [f2, f3, f4, zeta2, zeta3, zeta4]
# Note: 1st mode not listed in paper (below measurement range)
LANL_MODAL_PARAMS = {
    1:  [30.7, 54.2, 70.7, 6.3, 2.0, 0.97],
    2:  [30.4, 52.9, 70.3, 6.4, 1.5, 0.76],
    3:  [30.9, 53.1, 68.2, 5.5, 2.1, 0.82],
    4:  [30.9, 51.2, 69.2, 7.1, 2.2, 0.55],
    5:  [30.3, 47.0, 67.8, 7.0, 1.8, 0.38],
    6:  [29.7, 53.9, 65.8, 5.3, 1.7, 1.2],
    7:  [28.6, 54.2, 62.2, 5.1, 1.7, 0.72],
    8:  [30.2, 51.1, 69.3, 5.6, 2.2, 0.80],
    9:  [28.9, 47.4, 68.0, 4.6, 2.6, 0.80],
    10: [31.1, 54.4, 70.9, 6.6, 2.1, 1.0],
    11: [31.7, 54.5, 70.9, 7.0, 1.9, 0.93],
    12: [31.8, 54.9, 71.2, 6.3, 1.9, 1.0],
    13: [32.4, 55.2, 71.4, 6.3, 1.9, 1.0],
    14: [33.5, 57.6, 74.2, 7.1, 2.2, 0.97],
    15: [31.6, 54.0, 71.1, 5.4, 1.6, 0.73],
    16: [31.0, 53.4, 68.3, 5.3, 2.3, 0.82],
    17: [32.3, 54.4, 69.2, 5.0, 2.2, 0.80],
}

# Acquisition parameters (from Section 2 of Figueiredo 2009)
FS = 200.0        # Sampling frequency (Hz)
N_SAMPLES = 8192  # Samples per record
N_REPS = 10       # Repetitions per state
N_CHANNELS = 5    # Accelerometer channels (Ch1=input force, Ch2-5=response)
T = N_SAMPLES / FS  # Duration per record (40.96 s)


def generate_sdof_response(freq_hz: float, damping_ratio_pct: float,
                            fs: float, n_samples: int,
                            nonlinear_gap: float = None,
                            noise_level: float = 0.02) -> np.ndarray:
    """
    Generate SDOF acceleration response using modal superposition.
    Physics-informed: uses actual natural frequencies and damping ratios from Table 4.
    
    Args:
        freq_hz: Natural frequency (Hz) from Table 4
        damping_ratio_pct: Damping ratio (%) from Table 4
        fs: Sampling frequency (Hz)
        n_samples: Number of samples
        noise_level: Measurement noise std (relative to signal amplitude)
        nonlinear_gap: If not None, introduces bumper nonlinearity (mm gap)
    
    Returns:
        Acceleration time series (g units)
    """
    zeta = damping_ratio_pct / 100.0
    omega_n = 2 * np.pi * freq_hz
    
    # Check for valid damping ratio
    if zeta >= 1.0:
        zeta = 0.99
    
    omega_d = omega_n * np.sqrt(max(1 - zeta**2, 1e-10))
    
    t = np.arange(n_samples) / fs
    
    # White noise excitation (simulates shaker input)
    excitation = np.random.randn(n_samples) * 0.1
    
    # Impulse response function for SDOF
    # h(t) = (1/omega_d) * exp(-zeta*omega_n*t) * sin(omega_d*t)
    h_len = min(int(2.0 * fs), n_samples)  # 2-second impulse response
    t_h = np.arange(h_len) / fs
    h = (1.0 / omega_d) * np.exp(-zeta * omega_n * t_h) * np.sin(omega_d * t_h)
    
    # Convolve excitation with impulse response
    response = np.convolve(excitation, h, mode='full')[:n_samples]
    
    # Normalize to realistic acceleration amplitude (0.1-0.5 g range)
    rms = np.sqrt(np.mean(response**2))
    if rms > 1e-10:
        response = response / rms * 0.2  # Target 0.2g RMS
    
    # Add nonlinear bumper effect for damaged states
    if nonlinear_gap is not None:
        # Bumper introduces clipping nonlinearity when displacement exceeds gap
        # Approximate: clip response peaks proportional to gap severity
        gap_factor = 1.0 / (nonlinear_gap + 0.01)  # Smaller gap = more nonlinearity
        clip_level = 0.3 + 0.5 * np.exp(-gap_factor * 0.1)
        response = np.clip(response, -clip_level, clip_level)
        # Add harmonic distortion (characteristic of impact nonlinearity)
        response += 0.05 * np.sin(2 * omega_n * t) * np.exp(-zeta * omega_n * t[:n_samples])
    
    # Add measurement noise
    noise = np.random.randn(n_samples) * noise_level * np.std(response)
    response += noise
    
    return response.astype(np.float32)


def generate_lanl_dataset(output_dir: str) -> dict:
    """
    Generate LANL SHM dataset calibrated with real Figueiredo 2009 parameters.
    
    Returns metadata dict with statistics.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    records = []
    print("=" * 60)
    print("Generating LANL SHM Dataset")
    print("Source: Figueiredo et al. 2009 (OSTI:961604)")
    print("Table 2: 17 structural states | Table 4: Modal parameters")
    print("=" * 60)
    
    for state_id, state_info in LANL_STATES.items():
        modal = LANL_MODAL_PARAMS[state_id]
        f2, f3, f4 = modal[0], modal[1], modal[2]
        z2, z3, z4 = modal[3], modal[4], modal[5]
        
        # Determine gap for nonlinear states
        gap_mm = None
        if state_info["damaged"]:
            desc = state_info["description"]
            if "0.20 mm" in desc:
                gap_mm = 0.20
            elif "0.15 mm" in desc:
                gap_mm = 0.15
            elif "0.13 mm" in desc:
                gap_mm = 0.13
            elif "0.10 mm" in desc:
                gap_mm = 0.10
            elif "0.05 mm" in desc:
                gap_mm = 0.05
        
        for rep in range(N_REPS):
            # Generate 4 response channels (Ch2-Ch5) via modal superposition
            # Each channel is a weighted combination of 3 modes
            ch2 = (0.6 * generate_sdof_response(f2, z2, FS, N_SAMPLES, nonlinear_gap=gap_mm) +
                   0.3 * generate_sdof_response(f3, z3, FS, N_SAMPLES, nonlinear_gap=gap_mm) +
                   0.1 * generate_sdof_response(f4, z4, FS, N_SAMPLES, nonlinear_gap=gap_mm))
            ch3 = (0.5 * generate_sdof_response(f2, z2, FS, N_SAMPLES, nonlinear_gap=gap_mm) +
                   0.4 * generate_sdof_response(f3, z3, FS, N_SAMPLES, nonlinear_gap=gap_mm) +
                   0.1 * generate_sdof_response(f4, z4, FS, N_SAMPLES, nonlinear_gap=gap_mm))
            ch4 = (0.4 * generate_sdof_response(f2, z2, FS, N_SAMPLES, nonlinear_gap=gap_mm) +
                   0.4 * generate_sdof_response(f3, z3, FS, N_SAMPLES, nonlinear_gap=gap_mm) +
                   0.2 * generate_sdof_response(f4, z4, FS, N_SAMPLES, nonlinear_gap=gap_mm))
            ch5 = (0.3 * generate_sdof_response(f2, z2, FS, N_SAMPLES, nonlinear_gap=gap_mm) +
                   0.3 * generate_sdof_response(f3, z3, FS, N_SAMPLES, nonlinear_gap=gap_mm) +
                   0.4 * generate_sdof_response(f4, z4, FS, N_SAMPLES, nonlinear_gap=gap_mm))
            
            # Compute AR(5) features (as used in Figueiredo 2009, Section 4.3)
            # Use Channel 5 (most sensitive per paper)
            from numpy.linalg import lstsq
            p = 5  # AR order
            X_ar = np.column_stack([ch5[i:N_SAMPLES-p+i] for i in range(p)])
            y_ar = ch5[p:]
            try:
                ar_coeffs, _, _, _ = lstsq(X_ar, y_ar, rcond=None)
            except Exception:
                ar_coeffs = np.zeros(p)
            
            # Statistical features (Section 4.2 of Figueiredo 2009)
            record = {
                "state_id": state_id,
                "state_label": state_info["label"],
                "condition": state_info["condition"],
                "description": state_info["description"],
                "damaged": int(state_info["damaged"]),
                "repetition": rep + 1,
                # Modal parameters (ground truth from Table 4)
                "f2_hz": f2, "f3_hz": f3, "f4_hz": f4,
                "z2_pct": z2, "z3_pct": z3, "z4_pct": z4,
                # Statistical features — Channel 5 (primary channel per paper)
                "ch5_mean": float(np.mean(ch5)),
                "ch5_std": float(np.std(ch5)),
                "ch5_skewness": float(pd.Series(ch5).skew()),
                "ch5_kurtosis": float(pd.Series(ch5).kurtosis()),
                "ch5_rms": float(np.sqrt(np.mean(ch5**2))),
                # AR(5) coefficients — Channel 5
                "ar1": float(ar_coeffs[0]) if len(ar_coeffs) > 0 else 0.0,
                "ar2": float(ar_coeffs[1]) if len(ar_coeffs) > 1 else 0.0,
                "ar3": float(ar_coeffs[2]) if len(ar_coeffs) > 2 else 0.0,
                "ar4": float(ar_coeffs[3]) if len(ar_coeffs) > 3 else 0.0,
                "ar5": float(ar_coeffs[4]) if len(ar_coeffs) > 4 else 0.0,
                # Cross-channel correlation (Section 4.2.3)
                "corr_ch2_ch5": float(np.corrcoef(ch2, ch5)[0, 1]),
                "corr_ch3_ch5": float(np.corrcoef(ch3, ch5)[0, 1]),
                "corr_ch4_ch5": float(np.corrcoef(ch4, ch5)[0, 1]),
                # Gap parameter (for damaged states)
                "gap_mm": gap_mm if gap_mm is not None else 0.0,
            }
            records.append(record)
        
        print(f"  State #{state_id:2d} ({state_info['condition']:10s}): "
              f"f2={f2:.1f}Hz | {state_info['description'][:50]}")
    
    # Save as CSV
    df = pd.DataFrame(records)
    csv_path = os.path.join(output_dir, "lanl_shm_figueiredo2009.csv")
    df.to_csv(csv_path, index=False)
    
    # Save metadata
    meta = {
        "source": "Figueiredo et al. 2009 (OSTI:961604)",
        "doi": "10.2172/961604",
        "structure": "3-story laboratory building, LANL Engineering Institute",
        "n_states": 17,
        "n_damaged_states": 7,
        "n_undamaged_states": 10,
        "n_channels": 5,
        "n_reps_per_state": 10,
        "n_total_records": len(records),
        "sampling_frequency_hz": FS,
        "n_samples_per_record": N_SAMPLES,
        "features": ["modal_params", "ar5_coefficients", "statistical_moments", "cross_correlations"],
        "damage_mechanism": "Bumper nonlinearity (repetitive impact)",
        "table2_reference": "Data Labels of Structural State Conditions",
        "table4_reference": "Experimental Natural Frequencies and Damping Ratios",
        "generation_method": "Physics-informed simulation calibrated with published modal parameters",
    }
    with open(os.path.join(output_dir, "lanl_metadata.json"), "w") as f:
        json.dump(meta, f, indent=2)
    
    print(f"\n✅ LANL SHM Dataset: {len(records)} records → {csv_path}")
    return meta


# ============================================================
# ICOLD Concrete Dam Dataset
# Based on: ICOLD Bulletin 158 (2018) — Dam Safety Management
# Structure: Concrete gravity dam, 8 piezometers + 3 displacement sensors
# Reference: Seyed-Kolbadi et al. 2020 (MDPI Infrastructures 5(3):26)
# ============================================================

# ICOLD Bulletin 158 — Typical monitoring parameters for concrete gravity dams
# Reference values from Seyed-Kolbadi et al. 2020 (Boostan earth dam case study)
ICOLD_DAM_PARAMS = {
    "dam_height_m": 45.0,          # Typical concrete gravity dam height
    "dam_crest_length_m": 200.0,   # Crest length
    "reservoir_max_level_m": 40.0, # Maximum normal water level
    "n_piezometers": 8,            # Piezometer instruments
    "n_displacement_sensors": 3,   # Pendulum/extensometer sensors
    "monitoring_period_years": 5,  # 5 years of monitoring data
    "sampling_interval_days": 1,   # Daily readings
}

# Piezometer baseline uplift pressures (m water column) — typical values
# Based on ICOLD Bulletin 158 Table 6.1 (uplift pressure distribution)
PIEZOMETER_BASELINES = {
    "P1": 35.0,  # Upstream heel — highest pressure
    "P2": 28.0,
    "P3": 22.0,
    "P4": 17.0,
    "P5": 13.0,
    "P6": 9.0,
    "P7": 5.0,
    "P8": 2.0,   # Downstream toe — lowest pressure
}

# Displacement sensor baselines (mm) — pendulum readings
DISPLACEMENT_BASELINES = {
    "D1": 0.0,   # Upstream-downstream displacement at crest (baseline = 0)
    "D2": 0.0,   # Left-right displacement at crest
    "D3": 0.0,   # Settlement at dam base
}

# Seasonal temperature effect on displacement (mm/°C)
THERMAL_SENSITIVITY = {"D1": 0.15, "D2": 0.05, "D3": 0.02}


def generate_icold_dataset(output_dir: str) -> dict:
    """
    Generate ICOLD concrete dam monitoring dataset.
    Based on ICOLD Bulletin 158 (2018) typical monitoring parameters.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    print("\n" + "=" * 60)
    print("Generating ICOLD Concrete Dam Monitoring Dataset")
    print("Source: ICOLD Bulletin 158 (2018) + Seyed-Kolbadi et al. 2020")
    print("=" * 60)
    
    n_days = int(ICOLD_DAM_PARAMS["monitoring_period_years"] * 365)
    dates = pd.date_range(start="2019-01-01", periods=n_days, freq="D")
    
    records = []
    
    # Simulate reservoir level (seasonal variation + random fluctuations)
    t = np.arange(n_days)
    reservoir_level = (
        30.0 +                                          # Mean level (m)
        8.0 * np.sin(2 * np.pi * t / 365.0) +         # Annual cycle
        2.0 * np.sin(2 * np.pi * t / 182.5) +         # Semi-annual
        np.random.randn(n_days) * 0.5                  # Random fluctuations
    )
    reservoir_level = np.clip(reservoir_level, 5.0, 40.0)
    
    # Temperature (°C) — seasonal variation
    temperature = (
        15.0 +                                          # Mean annual temp
        12.0 * np.sin(2 * np.pi * (t - 90) / 365.0) + # Annual cycle (peak in summer)
        np.random.randn(n_days) * 1.5                  # Daily variation
    )
    
    # Introduce anomaly events (simulating potential dam distress)
    # Event 1: Piezometer anomaly at day 600 (seepage increase)
    anomaly_seepage_start = 600
    anomaly_seepage_end = 650
    # Event 2: Displacement anomaly at day 1200 (thermal cracking)
    anomaly_disp_start = 1200
    anomaly_disp_end = 1250
    
    for i, date in enumerate(dates):
        rl = reservoir_level[i]
        temp = temperature[i]
        
        # Piezometer readings (m water column)
        # Pressure proportional to reservoir level + seasonal + noise
        piezometers = {}
        for j, (pname, baseline) in enumerate(PIEZOMETER_BASELINES.items()):
            # Hydraulic gradient effect
            pressure = baseline * (rl / ICOLD_DAM_PARAMS["reservoir_max_level_m"])
            # Seasonal variation (thermal expansion/contraction affects seepage)
            pressure += 0.5 * np.sin(2 * np.pi * t[i] / 365.0)
            # Measurement noise
            pressure += np.random.randn() * 0.2
            # Anomaly: seepage increase at P3-P5 during event 1
            if anomaly_seepage_start <= i <= anomaly_seepage_end and j in [2, 3, 4]:
                progress = (i - anomaly_seepage_start) / (anomaly_seepage_end - anomaly_seepage_start)
                pressure += 3.0 * progress  # Gradual pressure increase
            piezometers[pname] = round(float(pressure), 3)
        
        # Displacement readings (mm)
        displacements = {}
        for dname, baseline in DISPLACEMENT_BASELINES.items():
            # Thermal displacement (dominant effect for concrete dams)
            disp = THERMAL_SENSITIVITY[dname] * (temp - 15.0)
            # Reservoir load effect
            disp += 0.01 * (rl - 30.0)
            # Creep (long-term slow drift)
            disp += 0.0001 * t[i]
            # Measurement noise
            disp += np.random.randn() * 0.05
            # Anomaly: displacement increase during event 2
            if anomaly_disp_start <= i <= anomaly_disp_end and dname == "D1":
                progress = (i - anomaly_disp_start) / (anomaly_disp_end - anomaly_disp_start)
                disp += 2.0 * progress  # Abnormal displacement
            displacements[dname] = round(float(disp), 4)
        
        # Anomaly flag
        is_anomaly = (
            (anomaly_seepage_start <= i <= anomaly_seepage_end) or
            (anomaly_disp_start <= i <= anomaly_disp_end)
        )
        
        record = {
            "date": date.strftime("%Y-%m-%d"),
            "day_index": int(i),
            "reservoir_level_m": round(float(rl), 3),
            "temperature_c": round(float(temp), 2),
            "is_anomaly": int(is_anomaly),
            **{f"piezometer_{k}_m": v for k, v in piezometers.items()},
            **{f"displacement_{k}_mm": v for k, v in displacements.items()},
        }
        records.append(record)
    
    # Save as CSV
    df = pd.DataFrame(records)
    csv_path = os.path.join(output_dir, "icold_dam_monitoring.csv")
    df.to_csv(csv_path, index=False)
    
    # Save metadata
    meta = {
        "source": "ICOLD Bulletin 158 (2018) + Seyed-Kolbadi et al. 2020 (doi:10.3390/infrastructures5030026)",
        "structure": "Concrete gravity dam — 45m height, 200m crest",
        "n_days": n_days,
        "n_instruments": 11,
        "n_piezometers": 8,
        "n_displacement_sensors": 3,
        "sampling_interval": "daily",
        "anomaly_events": [
            {"name": "seepage_increase", "start_day": anomaly_seepage_start, "end_day": anomaly_seepage_end, "sensors": ["P3","P4","P5"]},
            {"name": "displacement_anomaly", "start_day": anomaly_disp_start, "end_day": anomaly_disp_end, "sensors": ["D1"]},
        ],
        "n_anomaly_days": int(df["is_anomaly"].sum()),
        "generation_method": "Physics-informed simulation calibrated with ICOLD Bulletin 158 parameters",
    }
    with open(os.path.join(output_dir, "icold_metadata.json"), "w") as f:
        json.dump(meta, f, indent=2)
    
    print(f"✅ ICOLD Dam Dataset: {n_days} days, {len(df.columns)} features → {csv_path}")
    print(f"   Anomaly days: {int(df['is_anomaly'].sum())} ({int(df['is_anomaly'].sum())/n_days*100:.1f}%)")
    return meta


if __name__ == "__main__":
    output_dir = "/home/ubuntu/datasets"
    
    # Generate LANL SHM dataset
    lanl_meta = generate_lanl_dataset(os.path.join(output_dir, "lanl"))
    
    # Generate ICOLD dam dataset
    icold_meta = generate_icold_dataset(os.path.join(output_dir, "icold"))
    
    print("\n" + "=" * 60)
    print("DATASET GENERATION COMPLETE")
    print(f"  LANL SHM: {lanl_meta['n_total_records']} records, 17 states")
    print(f"  ICOLD Dam: {icold_meta['n_days']} days, {icold_meta['n_instruments']} instruments")
    print("=" * 60)
