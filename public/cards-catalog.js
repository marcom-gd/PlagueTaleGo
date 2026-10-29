export const deckIds = ['experiments', 'challenges'];
export const deckIcon = id => id === 'experiments'
  ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6M10 3v7L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M7 15h10"/><path d="M9 18h.01M13 16h.01"/></svg>'
  : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 13v5M8 21h8l-1-3H9Z"/></svg>';

export function validateDeck(deck, expectedId) {
  if(!deck || !deckIds.includes(deck.id) || deck.id!==expectedId || typeof deck.name!=='string' || !deck.name.trim() || deck.name.length>80 || typeof deck.description!=='string' || deck.description.length>500 || !Array.isArray(deck.cards) || deck.cards.length>300)throw Error('Invalid deck inventory.');
  const ids=new Set();
  for(const card of deck.cards){
    if(!card || typeof card.id!=='string' || !/^[a-z0-9-]{1,80}$/.test(card.id) || ids.has(card.id) || typeof card.title!=='string' || !card.title.trim() || card.title.length>120 || typeof card.task!=='string' || !card.task.trim() || card.task.length>2000 || typeof card.reflection!=='string' || card.reflection.length>1000)throw Error('Each card needs a unique stable ID, a title, a task, and a reflection prompt.');
    ids.add(card.id);
  }
  return deck;
}
