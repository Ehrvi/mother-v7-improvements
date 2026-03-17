/**
 * HomeV2 — Main page, now delegates to AppShell + SemanticDisplayRouter
 *
 * The AppShell handles the 3-zone adaptive layout:
 *   Left:  ChatSidebar (session history, tools, product nav)
 *   Main:  SemanticDisplayRouter (AI-driven dynamic display)
 *   Right: Phase5Panels (shell, editor, graph, projects)
 */
import AppShell from '@/components/layout/AppShell';

export default function HomeV2() {
  return <AppShell />;
}
