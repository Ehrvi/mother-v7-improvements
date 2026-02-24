import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bot, Settings, Trash2, GitBranch } from 'lucide-react';
import { useMother } from '@/contexts/MotherContext';
import { toast } from 'sonner';
import { Link, useLocation } from 'react-router-dom';

export default function Header() {
  const { clearMessages } = useMother();
  const location = useLocation();

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
    <header className="border-b border-border bg-card/50 backdrop-blur px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left: Mother Avatar & Info */}
        <div className="flex items-center gap-4">
          <Link to="/">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center animate-pulse cursor-pointer">
              <Bot className="w-6 h-6 text-white" />
            </div>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Mother v14.0</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs border-green-500/50 text-green-400">
                ● Operational
              </Badge>
              <span className="text-xs text-muted-foreground">Sydney, Australia</span>
            </div>
          </div>
        </div>

        {/* Center: Navigation */}
        <nav className="flex items-center gap-1">
          <Link to="/">
            <Button
              variant={location.pathname === '/' ? 'secondary' : 'ghost'}
              size="sm"
              className="text-sm"
            >
              Chat
            </Button>
          </Link>
          <Link to="/lineage">
            <Button
              variant={location.pathname === '/lineage' || location.pathname === '/dgm' ? 'secondary' : 'ghost'}
              size="sm"
              className="text-sm flex items-center gap-1.5"
            >
              <GitBranch className="w-3.5 h-3.5" />
              DGM Lineage
            </Button>
          </Link>
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClearChat}
            className="text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSettings}
            className="text-muted-foreground hover:text-foreground"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
