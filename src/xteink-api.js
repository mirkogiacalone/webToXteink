// xteink-api.js

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

      console.log('🔍 Ping:', this.getBaseUrl());

      const response = await fetch(this.getBaseUrl() + '/', {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('✅ Ping ok:', response.status);

      return {
        connected: true,
        message: 'Xteink X4 connected',
        status: response.status
      };
    } catch (error) {
      console.error('❌ Ping failed:', error);
      
      if (error.name === 'AbortError') {
        return {
          connected: false,
          error: 'Timeout - Device unreachable'
        };
      }
      
      return {
        connected: false,
        error: error.name === 'TypeError' 
          ? 'Check Wi-Fi connection Xteink' 
          : `Error: ${error.message}`
      };
    }
  }


  async uploadEPUB(epubBuffer, filename, onProgress) {
    try {
      console.log('📤 Start upload EPUB');
      console.log('📦 Size:', epubBuffer.length, 'bytes');
      console.log('📄 Filename:', filename);

      if (onProgress) onProgress(10);

      const folderReady = await this.ensureFolderExists(this.settings.targetFolder);
      
      if (onProgress) onProgress(30);

      const uploadPath = folderReady
        ? `/${this.settings.targetFolder}/${filename}`
        : `/${filename}`;

      console.log('📍 Upload path:', uploadPath);

      const result = await this.uploadFile(epubBuffer, uploadPath, onProgress);

      if (onProgress) onProgress(100);

      return result;

    } catch (error) {
      console.error('❌ Error:', error);
      throw error;
    }
  }

  async ensureFolderExists(folderName) {
    try {

      const exists = await this.folderExists(folderName);

      if (exists) {
        return true;
      }

      console.log('📁 Folder creation:', folderName);
      return await this.createFolder(folderName);

    } catch (error) {
      console.warn('⚠️ Folder management error, upload to root:', error);
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

  async createFolder(folderName) {
    try {
      const formData = new FormData();
      formData.append('path', `/${folderName}/`);

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
        console.log('✅ Folder created');
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

async uploadFile(epubBuffer, path, onProgress) {
  try {
    const uint8Array = epubBuffer instanceof Uint8Array 
      ? epubBuffer 
      : new Uint8Array(epubBuffer);
    
    console.log('📦 Buffer type:', uint8Array.constructor.name);
    console.log('📦 Buffer size:', uint8Array.length, 'bytes');
    
    const blob = new Blob([uint8Array], { type: 'application/epub+zip' });
    
    console.log('📦 Blob size:', blob.size, 'bytes');
    
    const filename = path.split('/').pop();
    
    const formData = new FormData();
    formData.append('data', blob, path);

    const uploadUrl = this.getBaseUrl() + this.settings.uploadEndpoint;
    console.log('📤 POST file a:', uploadUrl);
    console.log('📤 Path:', path);
    console.log('📄 Filename:', filename);

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
      console.log('✅ Upload completed!');
      console.log('📄 Response:', responseText);

      return {
        success: true,
        message: `EPUB uploaded in ${path}`,
        path: path,
        endpoint: this.settings.uploadEndpoint,
        status: response.status
      };
    } else {
      const errorText = await response.text();
      console.error('❌ Upload failed:', response.status, errorText);
      
      throw new Error(
        `Upload failed (${response.status}): ${errorText.substring(0, 200)}`
      );
    }

  } catch (error) {
    console.error('❌ Fetch error:', error);

    if (error.name === 'AbortError') {
      throw new Error('Timeout upload (30s)');
    }

    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      throw new Error(
        'Unable to reach Xteink.\n' +
        '1. Check Wi-Fi connection (SSID: E-Paper...)\n' +
        '2. Correct IP: ' + this.settings.ip + '\n' +
        '3. Try opening http://' + this.settings.ip + ' in your browser'
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

    console.log('🔧 DIAGNOSTIC XTEINK X4');
    console.log('========================');

    console.log('Test 1: Connections...');
    results.tests.ping = await this.ping();

    console.log('Test 2: List root directory...');
    results.tests.listRoot = await this.listFiles('/');

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

    console.log('📊 Diagnostic completed:', results);
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

export const xteinkAPI = new XteinkAPI();