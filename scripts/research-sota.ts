
async function runResearch() {
  const query = "Utilizando ferramentas de busca na web, pesquise o estado da arte (SOTA) na literatura cientifica (arxiv, etc) em UX/UI, Design, arte, filosofia, psicologia, tecnologia, interface do usuario DGM (Darwin-twin) e acessibilidade. Descreva metodicamente como deve ser a aparencia e o funcionamento da interface visual de IA mais avancada do mundo para o Darwin-Twin Optimizer baseando-se nestas areas.";
  
  console.log("Buscando no servidor MOTHER local...");
  let res;
  try {
    res = await fetch("http://localhost:5000/api/mother/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, useCache: false })
    });
  } catch (e) {
    console.log("Servidor local falhou, tentando Cloud Run...");
    res = await fetch("https://mother-interface-qtvghovzxa-ts.a.run.app/api/mother/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, useCache: false })
    });
  }

  if (!res || !res.ok) {
    console.error("Falha ao comunicar com MOTHER:", res?.statusText);
    return;
  }

  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    const text = decoder.decode(chunk);
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) process.stdout.write(parsed.content);
          if (parsed.toolCalls) console.log("\n[MOTHER TOOL CALL]:", JSON.stringify(parsed.toolCalls));
        } catch (e) {
          // ignore parse error for chunk
        }
      }
    }
  }
}

runResearch();
