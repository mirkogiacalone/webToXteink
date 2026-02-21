// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractPage') {
    try {
      setTimeout(() => {
        const result = extractCleanContent();
        sendResponse(result);
      }, 1500);
      return true;
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
  // JSON-LD
  const jsonLdContent = extractFromJsonLd();
  if (jsonLdContent) {
    return jsonLdContent;
  }

  let article = document.querySelector('.atext') ||
                document.querySelector('.art_content') ||
                document.querySelector('.article-body') ||
                document.querySelector('[data-testid="article-body"]') ||
                document.querySelector('.font-nunito.font-nunito') ||
                document.querySelector('[id*="widget-parent"]') ||
                document.querySelector('.markdown-viewer') ||
                document.querySelector('article') ||
                document.querySelector('main') ||
                document.querySelector('[role="main"]') ||
                document.querySelector('.content');

  if (!article) {
    const candidates = Array.from(document.querySelectorAll('div')).filter(div => {
      const paragraphs = div.querySelectorAll('p');
      return paragraphs.length > 3;
    });
    article = candidates.sort((a, b) => 
      b.querySelectorAll('p').length - a.querySelectorAll('p').length
    )[0] || document.body;
  }

  const processedElements = new Set();
  const cleanClone = document.createElement('div');
  
  const contentElements = article.querySelectorAll('h1, h2, h3, h4, h5, h6, p, ul, ol, blockquote, pre, code, img, figure, strong, em, b, i');
  
  contentElements.forEach(el => {
 
    if (el.tagName.toLowerCase() === 'h1') {
      processedElements.add(el);
      return;
    }

    if (processedElements.has(el)) return;
    
    let parent = el.parentElement;
    while (parent && parent !== article) {
      if (processedElements.has(parent)) return;
      parent = parent.parentElement;
    }
    
    if (el.closest('nav, header, footer, aside, .breadcrumb, [class*="breadcrumb"]')) {
      return;
    }
    
    if (el.tagName.toLowerCase() === 'img') {
      const imgClone = cleanImage(el);
      if (imgClone) {
        cleanClone.appendChild(imgClone);
        processedElements.add(el);
      }
      return;
    }
    
    if (el.tagName.toLowerCase() === 'figure') {
      const figClone = cleanFigure(el);
      if (figClone) {
        cleanClone.appendChild(figClone);
        processedElements.add(el);
        el.querySelectorAll('img').forEach(img => processedElements.add(img));
      }
      return;
    }
    
    if (el.tagName.toLowerCase() === 'ul' || el.tagName.toLowerCase() === 'ol') {
      const cleaned = cleanElement(el);
      if (cleaned) {
        cleanClone.appendChild(cleaned);
        processedElements.add(el);
        el.querySelectorAll('*').forEach(child => processedElements.add(child));
      }
      return;
    }
    
    const text = el.textContent.trim();
    if (text.length < 10 && !['pre', 'code', 'strong', 'em', 'b', 'i'].includes(el.tagName.toLowerCase())) {
      return;
    }
    
    const navKeywords = /^(home|back|next|previous|completed|ask a question|login|sign|menu|share|related|subscribe|we'll cover|abbonati|accedi|registrati)/i;
    if (navKeywords.test(text)) return;
    
    const cleaned = cleanElement(el);
    if (cleaned) {
      cleanClone.appendChild(cleaned);
      processedElements.add(el);
    }
  });

  const metadata = {
    title: extractMainTitle() || document.title.replace(/\s*\|.*$/, '').substring(0, 100) || 'No title',
    url: location.href,
    author: findAuthor(),
    siteName: location.hostname
  };

  const text = cleanClone.textContent || '';
  const wordCount = text.split(/\s+/).filter(w => w.length > 2).length;


  let content = `<h1>${metadata.title}</h1>\n${cleanClone.innerHTML}`;
  content = makeXHTMLCompliant(content);

  return {
    metadata,
    content,
    wordCount: Math.min(wordCount, 50000),
    success: wordCount > 50
  };
}

function extractFromJsonLd() {
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent);
      
      let articleData = data;
      if (Array.isArray(data)) {
        articleData = data.find(item => 
          item['@type'] === 'NewsArticle' || item['@type'] === 'Article'
        );
      }
      
      if (!articleData || !articleData.articleBody) continue;
      
      const title = articleData.headline || articleData.name || '';
      const author = articleData.author?.name || articleData.author || '';
      const datePublished = articleData.datePublished || '';
      const articleBody = articleData.articleBody || '';
      
      if (!articleBody || articleBody.length < 100) continue;
      
      const paragraphs = articleBody
        .split(/\n\n+/)
        .filter(p => p.trim().length > 20)
        .map(p => `<p>${p.trim()}</p>`)
        .join('\n');
      
      const content = `<h1>${title}</h1>\n${paragraphs}`;
      const wordCount = articleBody.split(/\s+/).filter(w => w.length > 2).length;
      
      return {
        metadata: {
          title: title,
          url: location.href,
          author: author || 'Autore sconosciuto',
          siteName: location.hostname,
          datePublished: datePublished
        },
        content: makeXHTMLCompliant(content),
        wordCount: wordCount,
        success: true,
        extractedFrom: 'JSON-LD'
      };
      
    } catch (e) {
      console.log('Errore parsing JSON-LD:', e);
      continue;
    }
  }
  
  return null;
}

function cleanImage(img) {
  const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
  
  if (!src || src.includes('icon') || src.includes('logo') || src.includes('avatar')) {
    return null;
  }
  
  const wrapper = document.createElement('div');
  wrapper.setAttribute('class', 'image-wrapper');
  
  const cleanImg = document.createElement('img');
  cleanImg.src = src;
  
  const alt = img.alt || img.title || '';
  if (alt) {
    cleanImg.alt = alt;
  }
  
  wrapper.appendChild(cleanImg);
  return wrapper;
}

function cleanFigure(figure) {
  const img = figure.querySelector('img');
  if (!img) return null;
  
  const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
  
  if (!src || src.includes('icon') || src.includes('logo') || src.includes('avatar')) {
    return null;
  }
  
  const cleanFig = document.createElement('div');
  cleanFig.setAttribute('class', 'figure');
  
  const imgWrapper = document.createElement('div');
  const cleanImg = document.createElement('img');
  cleanImg.src = src;
  
  const alt = img.alt || img.title || '';
  if (alt) {
    cleanImg.alt = alt;
  }
  
  imgWrapper.appendChild(cleanImg);
  cleanFig.appendChild(imgWrapper);
  
  const caption = figure.querySelector('figcaption');
  if (caption && caption.textContent.trim()) {
    const cleanCap = document.createElement('p');
    cleanCap.setAttribute('class', 'caption');
    cleanCap.textContent = caption.textContent.trim();
    cleanFig.appendChild(cleanCap);
  }
  
  return cleanFig;
}

function cleanElement(el) {
  const tagName = el.tagName.toLowerCase();
  const text = el.textContent.trim();
  
  if (!text || (text.length < 10 && !['pre', 'code', 'strong', 'em', 'b', 'i'].includes(tagName))) {
    return null;
  }
  
  const clean = document.createElement(tagName);
  
  if (tagName === 'ul' || tagName === 'ol') {
    const items = el.querySelectorAll(':scope > li');
    items.forEach(li => {
      const liText = li.textContent.trim();
      if (liText.length > 5) {
        const newLi = document.createElement('li');
        newLi.textContent = liText;
        clean.appendChild(newLi);
      }
    });
    return clean.children.length > 0 ? clean : null;
  }
  
  if (tagName === 'pre' || tagName === 'code') {
    clean.textContent = text;
    return clean;
  }
  
  clean.textContent = text;
  return clean;
}

function makeXHTMLCompliant(html) {
  return html
    .replace(/<img([^>]*[^/])>/gi, '<img$1 />')
    .replace(/<img>/gi, '<img />')
    .replace(/<br([^>]*[^/])>/gi, '<br$1 />')
    .replace(/<br>/gi, '<br />')
    .replace(/<hr([^>]*[^/])>/gi, '<hr$1 />')
    .replace(/<hr>/gi, '<hr />')
    .replace(/&nbsp;/g, ' ')
    .replace(/<br\s*\/?>\s*<br\s*\/?>/g, '</p><p>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractMainTitle() {
  const selectors = [
    'h1.aentry-title',
    'h1.art_title',
    'h1.heading-one',
    'article h1:first-of-type',
    'main h1:first-of-type',
    '.article-title, .post-title, .entry-title',
    'h1.title',
    'h1'
  ];
  
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.textContent.trim();
      if (text.length > 10 && text.length < 200 && !/home|menu|login/i.test(text)) {
        return text;
      }
    }
  }
  return null;
}

function findAuthor() {
  const selectors = [
    'meta[name="author"]',
    'meta[property="article:author"]',
    '.author-name, .byline, .auth',
    '[rel="author"]',
    '[itemprop="author"]'
  ];
  
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const author = el.getAttribute('content') || el.textContent?.trim();
      if (author && author.length > 2 && author.length < 100) {
        return author.replace(/^(by|di)\s+/i, '');
      }
    }
  }
  return 'Unknown author';
}
