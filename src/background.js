// src/background.js
import JSZip from 'jszip';
import { xteinkAPI } from './xteink-api.js';

let pages = [];
let lastGeneratedEPUB = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getPages': {
      sendResponse({ pages });
      break;
    }

    case 'addPage': {
      const pageId = 'p' + Date.now() + Math.random().toString(36).substr(2, 9);
      const newPage = {
        id: pageId,
        ...request.data,
        order: pages.length
      };
      pages.push(newPage);
      chrome.storage.local.set({ pages });
      sendResponse({ success: true, page: newPage });
      break;
    }

    case 'generateEPUB': {
      const title = request.metadata?.title || 'Raccolta Web';
      generateEPUB(title, request.saveForXteink || false)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }

    case 'downloadEPUB': {
      downloadEPUB()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }

    case 'clearAll': {
      pages = [];
      lastGeneratedEPUB = null;
      chrome.storage.local.remove(['pages']);
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ success: true });
      break;
    }

    case 'detectXteink': {
      detectXteinkDevice()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }

    case 'uploadToXteink': {
      uploadEPUBToXteink(request.filename)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }

    case 'getXteinkSettings': {
      xteinkAPI.loadSettings()
        .then(settings => sendResponse({ success: true, settings }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }

    case 'saveXteinkSettings': {
      xteinkAPI.saveSettings(request.settings)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }

    case 'runDiagnostics': {
      runXteinkDiagnostics()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }

    default:
      sendResponse({ error: 'Azione sconosciuta' });
  }
  return true;
});

function escapeHtml(text) {
  if (text === null || text === undefined) {
    return '';
  }
  
  const str = String(text);
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return str.replace(/[&<>"']/g, m => map[m]);
}

async function generateEPUB(title, saveForXteink = false) {
  try {
    console.log('📦 Start EPUB generation:', title);
    
    const zip = new JSZip();
    
    zip.file('mimetype', 'application/epub+zip', {compression: 'STORE'});
    
    zip.folder('META-INF').file('container.xml', 
`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
    
    const oebps = zip.folder('OEBPS');
    
    // valid XHTML chapters
    pages.forEach((page, index) => {
      const pageTitle = escapeHtml(page?.metadata?.title || `Chapter ${index + 1}`);
      const pageContent = page?.content || '<p>Content unavailable</p>';
      
      oebps.file(`chapter${index + 1}.xhtml`, 
`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="it" lang="it">
<head>
  <meta charset="UTF-8"/>
  <title>${pageTitle}</title>
  <style type="text/css">
    body {
      font-family: serif;
      font-size: 1em;
      line-height: 1.6;
      margin: 2%;
    }
    h1 {
      font-size: 1.8em;
      margin: 1em 0 0.5em 0;
      border-bottom: 2px solid #333;
      padding-bottom: 0.5em;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    p {
      margin: 1em 0;
    }
  </style>
</head>
<body>
  <h1>${pageTitle}</h1>
  ${pageContent.substring(0, 100000)}
</body>
</html>`);
    });
    
    const manifestItems = pages.map((_, i) => 
      `    <item id="chapter${i+1}" href="chapter${i+1}.xhtml" media-type="application/xhtml+xml"/>`
    ).join('\n');
    
    const spineItems = pages.map((_, i) => 
      `    <itemref idref="chapter${i+1}"/>`
    ).join('\n');
    
    const uuid = crypto.randomUUID ? `urn:uuid:${crypto.randomUUID()}` : `urn:uuid:${Date.now()}`;
    const firstPageAuthor = pages[0]?.metadata?.author || 'WebToXteink';
    
    oebps.file('content.opf', 
`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${uuid}</dc:identifier>
    <dc:title>${escapeHtml(title)}</dc:title>
    <dc:creator>${escapeHtml(firstPageAuthor)}</dc:creator>
    <dc:language>it</dc:language>
    <dc:date>${new Date().toISOString().split('T')[0]}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
  </metadata>
  <manifest>
${manifestItems}
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`);
    
    const navPoints = pages.map((page, i) => {
      const navTitle = escapeHtml(page?.metadata?.title || `Capitolo ${i + 1}`);
      return `    <navPoint id="navpoint-${i+1}" playOrder="${i+1}">
      <navLabel>
        <text>${navTitle}</text>
      </navLabel>
      <content src="chapter${i+1}.xhtml"/>
    </navPoint>`;
    }).join('\n');
    
    oebps.file('toc.ncx', 
`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeHtml(title)}</text>
  </docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`);
    
    console.log('🔧 ZIP Compression EPUB...');
    const epubBuffer = await zip.generateAsync({
      type: 'uint8array',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9
      }
    });
    
    console.log(`✅ EPUB generated: ${epubBuffer.length} bytes`);
    
    const safeTitle = String(title).replace(/[^a-zA-Z0-9\s\-_]/g, '_').substring(0, 200);
    const filename = `${safeTitle}.epub`;
    
    lastGeneratedEPUB = {
      buffer: epubBuffer,
      filename: filename,
      timestamp: Date.now()
    };
    
    console.log('💾 EPUB salvato in memoria per download/invio');
    
    return { success: true, saved: true, filename };
    
  } catch (error) {
    console.error('❌ Errore generazione EPUB:', error);
    throw error;
  }
}

async function downloadEPUB() {
  if (!lastGeneratedEPUB) {
    throw new Error('No EPUB generated. Generate an EPUB first.');
  }

  try {
    console.log('📥 Download EPUB:', lastGeneratedEPUB.filename);
    
    const epubBase64 = btoa(String.fromCharCode.apply(null, lastGeneratedEPUB.buffer));
    const dataUrl = `data:application/epub+zip;base64,${epubBase64}`;
    
    chrome.downloads.download({
      url: dataUrl,
      filename: lastGeneratedEPUB.filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('❌ Error:', chrome.runtime.lastError);
        throw new Error(chrome.runtime.lastError.message);
      } else {
        console.log('✅ EPUB downloaded! ID:', downloadId);
      }
    });
    
    return { success: true, filename: lastGeneratedEPUB.filename };
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

async function detectXteinkDevice() {
  await xteinkAPI.loadSettings();
  const result = await xteinkAPI.ping();
  console.log('🔍 Detection:', result);
  return result;
}

// Diagnostica Xteink
async function runXteinkDiagnostics() {
  await xteinkAPI.loadSettings();
  const diagnostics = await xteinkAPI.diagnostics();
  console.log('🔧 Diagnostics:', diagnostics);
  return { success: true, diagnostics };
}

async function uploadEPUBToXteink(filename) {
  if (!lastGeneratedEPUB) {
    throw new Error('No EPUB generated');
  }

  const age = Date.now() - lastGeneratedEPUB.timestamp;
  if (age > 5 * 60 * 1000) {
    throw new Error('EPUB expired');
  }

  await xteinkAPI.loadSettings();
  
  const result = await xteinkAPI.uploadEPUB(
    lastGeneratedEPUB.buffer,
    filename || lastGeneratedEPUB.filename,
    (progress) => {
      console.log(`📤 Upload: ${progress}%`);
      chrome.runtime.sendMessage({ 
        action: 'uploadProgress', 
        progress 
      }).catch(() => {});
    }
  );

  console.log('✅ Upload completed:', result);
  return result;
}

chrome.storage.local.get(['pages'], (result) => {
  pages = result.pages || [];
  chrome.action.setBadgeText({ text: pages.length > 0 ? pages.length.toString() : '' });
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.pages) {
    pages = changes.pages.newValue || [];
    chrome.action.setBadgeText({ text: pages.length > 0 ? pages.length.toString() : '' });
  }
});