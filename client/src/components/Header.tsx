import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Settings, Trash2 } from "lucide-react";
import { useMother } from "@/contexts/MotherContext";
import { toast } from "sonner";

export default function Header() {
  const { clearMessages } = useMother();

  const handleClearChat = () => {
    if (confirm("Are you sure you want to clear all messages?")) {
      clearMessages();
      toast.success("Chat history cleared");
    }
  };

  const handleSettings = () => {
    toast.info("Settings - Feature coming soon");
  };

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left: Mother Avatar & Info */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center animate-pulse">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Mother v12.0</h1>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-xs border-green-500/50 text-green-400"
              >
                ● Operational
              </Badge>
              <span className="text-xs text-muted-foreground">
                Sydney, Australia
              </span>
            </div>
          </div>
        </div>

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
