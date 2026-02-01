// src/popup.js - Solo UI e messaggi
document.addEventListener('DOMContentLoaded', initPopup);

async function initPopup() {
  document.getElementById('add-page').onclick = addCurrentPage;
  document.getElementById('generate-epub').onclick = generateEPUB;
  document.getElementById('clear-all').onclick = clearAll;
  
  await updateList();
}

async function addCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const btn = document.getElementById('add-page');
  btn.disabled = true;
  btn.textContent = '⏳ Attendi...';

  try {
    const pageData = await chrome.tabs.sendMessage(tab.id, { action: 'extractPage' });
    await chrome.runtime.sendMessage({ action: 'addPage', data: pageData });
    
    btn.textContent = '✅ Aggiunta!';
    setTimeout(() => {
      btn.textContent = '➕ Aggiungi pagina';
      btn.disabled = false;
    }, 1000);
    
    await updateList();
  } catch (error) {
    alert('Errore: ' + error.message);
    btn.disabled = false;
    btn.textContent = '➕ Aggiungi pagina';
  }
}

async function generateEPUB() {
  const title = prompt('Titolo EPUB:', 'Raccolta Web') || 'Raccolta Web';
  const btn = document.getElementById('generate-epub');
  btn.disabled = true;
  btn.textContent = '📤 Generando...';

  try {
    await chrome.runtime.sendMessage({ 
      action: 'generateEPUB', 
      metadata: { title } 
    });
    btn.textContent = '✅ Scaricato!';
    setTimeout(() => window.close(), 1500);
  } catch (error) {
    alert('Errore: ' + error.message);
    btn.disabled = false;
    btn.textContent = '📖 Genera EPUB';
  }
}

async function clearAll() {
  if (!confirm('Cancellare tutto?')) return;
  await chrome.runtime.sendMessage({ action: 'clearAll' });
  await updateList();
}

async function updateList() {
  const response = await chrome.runtime.sendMessage({ action: 'getPages' });
  const list = document.getElementById('page-list');
  const generateBtn = document.getElementById('generate-epub');
  const clearBtn = document.getElementById('clear-all');
  
  const hasPages = response.pages && response.pages.length > 0;
  
  generateBtn.disabled = !hasPages;
  clearBtn.disabled = !hasPages;
  
  if (!hasPages) {
    list.innerHTML = '<div style="padding:30px;text-align:center;color:#999">Nessuna pagina</div>';
  } else {
    list.innerHTML = response.pages.map((p, i) => 
      `<div style="padding:10px;border-bottom:1px solid #eee">
        ${i+1}. 📄 ${p.metadata.title.substring(0, 50)}
        <small style="color:#999;display:block">${p.wordCount} parole</small>
      </div>`
    ).join('');
  }
  
  document.getElementById('stats').textContent = 
    `${response.pages?.length || 0} pagine • ${response.pages?.reduce((sum, p) => sum + p.wordCount, 0) || 0} parole`;
}
