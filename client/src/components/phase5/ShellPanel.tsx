import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export default function ShellPanel() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = new Terminal({
      theme: { background: '#0a0e1a', foreground: '#e0e0f0', cursor: '#a78bfa' },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      cursorBlink: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current!);
    fitAddon.fit();
    term.writeln('\x1b[1;35mMOTHER Shell\x1b[0m — Creator sandbox');
    term.writeln('Type a command and press Enter...\r\n');
    term.onData((data) => {
      term.write(data);
    });
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);
    return () => { term.dispose(); window.removeEventListener('resize', handleResize); };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--color-border-subtle)]">
        <h2 className="text-sm font-semibold">Shell Executor</h2>
        <p className="text-xs text-[var(--color-fg-muted)]">Creator only · Sandboxed environment</p>
      </div>
      <div ref={containerRef} className="flex-1 p-2" />
    </div>
  );
}
