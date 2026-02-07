// xteink-api.js
// Usa endpoint /edit come da API Xteink X4

export class XteinkAPI {
  constructor() {
    this.settings = {
      ip: '192.168.3.3',
      port: 80,
      uploadEndpoint: '/edit',     
      listEndpoint: '/list',
      targetFolder: 'fromWebToXteink',
      timeout: 30000
    };
  }

  async loadSettings() {
    const stored = await chrome.storage.sync.get('xteinkSettings');
    if (stored.xteinkSettings) {
      this.settings = { ...this.settings, ...stored.xteinkSettings };
    }
    return this.settings;
  }

  async saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await chrome.storage.sync.set({ xteinkSettings: this.settings });
  }

  getBaseUrl() {
    const { ip, port } = this.settings;
    return port === 80 ? `http://${ip}` : `http://${ip}:${port}`;
  }

  async ping() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      console.log('🔍 Ping a:', this.getBaseUrl());

      const response = await fetch(this.getBaseUrl() + '/', {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('✅ Ping riuscito:', response.status);

      return {
        connected: true,
        message: 'Xteink X4 connesso',
        status: response.status
      };
    } catch (error) {
      console.error('❌ Ping fallito:', error);
      
      if (error.name === 'AbortError') {
        return {
          connected: false,
          error: 'Timeout - Dispositivo non raggiungibile'
        };
      }
      
      return {
        connected: false,
        error: error.name === 'TypeError' 
          ? 'Verifica connessione Wi-Fi Xteink' 
          : `Errore: ${error.message}`
      };
    }
  }

  /**
   * ✅ METODO PRINCIPALE - Upload EPUB usando /edit endpoint
   */
  async uploadEPUB(epubBuffer, filename, onProgress) {
    try {
      console.log('📤 Inizio upload EPUB');
      console.log('📦 Size:', epubBuffer.length, 'bytes');
      console.log('📄 Filename:', filename);

      if (onProgress) onProgress(10);

      // Step 1: Verifica/crea cartella (opzionale, fallback su root)
      const folderReady = await this.ensureFolderExists(this.settings.targetFolder);
      
      if (onProgress) onProgress(30);

      // Step 2: Determina path
      const uploadPath = folderReady
        ? `/${this.settings.targetFolder}/${filename}`
        : `/${filename}`;

      console.log('📍 Upload path:', uploadPath);

      // Step 3: Upload file con /edit endpoint
      const result = await this.uploadFile(epubBuffer, uploadPath, onProgress);

      if (onProgress) onProgress(100);

      return result;

    } catch (error) {
      console.error('❌ Errore upload:', error);
      throw error;
    }
  }

  async ensureFolderExists(folderName) {
    try {
      console.log('🔍 Verifica cartella:', folderName);

      const exists = await this.folderExists(folderName);

      if (exists) {
        console.log('✅ Cartella già esistente');
        return true;
      }

      console.log('📁 Creazione cartella:', folderName);
      return await this.createFolder(folderName);

    } catch (error) {
      console.warn('⚠️ Errore gestione cartella, upload in root:', error);
      return false;
    }
  }

  async folderExists(folderName) {
    try {
      const listUrl = `${this.getBaseUrl()}${this.settings.listEndpoint}?dir=/`;
      console.log('🔍 List directory:', listUrl);

      const response = await fetch(listUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        console.log('⚠️ List request failed:', response.status);
        return false;
      }

      const items = await response.json();
      console.log('📂 Root contents:', items.length, 'items');

      const folder = items.find(item =>
        item.type === 'dir' && item.name === folderName
      );

      return !!folder;

    } catch (error) {
      console.error('❌ Error listing directory:', error);
      return false;
    }
  }

  /**
   * ✅ Crea cartella con PUT /edit
   */
  async createFolder(folderName) {
    try {
      const formData = new FormData();
      formData.append('path', `/${folderName}/`); // Slash finale importante!

      const createUrl = this.getBaseUrl() + this.settings.uploadEndpoint;
      console.log('📁 PUT folder a:', createUrl);
      console.log('📁 Path:', `/${folderName}/`);

      const response = await fetch(createUrl, {
        method: 'PUT',
        body: formData,
        signal: AbortSignal.timeout(10000)
      });

      console.log('📁 Create folder response:', response.status);

      if (response.ok) {
        console.log('✅ Cartella creata');
        return true;
      } else {
        const text = await response.text();
        console.warn('⚠️ Failed to create folder:', response.status, text);
        return false;
      }

    } catch (error) {
      console.error('❌ Error creating folder:', error);
      return false;
    }
  }

  /**
   * ✅ Upload file con POST /edit
   * IMPORTANTE: Campo "data" (non "file")!
   */
  async uploadFile(epubBuffer, path, onProgress) {
    try {
      const blob = new Blob([epubBuffer], { type: 'application/epub+zip' });
      
      // ✅ File con path completo come nome
      const file = new File([blob], path, { type: 'application/epub+zip' });
      
      const formData = new FormData();
      formData.append('data', file, path); // ✅ Campo "data"!

      const uploadUrl = this.getBaseUrl() + this.settings.uploadEndpoint;
      console.log('📤 POST file a:', uploadUrl);
      console.log('📤 Path:', path);

      if (onProgress) onProgress(50);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.settings.timeout);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (onProgress) onProgress(90);

      console.log('📥 Response status:', response.status);

      if (response.ok) {
        const responseText = await response.text();
        console.log('✅ Upload completato!');
        console.log('📄 Response:', responseText);

        return {
          success: true,
          message: `EPUB caricato in ${path}`,
          path: path,
          endpoint: this.settings.uploadEndpoint,
          status: response.status
        };
      } else {
        const errorText = await response.text();
        console.error('❌ Upload fallito:', response.status, errorText);
        
        throw new Error(
          `Upload fallito (${response.status}): ${errorText.substring(0, 200)}`
        );
      }

    } catch (error) {
      console.error('❌ Fetch error:', error);

      if (error.name === 'AbortError') {
        throw new Error('Timeout upload (30s). Riprova o riduci dimensione EPUB.');
      }

      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        throw new Error(
          'Impossibile raggiungere Xteink.\n' +
          '1. Verifica connessione Wi-Fi (SSID: Xteink-...)\n' +
          '2. IP corretto: ' + this.settings.ip + '\n' +
          '3. Prova ad aprire http://' + this.settings.ip + ' nel browser'
        );
      }

      throw error;
    }
  }

  async listFiles(directory = '/') {
    try {
      const listUrl = `${this.getBaseUrl()}${this.settings.listEndpoint}?dir=${directory}`;
      console.log('📂 Listing:', listUrl);

      const response = await fetch(listUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const files = await response.json();
        console.log('📂 Found', files.length, 'items');
        return { success: true, files, directory };
      }

      return { 
        success: false, 
        error: `List failed: ${response.status}` 
      };

    } catch (error) {
      console.error('❌ List error:', error);
      return { success: false, error: error.message };
    }
  }

  async diagnostics() {
    const results = {
      timestamp: new Date().toISOString(),
      settings: this.settings,
      tests: {}
    };

    console.log('🔧 DIAGNOSTICA XTEINK X4');
    console.log('========================');

    // Test 1: Ping
    console.log('Test 1: Connessione...');
    results.tests.ping = await this.ping();

    // Test 2: List root
    console.log('Test 2: List root directory...');
    results.tests.listRoot = await this.listFiles('/');

    // Test 3: Verifica endpoint /edit
    console.log('Test 3: Endpoint /edit...');
    try {
      const response = await fetch(
        this.getBaseUrl() + this.settings.uploadEndpoint,
        { 
          method: 'OPTIONS',
          signal: AbortSignal.timeout(3000) 
        }
      );

      results.tests.editEndpoint = {
        available: true,
        status: response.status,
        methods: response.headers.get('Allow') || 'Unknown'
      };
    } catch (error) {
      results.tests.editEndpoint = {
        available: false,
        error: error.message
      };
    }

    // Test 4: Verifica cartella target
    console.log('Test 4: Target folder...');
    try {
      const exists = await this.folderExists(this.settings.targetFolder);
      results.tests.targetFolder = {
        exists,
        name: this.settings.targetFolder
      };
    } catch (error) {
      results.tests.targetFolder = {
        error: error.message
      };
    }

    console.log('📊 Diagnostica completata:', results);
    return results;
  }

  async getDeviceInfo() {
    try {
      const response = await fetch(this.getBaseUrl() + '/', {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const html = await response.text();
        
        const info = {
          hasListEndpoint: html.includes('/list'),
          hasEditEndpoint: html.includes('/edit'),
          language: html.includes('zh-CN') ? 'Chinese' : 'Unknown',
          title: html.match(/<title>(.*?)<\/title>/)?.[1] || 'Unknown'
        };

        return { success: true, info };
      }

      return { success: false, error: 'Cannot fetch device page' };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Export singleton
export const xteinkAPI = new XteinkAPI();