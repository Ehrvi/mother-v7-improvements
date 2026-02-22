import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Sparkles, Brain, Shield, Zap, TrendingDown } from "lucide-react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "mother";
  content: string;
  timestamp: Date;
  // MOTHER v14 metrics
  tier?: string;
  qualityScore?: number;
  costReduction?: number;
  responseTime?: number;
  cacheHit?: boolean;
}

export default function Home() {
  const [, setLocation] = useLocation();
  
  // Authentication state from tRPC
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
  });

  // 🔒 LOGIN PROTECTION: Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A0A0F] via-[#1A0B2E] to-[#0A0A0F] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#B026FF]"></div>
          <p className="mt-4 text-[#B026FF]">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "mother",
      content:
        "Olá! Sou **MOTHER v14** (Multi-Operational Tiered Hierarchical Execution & Routing) - um sistema de IA avançado com **91% de redução de custo** e **qualidade 94+**. Como posso ajudá-lo hoje?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const queryMutation = trpc.mother.query.useMutation({
    onSuccess: data => {
      const motherMessage: Message = {
        id: Date.now().toString(),
        role: "mother",
        content: data.response,
        timestamp: new Date(),
        tier: data.tier,
        qualityScore: data.quality.qualityScore,
        costReduction: data.costReduction,
        responseTime: data.responseTime,
        cacheHit: data.cacheHit,
      };

      setMessages(prev => [...prev, motherMessage]);

      // Show metrics toast
      toast.success("Query processado!", {
        description: `Tier: ${data.tier} | Quality: ${data.quality.qualityScore}/100 | Cost: ${data.costReduction.toFixed(1)}% redução | ${data.responseTime}ms`,
      });
    },
    onError: error => {
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "mother",
        content: `Erro: ${error.message}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      toast.error("Erro ao processar query");
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || queryMutation.isPending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");

    // Call MOTHER v14 API
    queryMutation.mutate({ query: input });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Neural Network Background */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url('https://private-us-east-1.manuscdn.com/sessionFile/yDOh1drRC17hH4IE2yNbMg/sandbox/74Is2QEW2SGShVduCUHHb6-img-1_1771297027000_na1fn_bW90aGVyLWhlcm8tYmFja2dyb3VuZA.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUveURPaDFkclJDMTdoSDRJRTJ5TmJNZy9zYW5kYm94Lzc0SXMyUUVXMlNHU2hWZHVDVUhIYjYtaW1nLTFfMTc3MTI5NzAyNzAwMF9uYTFmbl9iVzkwYUdWeUxXaGxjbTh0WW1GamEyZHliM1Z1WkEucG5nP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=V-LLAHnQs1xXOym~0rZUSVF5p2~NdSxmrzWecaT4-DeYdTFFh3i52cgSzhoz5BebbbftnYLEEQbSUaX7iWugNplBm2BIFvgO24WyQZGthIfx5-vAWvjvji1y2JiEESGM~lUEztYLlNeyO~PQipJ6nWofNXmOpkGJ0Ujrjqjjgo6hYNo4YBfKp9yY9p2Ykr-td5gMILog5hkPX6NOIZEisKjAsWr~fFDorXjSXaciF7A8w7xtIvdtYkq0ITICaMsUDlMox4cgPHI6148JQowbg1X8vGxf~dtdHGKozdLDCTHNm62jPvuRovq5wIAULI5VkUdsUBknsAdeHlln687ZkQ__')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* Hexagonal Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `url('https://private-us-east-1.manuscdn.com/sessionFile/yDOh1drRC17hH4IE2yNbMg/sandbox/74Is2QEW2SGShVduCUHHb6-img-3_1771297020000_na1fn_bW90aGVyLWNoYXQtcGF0dGVybg.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUveURPaDFkclJDMTdoSDRJRTJ5TmJNZy9zYW5kYm94Lzc0SXMyUUVXMlNHU2hWZHVDVUhIYjYtaW1nLTNfMTc3MTI5NzAyMDAwMF9uYTFmbl9iVzkwYUdWeUxXTm9ZWFF0Y0dGMGRHVnliZy5wbmc~eC1vc3MtcHJvY2Vzcz1pbWFnZS9yZXNpemUsd18xOTIwLGhfMTkyMC9mb3JtYXQsd2VicC9xdWFsaXR5LHFfODAiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=qtw2VlpUQfF7kp6ygqKNIEwI9b9MmXlcdK3rDvivTPqaE9wWfRjyDJ5i4oz1gVRQqYUCKaUGZfZhDCzj6KeuJXN-r12YDjgiE2WBQOfZi5B8S7duJQNv3vtsa0oU68AzL5U1O70IlC4JmQgQbG2pSzxnYIui~OytxpwFoHsNh3-Mw3nG4IuEK0ttK44ILNV-tXKRAAf7KtHQs55ZXpRcvFIDk3ULVOIcMkl3HFYyJZn6y~sBknQSnUPxerT1zrytwJbxuRu9zKDw~eu5MmWgK5yDJphDjfR0SfpxmcJD3f0ycAMDE3zmC4VNu3-~UhH9dNA9Lx588698fojkDA8BbQ__')`,
          backgroundSize: "400px 400px",
          backgroundRepeat: "repeat",
        }}
      />

      {/* Main Content */}
      <div className="relative z-10 container mx-auto px-4 py-8 h-screen flex flex-col">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src="https://private-us-east-1.manuscdn.com/sessionFile/yDOh1drRC17hH4IE2yNbMg/sandbox/74Is2QEW2SGShVduCUHHb6_1771297033959_na1fn_bW90aGVyLWxvZ28tb3Ji.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUveURPaDFkclJDMTdoSDRJRTJ5TmJNZy9zYW5kYm94Lzc0SXMyUUVXMlNHU2hWZHVDVUhIYjZfMTc3MTI5NzAzMzk1OV9uYTFmbl9iVzkwYUdWeUxXeHZaMjh0YjNKaS5wbmc~eC1vc3MtcHJvY2Vzcz1pbWFnZS9yZXNpemUsd18xOTIwLGhfMTkyMC9mb3JtYXQsd2VicC9xdWFsaXR5LHFfODAiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=wARwwEWiZXKBEuL80Tf29MRgzR2CN73Qt0WDfTSzTYWRQZOe9SwGgf5XHvzFNep3t72r-q~eZakvqL-MdCacOzGGGhr0SaKL0Ve~qgUS2xtRDa5UtVejN36GjfsTqlu2AxVxGByTDx~BASvkQFaotPVeH2gsP0CNmhzT09iviID2HHKNpSpfjRcbDGHpeL7wtJ6e7ZJgjPFgtFdTEblAFKRFNQRic~1t14k2HzOB7v9pBASAVGHaiVvgBm8jWomwB4glpaeoIgn~qQkslVseHbhdnTds3O8E5fcpFmSnJHKt69pKUVaAgpSxbnLki3QHxgS28iz2XAFzWxnwFedq8w__"
                alt="Mother Consciousness Orb"
                className="w-16 h-16 animate-float animate-neural-pulse"
              />
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-[#B026FF] to-[#00F5FF] bg-clip-text text-transparent">
                  M O T H E R
                </h1>
                <p className="text-sm text-muted-foreground font-mono">
                  v7.0 - Multi-Operational Tiered Hierarchical Execution & Routing | 91% Cost Reduction | 94+ Quality
                </p>
              </div>
            </div>

            {/* Auth Section */}
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <div className="text-sm">
                    <div className="text-muted-foreground">Logged in as</div>
                    <div className="font-semibold text-[#00F5FF]">
                      {user.name}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      logoutMutation.mutate();
                      toast.success("Logged out successfully");
                    }}
                    disabled={logoutMutation.isPending}
                    className="border-[#B026FF]/30 hover:bg-[#B026FF]/10"
                  >
                    {logoutMutation.isPending ? "Logging out..." : "Logout"}
                  </Button>
                </>
              ) : (
                <div className="flex gap-2">
                  <Link href="/login">
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-gradient-to-r from-[#B026FF] to-[#00F5FF] hover:opacity-90"
                    >
                      Login
                    </Button>
                  </Link>
                  <Link href="/signup">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[#B026FF]/30 hover:bg-[#B026FF]/10"
                    >
                      Sign Up
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Chat Container */}
        <div className="flex-1 glass rounded-2xl p-6 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4">
            {messages.map(message => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl p-4 ${
                    message.role === "user"
                      ? "bg-gradient-to-br from-[#B026FF] to-[#00F5FF] text-white"
                      : "glass border border-[#B026FF]/30"
                  }`}
                >
                  <div className="prose prose-invert max-w-none">
                    {message.content.split("**").map((part, i) =>
                      i % 2 === 0 ? (
                        <span key={i}>{part}</span>
                      ) : (
                        <strong key={i} className="text-[#00F5FF]">
                          {part}
                        </strong>
                      )
                    )}
                  </div>

                  {/* MOTHER v14 Metrics */}
                  {message.role === "mother" && message.tier && (
                    <div className="mt-3 pt-3 border-t border-[#B026FF]/20 flex flex-wrap gap-2 text-xs">
                      <div className="flex items-center gap-1 bg-[#B026FF]/10 px-2 py-1 rounded">
                        <Brain className="w-3 h-3 text-[#B026FF]" />
                        <span className="text-[#B026FF]">{message.tier}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-[#00F5FF]/10 px-2 py-1 rounded">
                        <Shield className="w-3 h-3 text-[#00F5FF]" />
                        <span className="text-[#00F5FF]">
                          Q: {message.qualityScore}/100
                        </span>
                      </div>
                      <div className="flex items-center gap-1 bg-green-500/10 px-2 py-1 rounded">
                        <TrendingDown className="w-3 h-3 text-green-400" />
                        <span className="text-green-400">
                          {message.costReduction?.toFixed(1)}% ↓
                        </span>
                      </div>
                      <div className="flex items-center gap-1 bg-yellow-500/10 px-2 py-1 rounded">
                        <Zap className="w-3 h-3 text-yellow-400" />
                        <span className="text-yellow-400">
                          {message.responseTime}ms
                        </span>
                      </div>
                      {message.cacheHit && (
                        <div className="flex items-center gap-1 bg-purple-500/10 px-2 py-1 rounded">
                          <span className="text-purple-400">⚡ Cached</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-xs opacity-50 mt-2">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}

            {queryMutation.isPending && (
              <div className="flex justify-start">
                <div className="glass border border-[#B026FF]/30 rounded-2xl p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#B026FF] animate-pulse-glow" />
                    <span className="text-sm text-muted-foreground">
                      MOTHER está processando (7 camadas)...
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Converse com MOTHER v14..."
              className="flex-1 glass border-[#B026FF]/30 focus:border-[#00F5FF] transition-colors"
              disabled={queryMutation.isPending}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || queryMutation.isPending}
              className="bg-gradient-to-r from-[#B026FF] to-[#00F5FF] hover:opacity-90 transition-opacity neon-glow"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-4 text-center text-xs text-muted-foreground font-mono">
          <p>
            MOTHER v14 - Multi-Operational Tiered Hierarchical Execution &
            Routing
          </p>
          <p className="opacity-50">
            7 Layers | 3-Tier LLM Routing | Guardian Quality System | Continuous
            Learning 💜
          </p>
        </footer>
      </div>
    </div>
  );
}
