import { MotherProvider } from '@/contexts/MotherContext';
import Header from '@/components/Header';
import ChatInterface from '@/components/ChatInterface';
import ChatInput from '@/components/ChatInput';
import ApolloPanel from '@/components/ApolloPanel';

export default function Home() {
  return (
    <MotherProvider>
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex overflow-hidden">
          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col">
            <ChatInterface />
            <ChatInput />
          </div>
          {/* Apollo Panel */}
          <ApolloPanel />
        </div>
      </div>
    </MotherProvider>
  );
}
