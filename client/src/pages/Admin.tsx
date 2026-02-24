import { trpc } from '@/lib/trpc';

export default function Admin() {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: pending, isLoading } = trpc.auth.pendingUsers.useQuery();

  const approveMutation = trpc.auth.approveUser.useMutation({
    onSuccess: () => utils.auth.pendingUsers.invalidate(),
  });
  const rejectMutation = trpc.auth.rejectUser.useMutation({
    onSuccess: () => utils.auth.pendingUsers.invalidate(),
  });

  if (!me || (me as any).role !== 'admin') {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#07070f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fca5a5',
        fontFamily: 'Inter, sans-serif',
        fontSize: 16,
      }}>
        Acesso negado. Apenas administradores podem acessar esta página.
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#07070f',
      color: '#e8e8f0',
      fontFamily: 'Inter, sans-serif',
      padding: '40px 20px',
    }}>
      <style>{`
        .admin-card {
          max-width: 700px;
          margin: 0 auto;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(124,58,237,0.25);
          border-radius: 16px;
          padding: 32px;
        }
        .admin-title {
          font-size: 20px;
          font-weight: 700;
          background: linear-gradient(90deg, #c4b5fd, #818cf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 8px;
        }
        .admin-sub { font-size: 13px; color: #55556a; margin-bottom: 28px; }
        .user-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          gap: 12px;
        }
        .user-row:last-child { border-bottom: none; }
        .user-info { flex: 1; }
        .user-name { font-size: 14px; font-weight: 600; color: #e8e8f0; }
        .user-email { font-size: 12px; color: #55556a; margin-top: 2px; }
        .user-date { font-size: 11px; color: #44445a; margin-top: 2px; }
        .btn-approve {
          background: rgba(16,185,129,0.15);
          border: 1px solid rgba(16,185,129,0.4);
          color: #6ee7b7;
          border-radius: 8px;
          padding: 7px 14px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .btn-approve:hover { background: rgba(16,185,129,0.25); }
        .btn-reject {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          color: #fca5a5;
          border-radius: 8px;
          padding: 7px 14px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .btn-reject:hover { background: rgba(239,68,68,0.2); }
        .empty-state {
          text-align: center;
          color: #44445a;
          padding: 40px 0;
          font-size: 14px;
        }
        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #7c3aed;
          font-size: 13px;
          text-decoration: none;
          margin-bottom: 24px;
          cursor: pointer;
        }
        .back-link:hover { color: #a78bfa; }
      `}</style>

      <div className="admin-card">
        <a className="back-link" href="/">← Voltar ao chat</a>
        <div className="admin-title">Gerenciamento de Usuários</div>
        <div className="admin-sub">
          Usuários aguardando aprovação para acessar MOTHER
        </div>

        {isLoading ? (
          <div className="empty-state">Carregando...</div>
        ) : !pending || pending.length === 0 ? (
          <div className="empty-state">
            ✓ Nenhum usuário pendente de aprovação
          </div>
        ) : (
          pending.map(user => (
            <div key={user.id} className="user-row">
              <div className="user-info">
                <div className="user-name">{user.name || '(sem nome)'}</div>
                <div className="user-email">{user.email}</div>
                <div className="user-date">
                  Cadastrado em {new Date(user.createdAt).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-approve"
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate({ userId: user.id })}
                >
                  Aprovar
                </button>
                <button
                  className="btn-reject"
                  disabled={rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate({ userId: user.id })}
                >
                  Rejeitar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
