// Contextual follow-up chips
// Scientific basis: Nielsen Norman Group — "AI Chat Interface Design" (2023/2024)
// NN/G: contextual follow-up chips reduce interaction cost vs blank text input
export function getFollowUpChips(content: string): string[] {
  const c = content.toLowerCase();
  if (c.includes('arquitetura') || c.includes('camada') || c.includes('layer'))
    return ['Como cada camada interage?', 'Mostre um diagrama', 'Comparar com transformers'];
  if (c.includes('memória') || c.includes('a-mem') || c.includes('zettelkasten'))
    return ['Como a memória evolui?', 'Exemplo de link semântico', 'Qual o limite de memória?'];
  if (c.includes('evolui') || c.includes('darwin') || c.includes('gödel') || c.includes('fitness'))
    return ['Como o fitness é calculado?', 'Frequência de auto-evolução', 'Exemplo de mutação'];
  if (c.includes('shms') || c.includes('sensor') || c.includes('estrutural') || c.includes('lstm'))
    return ['Ver histórico de anomalias', 'Configurar alertas', 'Explicar previsão LSTM'];
  if (c.includes('código') || c.includes('code') || c.includes('implementa') || c.includes('função'))
    return ['Adicionar testes', 'Otimizar performance', 'Explicar o código'];
  if (c.includes('erro') || c.includes('falha') || c.includes('exception') || c.includes('bug'))
    return ['Como reproduzir?', 'Sugerir correção', 'Ver stack trace completo'];
  if (c.includes('custo') || c.includes('cost') || c.includes('token'))
    return ['Como reduzir custo?', 'Ver breakdown por modelo', 'Otimizar prompts'];
  return ['Explique mais', 'Dar um exemplo prático', 'Quais as limitações?'];
}
