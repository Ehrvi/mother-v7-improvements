import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      setSuccessMsg('Login realizado com sucesso! Redirecionando...');
      await utils.auth.me.invalidate();
      // Small delay so user sees the success message
      setTimeout(() => { window.location.href = '/'; }, 800);
    },
    onError: (err) => {
      setError(err.message || 'Erro ao fazer login. Verifique suas credenciais.');
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async (data) => {
      if (data.isFirstUser) {
        setSuccessMsg('Conta criada com sucesso! Bem-vindo, Administrador. Redirecionando...');
        await utils.auth.me.invalidate();
        setTimeout(() => { window.location.href = '/'; }, 1200);
      } else {
        setSuccessMsg(data.message);
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setName('');
      }
    },
    onError: (err) => {
      setError(err.message || 'Erro ao criar conta. Tente novamente.');
    },
  });

  const isPending = loginMutation.isPending || registerMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('As senhas não coincidem');
        return;
      }
      registerMutation.mutate({ name, email, password });
    } else {
      loginMutation.mutate({ email, password });
    }
  };

  const switchMode = (newMode: 'login' | 'register') => {
    setMode(newMode);
    setError('');
    setSuccessMsg('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#07070f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
      padding: '20px',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Inter:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #07070f; }
        .auth-card {
          width: 100%;
          max-width: 420px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(124,58,237,0.25);
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 0 60px rgba(124,58,237,0.12), 0 20px 40px rgba(0,0,0,0.4);
        }
        .logo-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          margin-bottom: 32px;
        }
        .logo-icon {
          width: 64px;
          height: 64px;
          border-radius: 18px;
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Orbitron', sans-serif;
          font-weight: 900;
          font-size: 28px;
          color: white;
          box-shadow: 0 0 30px rgba(124,58,237,0.5);
        }
        .logo-title {
          font-family: 'Orbitron', sans-serif;
          font-weight: 700;
          font-size: 22px;
          background: linear-gradient(90deg, #c4b5fd, #818cf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: 3px;
        }
        .logo-sub {
          font-size: 11px;
          color: #55556a;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .tabs {
          display: flex;
          background: rgba(255,255,255,0.04);
          border-radius: 10px;
          padding: 4px;
          margin-bottom: 28px;
          gap: 4px;
        }
        .tab-btn {
          flex: 1;
          padding: 9px;
          border: none;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
        }
        .tab-btn.active {
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          color: white;
          box-shadow: 0 0 14px rgba(124,58,237,0.4);
        }
        .tab-btn.inactive {
          background: transparent;
          color: #8888aa;
        }
        .tab-btn.inactive:hover { color: #c4b5fd; }
        .field {
          margin-bottom: 16px;
        }
        .field label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #8888aa;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          margin-bottom: 7px;
        }
        .input-wrap {
          position: relative;
        }
        .field input {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(124,58,237,0.2);
          border-radius: 10px;
          padding: 12px 16px;
          color: #e8e8f0;
          font-size: 14px;
          font-family: 'Inter', sans-serif;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .field input:focus {
          border-color: rgba(124,58,237,0.6);
          box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
        }
        .field input::placeholder { color: #44445a; }
        .eye-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #55556a;
          font-size: 16px;
          padding: 4px;
          transition: color 0.2s;
        }
        .eye-btn:hover { color: #a78bfa; }
        .submit-btn {
          width: 100%;
          padding: 13px;
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          border: none;
          border-radius: 10px;
          color: white;
          font-size: 14px;
          font-weight: 700;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 8px;
          letter-spacing: 0.5px;
          box-shadow: 0 4px 20px rgba(124,58,237,0.3);
        }
        .submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(124,58,237,0.45);
        }
        .submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        .error-box {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px;
          padding: 10px 14px;
          color: #fca5a5;
          font-size: 13px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .success-box {
          background: rgba(16,185,129,0.1);
          border: 1px solid rgba(16,185,129,0.3);
          border-radius: 8px;
          padding: 10px 14px;
          color: #6ee7b7;
          font-size: 13px;
          margin-bottom: 16px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .password-rules {
          margin-top: 6px;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .rule {
          font-size: 11px;
          color: #55556a;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .rule.ok { color: #6ee7b7; }
        .divider {
          border: none;
          border-top: 1px solid rgba(255,255,255,0.06);
          margin: 24px 0 16px;
        }
        .footer-note {
          text-align: center;
          font-size: 11px;
          color: #44445a;
          line-height: 1.6;
        }
        .footer-note span { color: #7c3aed; }
        .spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          margin-right: 8px;
          vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="auth-card">
        {/* Logo */}
        <div className="logo-wrap">
          <div className="logo-icon">M</div>
          <div>
            <div className="logo-title">MOTHER</div>
            <div className="logo-sub" style={{ textAlign: 'center', marginTop: 4 }}>Sistema Cognitivo Autônomo</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab-btn ${mode === 'login' ? 'active' : 'inactive'}`}
            onClick={() => switchMode('login')}
          >
            Entrar
          </button>
          <button
            className={`tab-btn ${mode === 'register' ? 'active' : 'inactive'}`}
            onClick={() => switchMode('register')}
          >
            Cadastrar
          </button>
        </div>

        {/* Error / Success messages */}
        {error && (
          <div className="error-box">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="success-box">
            <span>✓</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="field">
              <label>Nome completo</label>
              <input
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div className="field">
            <label>Email</label>
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label>Senha</label>
            <div className="input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : 'Sua senha'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                style={{ paddingRight: '44px' }}
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
            {mode === 'register' && (
              <div className="password-rules">
                <div className={`rule ${password.length >= 8 ? 'ok' : ''}`}>
                  {password.length >= 8 ? '✓' : '○'} Mínimo 8 caracteres
                </div>
                <div className={`rule ${/[A-Z]/.test(password) ? 'ok' : ''}`}>
                  {/[A-Z]/.test(password) ? '✓' : '○'} Uma letra maiúscula
                </div>
                <div className={`rule ${/[0-9]/.test(password) ? 'ok' : ''}`}>
                  {/[0-9]/.test(password) ? '✓' : '○'} Um número
                </div>
              </div>
            )}
          </div>

          {mode === 'register' && (
            <div className="field">
              <label>Confirmar senha</label>
              <div className="input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  style={{
                    paddingRight: '44px',
                    borderColor: confirmPassword && confirmPassword !== password
                      ? 'rgba(239,68,68,0.5)'
                      : confirmPassword && confirmPassword === password
                        ? 'rgba(16,185,129,0.5)'
                        : undefined,
                  }}
                />
              </div>
            </div>
          )}

          <button type="submit" className="submit-btn" disabled={isPending}>
            {isPending && <span className="spinner" />}
            {isPending
              ? 'Processando...'
              : mode === 'login'
                ? 'Entrar no Sistema'
                : 'Criar Conta'}
          </button>
        </form>

        <hr className="divider" />
        <div className="footer-note">
          {mode === 'login' ? (
            <>Não tem conta? <span style={{ cursor: 'pointer' }} onClick={() => switchMode('register')}>Cadastre-se</span></>
          ) : (
            <>Já tem conta? <span style={{ cursor: 'pointer' }} onClick={() => switchMode('login')}>Entrar</span></>
          )}
          <br />
          <span style={{ color: '#33334a', marginTop: 8, display: 'block' }}>
            MOTHER v51.0 · Sistema Cognitivo Autônomo
          </span>
        </div>
      </div>
    </div>
  );
}
