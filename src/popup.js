// src/popup.js
document.addEventListener('DOMContentLoaded', initPopup);

async function initPopup() {
  document.getElementById('add-page').onclick = addCurrentPage;
  document.getElementById('generate-epub').onclick = generateEPUB;
  document.getElementById('send-epub').onclick = detectXteink;  
  document.getElementById('clear-all').onclick = clearAll;
  
  // Xteink controls
  document.getElementById('detect-xteink').onclick = detectXteink;
  document.getElementById('send-to-xteink').onclick = sendToXteink;
  document.getElementById('xteink-settings-btn').onclick = toggleSettings;
  document.getElementById('save-xteink-settings').onclick = saveXteinkSettings;
  
  await updateList();
  await loadXteinkSettings();
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
    const result = await chrome.runtime.sendMessage({ 
      action: 'generateEPUB', 
      metadata: { title },
      saveForXteink: true  // Salva per invio Xteink
    });
    
    if (result.success) {
      btn.textContent = '✅ Generato!';
      
      // Mostra sezione Xteink
      document.getElementById('xteink-section').style.display = 'block';
      
      // Auto-rileva dispositivo
      
      setTimeout(() => {
        btn.textContent = '📖 Genera EPUB';
        btn.disabled = false;
      }, 2000);
    }
  } catch (error) {
    alert('Errore: ' + error.message);
    btn.disabled = false;
    btn.textContent = '📖 Genera EPUB';
  }
}

async function detectXteink() {
  const statusDiv = document.getElementById('xteink-status');
  const sendBtn = document.getElementById('send-to-xteink');
  
  statusDiv.innerHTML = '🔍 Cercando Xteink X4...';
  sendBtn.disabled = true;

  try {
    const result = await chrome.runtime.sendMessage({ action: 'detectXteink' });
    
    if (result.connected) {
      statusDiv.innerHTML = '✅ <strong>Xteink X4 connesso!</strong>';
      statusDiv.className = 'status-success';
      sendBtn.disabled = false;
    } else {
      statusDiv.innerHTML = `⚠️ <strong>Dispositivo non trovato</strong><br><small>${result.error}</small><br><small>Connetti al Wi-Fi Xteink e riprova</small>`;
      statusDiv.className = 'status-warning';
      sendBtn.disabled = true;
    }
  } catch (error) {
    statusDiv.innerHTML = `❌ Errore: ${error.message}`;
    statusDiv.className = 'status-error';
    sendBtn.disabled = true;
  }
}

async function sendToXteink() {
  const btn = document.getElementById('send-to-xteink');
  const progressDiv = document.getElementById('xteink-progress');
  const progressBar = document.getElementById('xteink-progress-bar');
  const progressText = document.getElementById('xteink-progress-text');
  const resultDiv = document.getElementById('xteink-result');
  
  btn.disabled = true;
  btn.textContent = '📤 Invio...';
  progressDiv.style.display = 'block';
  resultDiv.innerHTML = '';
  
  // Listener per progresso
  const progressListener = (message) => {
    if (message.action === 'uploadProgress') {
      progressBar.value = message.progress;
      progressText.textContent = `${message.progress}%`;
    }
  };
  chrome.runtime.onMessage.addListener(progressListener);

  try {
    const result = await chrome.runtime.sendMessage({ 
      action: 'uploadToXteink',
      filename: 'book.epub'
    });
    
    if (result.success) {
      resultDiv.innerHTML = '✅ <strong>EPUB inviato a Xteink X4!</strong><br><small>Controlla il dispositivo</small>';
      resultDiv.className = 'status-success';
      progressBar.value = 100;
      progressText.textContent = '100%';
    }
  } catch (error) {
    resultDiv.innerHTML = `❌ <strong>Errore invio:</strong><br><small>${error.message}</small>`;
    resultDiv.className = 'status-error';
  } finally {
    chrome.runtime.onMessage.removeListener(progressListener);
    btn.textContent = '📡 Invia a Xteink';
    btn.disabled = false;
    setTimeout(() => {
      progressDiv.style.display = 'none';
    }, 3000);
  }
}

function toggleSettings() {
  const settingsDiv = document.getElementById('xteink-settings');
  const isVisible = settingsDiv.style.display !== 'none';
  settingsDiv.style.display = isVisible ? 'none' : 'block';
}

async function loadXteinkSettings() {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'getXteinkSettings' });
    if (result.success) {
      document.getElementById('xteink-ip').value = result.settings.ip;
      document.getElementById('xteink-port').value = result.settings.port;
    }
  } catch (error) {
    console.error('Errore caricamento settings:', error);
  }
}

async function saveXteinkSettings() {
  const ip = document.getElementById('xteink-ip').value;
  const port = parseInt(document.getElementById('xteink-port').value);
  
  if (!ip || !port) {
    alert('Inserisci IP e porta validi');
    return;
  }

  try {
    await chrome.runtime.sendMessage({ 
      action: 'saveXteinkSettings',
      settings: { ip, port }
    });
    
    alert('✅ Impostazioni salvate!');
    toggleSettings();
  } catch (error) {
    alert('❌ Errore salvataggio: ' + error.message);
  }
}

async function clearAll() {
  if (!confirm('Cancellare tutto?')) return;
  await chrome.runtime.sendMessage({ action: 'clearAll' });
  document.getElementById('xteink-section').style.display = 'none';
  await updateList();
}

async function updateList() {
  const response = await chrome.runtime.sendMessage({ action: 'getPages' });
  const list = document.getElementById('page-list');
  const generateBtn = document.getElementById('generate-epub');
  const sendEpubBtn = document.getElementById('send-epub');
  const clearBtn = document.getElementById('clear-all');
  
  const hasPages = response.pages && response.pages.length > 0;
  
  generateBtn.disabled = !hasPages;
  sendEpubBtn.disabled = !hasPages;
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
