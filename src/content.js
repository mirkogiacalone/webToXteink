// content.js - Estrazione UNIVERSALE senza librerie
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractPage') {
    try {
      const result = extractCleanContent();
      sendResponse(result);
    } catch (error) {
      sendResponse({ 
        error: error.message,
        metadata: { title: document.title, url: location.href },
        content: document.body.innerText.substring(0, 50000),
        wordCount: 0 
      });
    }
  }
  return true;
});

function extractCleanContent() {
  // 1. Trova articolo principale (euristica intelligente)
  const selectors = [
    'article',
    '.article, .post, .story',
    '.content, .entry-content',
    'main',
    '[role="main"]',
    document.body
  ];

  let article = null;
  for (const selector of selectors) {
    article = document.querySelector(selector);
    if (article && article.children.length > 3) break;
  }

  if (!article) article = document.body;

  // 2. Clona e pulisci (rimuovi schifezze)
  const cleanClone = article.cloneNode(true);
  
  // Rimuovi elementi inutili
  const trashSelectors = [
    'nav', 'header', 'footer', 'aside', 'script', 'style',
    '.ad, .ads, [class*="ad-"]', '.sidebar', '[id*="ad"]',
    '.social', '.share', '.comment', 'iframe'
  ];
  
  trashSelectors.forEach(sel => {
    cleanClone.querySelectorAll(sel).forEach(el => el.remove());
  });

  // 3. Metadati
  const metadata = {
    title: document.title.substring(0, 100) || 'Senza titolo',
    url: location.href,
    author: findAuthor(),
    siteName: location.hostname
  };

  // 4. Conteggio parole
  const text = cleanClone.textContent || '';
  const wordCount = text.split(/\s+/).filter(w => w.length > 2).length;

  // 5. Mantieni HTML leggibile
  let content = cleanClone.innerHTML;
  
  // Pulizia finale
  content = content
    .replace(/<a[^>]*>([^<]+)<\/a>/g, '$1')  // Rimuovi link ma tieni testo
    .replace(/&nbsp;/g, ' ')
    .replace(/<br[^>]*>/g, '<br>');

  return {
    metadata,
    content,
    wordCount: Math.min(wordCount, 50000),  // Limite performance
    success: true
  };
}

function findAuthor() {
  const selectors = [
    'meta[name="author"]',
    '.author, .byline',
    '[rel="author"]'
  ];
  
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      return el.getAttribute('content') || el.textContent?.trim().substring(0, 50);
    }
  }
  return 'Autore sconosciuto';
}
