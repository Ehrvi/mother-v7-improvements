/**
 * Header — C239: WCAG AA Compliance
 * NC-WCAG-001 | MOTHER v122.1
 *
 * Scientific basis:
 * - WCAG 2.1 AA (W3C, 2018): SC 1.4.3 Contrast, SC 2.4.1 Bypass Blocks, SC 2.4.7 Focus Visible
 * - Nielsen (1994) Heuristic #1: Visibility of System Status
 * - Inclusive Design Principles (Heydon Pickering, 2019): perceivable, operable, understandable
 */
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bot, Settings, Trash2, GitBranch, Sun, Moon } from 'lucide-react';
import { useMother } from '@/contexts/MotherContext';
import { toast } from 'sonner';
import { Link, useLocation } from 'react-router-dom';
import { VersionBadge } from '@/components/VersionBadge';
import { useTheme } from '@/contexts/ThemeContext';

export default function Header() {
  const { clearMessages } = useMother();
  const location = useLocation();
  const { theme, toggleTheme, switchable } = useTheme();

  const handleClearChat = () => {
    if (confirm('Are you sure you want to clear all messages?')) {
      clearMessages();
      toast.success('Chat history cleared');
    }
  };

  const handleSettings = () => {
    toast.info('Settings - Feature coming soon');
  };

  return (
    <>
      {/* C239: WCAG 2.4.1 — Skip Navigation (Bypass Blocks) */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      <header
        className="border-b border-border bg-card/50 backdrop-blur px-6 py-4"
        role="banner"
      >
        <div className="flex items-center justify-between">
          {/* Left: Mother Avatar & Info */}
          <div className="flex items-center gap-4">
            <Link to="/" aria-label="MOTHER home">
              <div
                className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center animate-pulse cursor-pointer"
                aria-hidden="true"
              >
                <Bot className="w-6 h-6 text-white" />
              </div>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">MOTHER</h1>
                <VersionBadge compact />
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-xs border-green-500/50 text-green-400"
                  aria-label="System status: Operational"
                >
                  ● Operational
                </Badge>
                <span className="text-xs text-muted-foreground">Sydney, Australia</span>
              </div>
            </div>
          </div>

          {/* Center: Navigation */}
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            <Link to="/">
              <Button
                variant={location.pathname === '/' ? 'secondary' : 'ghost'}
                size="sm"
                className="text-sm"
                aria-current={location.pathname === '/' ? 'page' : undefined}
              >
                Chat
              </Button>
            </Link>
            <Link to="/lineage">
              <Button
                variant={location.pathname === '/lineage' || location.pathname === '/dgm' ? 'secondary' : 'ghost'}
                size="sm"
                className="text-sm flex items-center gap-1.5"
                aria-current={location.pathname === '/lineage' || location.pathname === '/dgm' ? 'page' : undefined}
              >
                <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
                DGM Lineage
              </Button>
            </Link>
          </nav>

          {/* Right: Actions */}
          <div className="flex items-center gap-2" role="toolbar" aria-label="Header actions">
            {/* C239: Theme Toggle — WCAG 1.4.3 Contrast + 2.4.6 Headings and Labels */}
            {switchable && toggleTheme && (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="text-muted-foreground hover:text-foreground"
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark'
                  ? <Sun className="w-5 h-5" aria-hidden="true" />
                  : <Moon className="w-5 h-5" aria-hidden="true" />
                }
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearChat}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Clear chat history"
              title="Clear chat history"
            >
              <Trash2 className="w-5 h-5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSettings}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Settings"
              title="Settings"
            >
              <Settings className="w-5 h-5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>
    </>
  );
}
