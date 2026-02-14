// src/popup.js
document.addEventListener('DOMContentLoaded', initPopup);

async function initPopup() {
  document.getElementById('add-page').onclick = addCurrentPage;
  document.getElementById('generate-epub').onclick = downloadEPUB;
  document.getElementById('send-epub').onclick = sendEPUB;
  document.getElementById('clear-all').onclick = clearAll;
  
  // Xteink controls
  document.getElementById('detect-xteink').onclick = detectXteink;
  document.getElementById('send-to-xteink').onclick = sendToXteink;
  document.getElementById('xteink-settings-btn').onclick = toggleSettings;
  document.getElementById('save-xteink-settings').onclick = saveXteinkSettings;
  document.getElementById('run-diagnostics').onclick = runDiagnostics;
  
  await updateList();
  await loadXteinkSettings();
}

async function addCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const btn = document.getElementById('add-page');
  btn.disabled = true;
  btn.textContent = '⏳ Loading...';

  try {
    const pageData = await chrome.tabs.sendMessage(tab.id, { action: 'extractPage' });
    await chrome.runtime.sendMessage({ action: 'addPage', data: pageData });
    
    btn.textContent = '✅ Added!';
    setTimeout(() => {
      btn.textContent = '➕ Add Current Page';
      btn.disabled = false;
    }, 1000);
    
    await updateList();
  } catch (error) {
    alert('Errore: ' + error.message);
    btn.disabled = false;
    btn.textContent = '➕ Add Current Page';
  }
}

async function generateEPUB() {
  const response = await chrome.runtime.sendMessage({ action: 'getPages' });
  const pages = response.pages;
  const title = pages[0]?.metadata?.title || 'Web';

  const btn = document.getElementById('generate-epub');
  btn.disabled = true;
  btn.textContent = '📤 Generating...';

  try {
    const result = await chrome.runtime.sendMessage({ 
      action: 'generateEPUB', 
      metadata: { title },
      saveForXteink: true
    });
    
    if (result.success) {
      btn.textContent = '✅ Generated!';
      
      setTimeout(() => {
        btn.textContent = '📖 Download EPUB';
        btn.disabled = false;
      }, 2000);
    }
    
    return result;
  } catch (error) {
    alert('Errore: ' + error.message);
    btn.disabled = false;
    btn.textContent = '📖 Download EPUB';
    throw error;
  }
}

async function downloadEPUB() {
  await generateEPUB();

  const btn = document.getElementById('generate-epub');
  btn.disabled = true;
  btn.textContent = '⬇️ Downloading...';

  try {
    const result = await chrome.runtime.sendMessage({ 
      action: 'downloadEPUB'
    });
    
    if (result.success) {
      btn.textContent = '✅ Downloaded!';
           
      setTimeout(() => {
        btn.textContent = '📖 Download EPUB';
        btn.disabled = false;
      }, 2000);
    }
  } catch (error) {
    alert('Errore: ' + error.message);
    btn.disabled = false;
    btn.textContent = '📖 Download EPUB';
  }
}

async function sendEPUB() {
  document.getElementById('xteink-section').style.display = 'block';     
  setTimeout(detectXteink, 500);
}

async function detectXteink() {
  const statusDiv = document.getElementById('xteink-status');
  const sendBtn = document.getElementById('send-to-xteink');
  
  statusDiv.innerHTML = '🔍 Cercando Xteink X4...';
  sendBtn.disabled = true;

  try {
    const result = await chrome.runtime.sendMessage({ action: 'detectXteink' });
    
    if (result.connected) {
      statusDiv.innerHTML = '✅ <strong>Xteink X4 connected!</strong>';
      statusDiv.className = 'status-success';
      sendBtn.disabled = false;
    } else {
      statusDiv.innerHTML = `⚠️ <strong>Device not found</strong><br><small>${result.error}</small><br><small>Connect to Xteink Wi-Fi and try again</small>`;
      statusDiv.className = 'status-warning';
      sendBtn.disabled = true;
    }
  } catch (error) {
    statusDiv.innerHTML = `❌ Error: ${error.message}`;
    statusDiv.className = 'status-error';
    sendBtn.disabled = true;
  }
}

async function runDiagnostics() {
  const btn = document.getElementById('run-diagnostics');
  const resultDiv = document.getElementById('xteink-result');
  
  btn.disabled = true;
  btn.textContent = '🔧 Testing...';
  resultDiv.innerHTML = '⏳ Diagnostic execution...';
  
  try {
    const result = await chrome.runtime.sendMessage({ action: 'runDiagnostics' });
    
    if (result.success) {
      resultDiv.innerHTML = `
        <strong>✅ Diagnostic completed</strong><br>
        <small>
        IP: ${result.diagnostics.ip}<br>
        Ping: ${result.diagnostics.ping ? '✅' : '❌'}<br>
        Porta aperta: ${result.diagnostics.portOpen ? '✅' : '❌'}<br>
        Dettagli: ${result.diagnostics.details}
        </small>
      `;
    } else {
      resultDiv.innerHTML = `❌ ${result.error}`;
    }
  } catch (error) {
    resultDiv.innerHTML = `❌ Error: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔧 Diagnostics';
  }
}

async function sendToXteink() {
  await generateEPUB();
  
  const btn = document.getElementById('send-to-xteink');
  const progressDiv = document.getElementById('xteink-progress');
  const progressBar = document.getElementById('xteink-progress-bar');
  const progressText = document.getElementById('xteink-progress-text');
  const resultDiv = document.getElementById('xteink-result');
  
  btn.disabled = true;
  btn.textContent = '📤 Invio...';
  progressDiv.style.display = 'block';
  resultDiv.innerHTML = '';
  
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
    btn.textContent = '📡 Send to Xteink';
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
    console.error('Error loading settings:', error);
  }
}

async function saveXteinkSettings() {
  const ip = document.getElementById('xteink-ip').value;
  const port = parseInt(document.getElementById('xteink-port').value);
  
  if (!ip || !port) {
    alert('Enter valid IP and port');
    return;
  }

  try {
    await chrome.runtime.sendMessage({ 
      action: 'saveXteinkSettings',
      settings: { ip, port }
    });
    
    alert('✅ Settings saved!');
    toggleSettings();
  } catch (error) {
    alert('❌ Error: ' + error.message);
  }
}

async function clearAll() {
  if (!confirm('Are you sure you want to delete all pages?')) return;
  await chrome.runtime.sendMessage({ action: 'clearAll' });
  document.getElementById('xteink-section').style.display = 'none';
  await updateList();
}

async function updateList() {
  const response = await chrome.runtime.sendMessage({ action: 'getPages' });
  const list = document.getElementById('page-list');
  const generateBtn = document.getElementById('generate-epub');
  const sendtn = document.getElementById('send-epub');
  const clearBtn = document.getElementById('clear-all');
  
  const hasPages = response.pages && response.pages.length > 0;
  
  generateBtn.disabled = !hasPages;
  sendtn.disabled = !hasPages;
  clearBtn.disabled = !hasPages;
  
  if (!hasPages) {
    list.innerHTML = '<div class="empty-state">No pages added yet</div>';
  } else {
    list.innerHTML = response.pages.map((p, i) => 
      `<div style="padding:12px;border-bottom:1px solid var(--color-border)">
        <div style="color:var(--color-text-primary);font-weight:500;margin-bottom:4px">
          ${i+1}. 📄 ${p.metadata.title.substring(0, 50)}
        </div>
        <small style="color:var(--color-text-muted)">${p.wordCount} words</small>
      </div>`
    ).join('');
  }
  
  document.getElementById('stats').textContent = 
    `${response.pages?.length || 0} pages • ${response.pages?.reduce((sum, p) => sum + p.wordCount, 0) || 0} words`;
}