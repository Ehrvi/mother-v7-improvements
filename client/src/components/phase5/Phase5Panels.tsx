import React from 'react';
import { useChatStore } from '@/store/chatStore';
import { useCreatorGuard } from '@/hooks/useCreatorGuard';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import ErrorBoundary from '@/components/ErrorBoundary';
import ShellPanel from './ShellPanel';
import CodeEditorPanel from './CodeEditorPanel';
import DependencyGraph from './DependencyGraph';
import ProjectsPanel from './ProjectsPanel';

export default function Phase5Panels() {
  const { activePanel, setActivePanel } = useChatStore();
  const { isCreator } = useCreatorGuard();

  if (!isCreator) return null;

  const panelMap: Record<string, React.ReactElement> = {
    shell: <ShellPanel />,
    editor: <CodeEditorPanel />,
    graph: <DependencyGraph />,
    projects: <ProjectsPanel />,
  };

  return (
    <Sheet open={activePanel !== null} onOpenChange={(open) => !open && setActivePanel(null)}>
      <SheetContent side="right" className="w-[600px] sm:w-[800px] p-0 bg-[var(--color-bg-surface)]">
        {activePanel && (
          <ErrorBoundary componentName={activePanel}>
            {panelMap[activePanel]}
          </ErrorBoundary>
        )}
      </SheetContent>
    </Sheet>
  );
}
