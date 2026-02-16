import { useState, KeyboardEvent } from 'react';
import { useMother } from '@/contexts/MotherContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';

export default function ChatInput() {
  const [input, setInput] = useState('');
  const { sendMessage, isTyping } = useMother();

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const message = input.trim();
    setInput('');
    await sendMessage(message);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
      <div className="container max-w-4xl mx-auto flex gap-3 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message to Mother..."
          className="min-h-[60px] max-h-[200px] resize-none bg-card border-border focus:border-blue-500 transition-colors"
          disabled={isTyping}
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || isTyping}
          size="lg"
          className="h-[60px] px-6 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-105"
        >
          <Send className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
