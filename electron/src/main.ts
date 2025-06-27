// MeetingMind Desktop Application - Main Process
// Secure Electron application with auto-updates and system integration

import { 
  app, 
  BrowserWindow, 
  Menu, 
  shell, 
  ipcMain, 
  dialog, 
  systemPreferences,
  screen,
  nativeTheme,
  protocol,
  session
} from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { machineId } from 'node-machine-id';
import * as si from 'systeminformation';
import * as path from 'path';
import * as fs from 'fs';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Security configurations
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = !isDevelopment;

// Application state
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

// Auto-updater configuration
if (isProduction) {
  autoUpdater.logger = log;
  autoUpdater.checkForUpdatesAndNotify();
}

// Application configuration
const APP_CONFIG = {
  name: 'MeetingMind',
  version: app.getVersion(),
  minWidth: 1024,
  minHeight: 768,
  defaultWidth: 1400,
  defaultHeight: 900,
  webSecurity: true,
  contextIsolation: true,
  nodeIntegration: false,
  enableRemoteModule: false
};

class MeetingMindApp {
  private deviceId: string = '';
  private systemInfo: any = {};

  constructor() {
    this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    // Single instance enforcement
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      app.quit();
      return;
    }

    // Handle second instance
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });

    // App event handlers
    app.whenReady().then(() => this.onAppReady());
    app.on('window-all-closed', this.onWindowAllClosed);
    app.on('activate', this.onActivate);

    // Security handlers
    app.on('web-contents-created', this.onWebContentsCreated);

    // Protocol handlers
    this.setupProtocolHandlers();

    // IPC handlers
    this.setupIPCHandlers();

    // Auto-updater events
    this.setupAutoUpdater();

    // Get device information
    await this.collectSystemInfo();
  }

  private async onAppReady(): Promise<void> {
    log.info('MeetingMind application starting...');

    // Setup security
    await this.setupSecurity();

    // Create splash screen
    await this.createSplashWindow();

    // Initialize main window after splash
    setTimeout(async () => {
      await this.createMainWindow();
      this.closeSplashWindow();
    }, 2000);

    // Setup menu
    this.createMenu();

    // Check for updates (production only)
    if (isProduction) {
      setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 5000);
    }
  }

  private onWindowAllClosed = (): void => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  };

  private onActivate = async (): Promise<void> => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await this.createMainWindow();
    }
  };

  private onWebContentsCreated = (event: Event, contents: Electron.WebContents): void => {
    // Security: Block new window creation
    contents.on('new-window', (event, navigationUrl) => {
      event.preventDefault();
      log.warn('Blocked new window creation:', navigationUrl);
      shell.openExternal(navigationUrl);
    });

    // Security: Block navigation to external URLs
    contents.on('will-navigate', (event, navigationUrl) => {
      const isFileProtocol = navigationUrl.startsWith('file://');
      const isLocalhost = navigationUrl.startsWith('http://localhost:');
      const isAllowedDomain = navigationUrl.startsWith('https://app.meetingmind.com');
      
      // Allow file:// protocol for local HTML files, localhost in development, and approved domains
      if (!isFileProtocol && !isLocalhost && !isAllowedDomain) {
        event.preventDefault();
        log.warn('Blocked navigation to external URL:', navigationUrl);
      }
    });

    // Security: Prevent webview attachment
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
      log.warn('Blocked webview attachment for security');
    });

    // Security: Block external resource loading in settings
    contents.on('will-frame-navigate', (event, navigationUrl) => {
      if (contents === settingsWindow?.webContents) {
        const settingsHtmlPath = path.join(__dirname, '../assets/settings.html');
        const expectedUrl = `file://${settingsHtmlPath}`;
        
        if (navigationUrl !== expectedUrl) {
          event.preventDefault();
          log.warn('Blocked frame navigation in settings window:', navigationUrl);
        }
      }
    });
  };

  private async setupSecurity(): Promise<void> {
    // Content Security Policy
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "img-src 'self' data: blob:; " +
            "media-src 'self' blob:; " +
            "connect-src 'self' ws: wss: http://localhost:* https://localhost:*; " +
            "font-src 'self' data:;"
          ]
        }
      });
    });

    // Block ads and trackers
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      const blockedDomains = [
        'doubleclick.net',
        'googleadservices.com',
        'googlesyndication.com',
        'google-analytics.com'
      ];

      const isBlocked = blockedDomains.some(domain => details.url.includes(domain));
      callback({ cancel: isBlocked });
    });

    // Permissions
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowedPermissions = ['camera', 'microphone', 'notifications'];
      const isAllowed = allowedPermissions.includes(permission);
      
      log.info(`Permission request for ${permission}: ${isAllowed ? 'granted' : 'denied'}`);
      callback(isAllowed);
    });
  }

  private setupProtocolHandlers(): void => {
    // Custom protocol for deep linking
    protocol.registerSchemesAsPrivileged([
      {
        scheme: 'meetingmind',
        privileges: {
          standard: true,
          secure: true,
          allowServiceWorkers: true,
          supportFetchAPI: true
        }
      }
    ]);

    app.setAsDefaultProtocolClient('meetingmind');
  }

  private setupIPCHandlers(): void => {
    // System information
    ipcMain.handle('get-system-info', async () => {
      return this.systemInfo;
    });

    // Device ID
    ipcMain.handle('get-device-id', async () => {
      return this.deviceId;
    });

    // App version
    ipcMain.handle('get-app-version', () => {
      return APP_CONFIG.version;
    });

    // Theme management
    ipcMain.handle('get-theme', () => {
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    });

    ipcMain.handle('set-theme', (event, theme: 'light' | 'dark' | 'system') => {
      nativeTheme.themeSource = theme;
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    });

    // Window management
    ipcMain.handle('minimize-window', () => {
      mainWindow?.minimize();
    });

    ipcMain.handle('maximize-window', () => {
      if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow?.maximize();
      }
      return mainWindow?.isMaximized();
    });

    ipcMain.handle('close-window', () => {
      mainWindow?.close();
    });

    // Settings window
    ipcMain.handle('open-settings', async () => {
      await this.createSettingsWindow();
    });

    // Settings management
    ipcMain.handle('get-settings', () => {
      // Return app settings (could be stored in a secure location)
      return {};
    });

    ipcMain.handle('save-settings', (event, settings) => {
      // Save settings securely (could use encrypted storage)
      log.info('Settings saved:', Object.keys(settings));
      return { success: true };
    });

    // Security validation for settings
    ipcMain.handle('validate-setting', (event, key, value) => {
      // Validate setting values for security
      const allowedSettings = [
        'theme', 'language', 'launch-startup', 'start-minimized',
        'noise-cancellation', 'e2e-encryption', 'analytics'
      ];
      
      if (!allowedSettings.includes(key)) {
        log.warn('Invalid setting key:', key);
        return { valid: false, error: 'Invalid setting key' };
      }
      
      return { valid: true };
    });

    // File operations
    ipcMain.handle('save-file', async (event, data: any, filters?: any) => {
      const result = await dialog.showSaveDialog(mainWindow!, {
        filters: filters || [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        try {
          fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
          return { success: true, path: result.filePath };
        } catch (error) {
          log.error('Failed to save file:', error);
          return { success: false, error: error.message };
        }
      }

      return { success: false, cancelled: true };
    });

    ipcMain.handle('load-file', async () => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        try {
          const data = fs.readFileSync(result.filePaths[0], 'utf8');
          return { success: true, data: JSON.parse(data), path: result.filePaths[0] };
        } catch (error) {
          log.error('Failed to load file:', error);
          return { success: false, error: error.message };
        }
      }

      return { success: false, cancelled: true };
    });

    // Security operations
    ipcMain.handle('check-microphone-access', async () => {
      if (process.platform === 'darwin') {
        return await systemPreferences.askForMediaAccess('microphone');
      }
      return true;
    });

    ipcMain.handle('check-camera-access', async () => {
      if (process.platform === 'darwin') {
        return await systemPreferences.askForMediaAccess('camera');
      }
      return true;
    });

    // Auto-updater controls
    ipcMain.handle('check-for-updates', () => {
      if (isProduction) {
        autoUpdater.checkForUpdatesAndNotify();
      }
    });

    ipcMain.handle('install-update', () => {
      if (isProduction) {
        autoUpdater.quitAndInstall();
      }
    });
  }

  private setupAutoUpdater(): void => {
    if (!isProduction) return;

    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...');
      mainWindow?.webContents.send('update-status', { type: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info);
      mainWindow?.webContents.send('update-status', { 
        type: 'available', 
        version: info.version 
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info);
      mainWindow?.webContents.send('update-status', { type: 'not-available' });
    });

    autoUpdater.on('error', (err) => {
      log.error('Update error:', err);
      mainWindow?.webContents.send('update-status', { 
        type: 'error', 
        error: err.message 
      });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
      log.info(message);
      mainWindow?.webContents.send('update-status', { 
        type: 'downloading', 
        progress: progressObj.percent 
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info);
      mainWindow?.webContents.send('update-status', { 
        type: 'downloaded', 
        version: info.version 
      });
    });
  }

  private async collectSystemInfo(): Promise<void> {
    try {
      this.deviceId = await machineId();
      
      const [cpu, mem, osInfo, graphics] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.osInfo(),
        si.graphics()
      ]);

      this.systemInfo = {
        deviceId: this.deviceId,
        platform: process.platform,
        arch: process.arch,
        version: process.version,
        cpu: {
          manufacturer: cpu.manufacturer,
          brand: cpu.brand,
          cores: cpu.cores,
          physicalCores: cpu.physicalCores
        },
        memory: {
          total: mem.total,
          available: mem.available
        },
        os: {
          platform: osInfo.platform,
          distro: osInfo.distro,
          release: osInfo.release,
          arch: osInfo.arch
        },
        graphics: graphics.controllers.map(controller => ({
          vendor: controller.vendor,
          model: controller.model,
          vram: controller.vram
        }))
      };

      log.info('System information collected:', this.systemInfo);
    } catch (error) {
      log.error('Failed to collect system information:', error);
    }
  }

  private async createSplashWindow(): Promise<void> {
    splashWindow = new BrowserWindow({
      width: 400,
      height: 300,
      frame: false,
      alwaysOnTop: true,
      transparent: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    splashWindow.loadFile(path.join(__dirname, '../assets/splash.html'));

    splashWindow.on('closed', () => {
      splashWindow = null;
    });
  }

  private closeSplashWindow(): void {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
  }

  private async createMainWindow(): Promise<void> {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    mainWindow = new BrowserWindow({
      title: APP_CONFIG.name,
      width: Math.min(APP_CONFIG.defaultWidth, width),
      height: Math.min(APP_CONFIG.defaultHeight, height),
      minWidth: APP_CONFIG.minWidth,
      minHeight: APP_CONFIG.minHeight,
      show: false,
      icon: this.getAppIcon(),
      webPreferences: {
        nodeIntegration: APP_CONFIG.nodeIntegration,
        contextIsolation: APP_CONFIG.contextIsolation,
        enableRemoteModule: APP_CONFIG.enableRemoteModule,
        webSecurity: APP_CONFIG.webSecurity,
        preload: path.join(__dirname, 'preload.js'),
        sandbox: true
      }
    });

    // Load the application
    if (isDevelopment) {
      await mainWindow.loadURL('http://localhost:3000');
      mainWindow.webContents.openDevTools();
    } else {
      await mainWindow.loadFile(path.join(__dirname, '../resources/app/index.html'));
    }

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show();
      
      if (isDevelopment) {
        mainWindow?.webContents.openDevTools();
      }
    });

    // Window event handlers
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    mainWindow.on('focus', () => {
      mainWindow?.webContents.send('window-focus', true);
    });

    mainWindow.on('blur', () => {
      mainWindow?.webContents.send('window-focus', false);
    });

    // Security: Prevent navigation
    mainWindow.webContents.on('will-navigate', (event) => {
      event.preventDefault();
    });
  }

  private async createSettingsWindow(): Promise<void> {
    if (settingsWindow) {
      settingsWindow.focus();
      return;
    }

    settingsWindow = new BrowserWindow({
      parent: mainWindow || undefined,
      modal: true,
      width: 800,
      height: 600,
      resizable: false,
      title: 'Settings',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        sandbox: true,
        webSecurity: true
      }
    });

    // Security: Always load settings from local file, never from network
    const settingsPath = path.join(__dirname, '../assets/settings.html');
    await settingsWindow.loadFile(settingsPath);

    // Security: Prevent navigation away from the settings page
    settingsWindow.webContents.on('will-navigate', (event, url) => {
      // Only allow navigation to the settings file itself
      if (!url.startsWith('file://')) {
        event.preventDefault();
        log.warn('Blocked navigation attempt from settings window:', url);
      }
    });

    // Security: Block new window creation from settings
    settingsWindow.webContents.on('new-window', (event, url) => {
      event.preventDefault();
      log.warn('Blocked new window creation from settings:', url);
      shell.openExternal(url);
    });

    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });

    log.info('Settings window opened securely from local file');
  }

  private createMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'File',
        submenu: [
          {
            label: 'New Meeting',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              mainWindow?.webContents.send('menu-action', 'new-meeting');
            }
          },
          {
            label: 'Join Meeting',
            accelerator: 'CmdOrCtrl+J',
            click: () => {
              mainWindow?.webContents.send('menu-action', 'join-meeting');
            }
          },
          { type: 'separator' },
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              this.createSettingsWindow();
            }
          },
          { type: 'separator' },
          {
            role: 'quit'
          }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectall' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About',
            click: () => {
              dialog.showMessageBox(mainWindow!, {
                type: 'info',
                title: 'About MeetingMind',
                message: `${APP_CONFIG.name} v${APP_CONFIG.version}`,
                detail: 'Secure meetings with end-to-end encryption and privacy protection.'
              });
            }
          },
          {
            label: 'Check for Updates',
            click: () => {
              if (isProduction) {
                autoUpdater.checkForUpdatesAndNotify();
              } else {
                dialog.showMessageBox(mainWindow!, {
                  type: 'info',
                  title: 'Updates',
                  message: 'Auto-updates are only available in production builds.'
                });
              }
            }
          }
        ]
      }
    ];

    // macOS specific menu adjustments
    if (process.platform === 'darwin') {
      template.unshift({
        label: app.getName(),
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      });

      // Window menu
      (template[4].submenu as Electron.MenuItemConstructorOptions[]).push(
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' }
      );
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private getAppIcon(): string {
    if (process.platform === 'win32') {
      return path.join(__dirname, '../assets/icon.ico');
    } else if (process.platform === 'darwin') {
      return path.join(__dirname, '../assets/icon.icns');
    } else {
      return path.join(__dirname, '../assets/icon.png');
    }
  }
}

// Initialize the application
new MeetingMindApp();

// Handle protocol for deep linking
app.on('open-url', (event, url) => {
  event.preventDefault();
  log.info('Deep link opened:', url);
  
  if (mainWindow) {
    mainWindow.webContents.send('deep-link', url);
    mainWindow.focus();
  }
});

// Prevent multiple instances
app.on('second-instance', (event, commandLine, workingDirectory) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

export { APP_CONFIG };