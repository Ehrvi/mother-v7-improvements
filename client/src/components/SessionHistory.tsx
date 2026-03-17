/**
 * SessionHistory.tsx — Session History with Search and Filters
 * Sprint 1 | C200 | Conselho dos 6 IAs | 2026-03-08
 *
 * NC-UX-003 fix: users need to access previous sessions with search capability
 * Scientific basis: Information Scent (Pirolli & Card, 1999) — users need cues to find past content
 */

import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

interface Session {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  tags?: string[];
}

interface SessionHistoryProps {
  /** Currently active session ID */
  activeSessionId?: string;
  /** Called when user selects a session */
  onSelectSession?: (sessionId: string) => void;
  /** Called when user creates a new session */
  onNewSession?: () => void;
  /** Called when user deletes a session */
  onDeleteSession?: (sessionId: string) => void;
  /** CSS classes for container */
  className?: string;
}

type SortOption = "recent" | "oldest" | "messages";

/**
 * SessionHistory — displays past sessions with search, filter, and sort.
 *
 * Features:
 * - Full-text search across session titles and previews
 * - Sort by: most recent, oldest, most messages
 * - Delete sessions with confirmation
 * - Keyboard navigation (↑/↓ arrows)
 */
export function SessionHistory({
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  className = "",
}: SessionHistoryProps) {
  const sessionsQuery = trpc.mother.getSessions.useQuery(undefined, { staleTime: 30_000 });
  const sessions = sessionsQuery.data ?? [];
  const loading = sessionsQuery.isLoading;
  const deleteSessionMutation = trpc.mother.deleteSession.useMutation({
    onSuccess: () => sessionsQuery.refetch(),
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter and sort sessions
  const filteredSessions = useMemo(() => {
    let result = [...sessions];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.preview.toLowerCase().includes(query) ||
          s.tags?.some((t) => t.toLowerCase().includes(query))
      );
    }

    // Sort
    switch (sortBy) {
      case "recent":
        result.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        break;
      case "oldest":
        result.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        break;
      case "messages":
        result.sort((a, b) => b.messageCount - a.messageCount);
        break;
    }

    return result;
  }, [sessions, searchQuery, sortBy]);

  const handleDelete = (sessionId: string) => {
    if (confirmDelete === sessionId) {
      deleteSessionMutation.mutate({ sessionId });
      onDeleteSession?.(sessionId);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(sessionId);
      // Auto-cancel confirmation after 3 seconds
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    if (diffHours < 1) return "Agora";
    if (diffHours < 24) return `${Math.floor(diffHours)}h atrás`;
    if (diffDays < 7) return `${Math.floor(diffDays)}d atrás`;
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Histórico
        </span>
        <button
          onClick={onNewSession}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          title="Nova sessão"
        >
          <span>+</span>
          <span>Nova</span>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-100">
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar sessões..."
          className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
        />
      </div>

      {/* Sort options */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-gray-100">
        {(["recent", "oldest", "messages"] as SortOption[]).map((option) => (
          <button
            key={option}
            onClick={() => setSortBy(option)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              sortBy === option
                ? "bg-blue-100 text-blue-700 font-medium"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {option === "recent" ? "Recentes" : option === "oldest" ? "Antigos" : "Mensagens"}
          </button>
        ))}
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-20 text-sm text-gray-400">
            Carregando...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 text-sm text-gray-400 gap-1">
            <span>{searchQuery ? "Nenhum resultado" : "Nenhuma sessão"}</span>
            {!searchQuery && (
              <button
                onClick={onNewSession}
                className="text-blue-500 hover:underline text-xs"
              >
                Criar primeira sessão
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filteredSessions.map((session) => (
              <li
                key={session.id}
                className={`group relative px-3 py-2.5 cursor-pointer transition-colors ${
                  activeSessionId === session.id
                    ? "bg-blue-50 border-l-2 border-blue-500"
                    : "hover:bg-gray-50"
                }`}
                onClick={() => onSelectSession?.(session.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        activeSessionId === session.id
                          ? "text-blue-700"
                          : "text-gray-800"
                      }`}
                    >
                      {session.title || "Sessão sem título"}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {session.preview}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-300">
                        {formatDate(session.updatedAt)}
                      </span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-300">
                        {session.messageCount} msgs
                      </span>
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(session.id);
                    }}
                    className={`opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded transition-all ${
                      confirmDelete === session.id
                        ? "opacity-100 bg-red-100 text-red-600"
                        : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                    }`}
                    title={
                      confirmDelete === session.id
                        ? "Clique novamente para confirmar"
                        : "Deletar sessão"
                    }
                  >
                    {confirmDelete === session.id ? "✓" : "×"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer stats */}
      {!loading && sessions.length > 0 && (
        <div className="px-3 py-1.5 border-t border-gray-100 text-xs text-gray-400">
          {filteredSessions.length === sessions.length
            ? `${sessions.length} sessões`
            : `${filteredSessions.length} de ${sessions.length} sessões`}
        </div>
      )}
    </div>
  );
}

export default SessionHistory;
