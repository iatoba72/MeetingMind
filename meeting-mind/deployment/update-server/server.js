// MeetingMind Auto-Update Server
// Secure update distribution server for Electron applications

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createHash } = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const semver = require('semver');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));

// Configuration
const UPDATE_CONFIG = {
  baseUrl: process.env.BASE_URL || 'https://updates.meetingmind.com',
  releasesPath: process.env.RELEASES_PATH || './releases',
  githubRepo: process.env.GITHUB_REPO || 'meetingmind/desktop',
  supportedPlatforms: ['win32', 'darwin', 'linux'],
  supportedArchs: ['x64', 'ia32', 'arm64']
};

// In-memory cache for release information
let releaseCache = new Map();
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class UpdateServer {
  constructor() {
    this.initializeServer();
  }

  async initializeServer() {
    try {
      // Ensure releases directory exists
      await fs.mkdir(UPDATE_CONFIG.releasesPath, { recursive: true });
      
      // Load initial release data
      await this.refreshReleaseCache();
      
      // Setup periodic cache refresh
      setInterval(() => this.refreshReleaseCache(), CACHE_TTL);
      
      console.log('Update server initialized successfully');
    } catch (error) {
      console.error('Failed to initialize update server:', error);
    }
  }

  async refreshReleaseCache() {
    try {
      const releases = await this.loadReleases();
      releaseCache.clear();
      
      for (const release of releases) {
        const key = `${release.platform}-${release.arch}-${release.version}`;
        releaseCache.set(key, release);
      }
      
      cacheTimestamp = Date.now();
      console.log(`Cache refreshed with ${releases.length} releases`);
    } catch (error) {
      console.error('Failed to refresh release cache:', error);
    }
  }

  async loadReleases() {
    const releases = [];
    
    try {
      const platformDirs = await fs.readdir(UPDATE_CONFIG.releasesPath);
      
      for (const platform of platformDirs) {
        const platformPath = path.join(UPDATE_CONFIG.releasesPath, platform);
        const stat = await fs.stat(platformPath);
        
        if (!stat.isDirectory()) continue;
        
        const versionDirs = await fs.readdir(platformPath);
        
        for (const version of versionDirs) {
          const versionPath = path.join(platformPath, version);
          const versionStat = await fs.stat(versionPath);
          
          if (!versionStat.isDirectory()) continue;
          
          const releaseFiles = await fs.readdir(versionPath);
          
          for (const file of releaseFiles) {
            if (file.endsWith('.yml') || file.endsWith('.json')) {
              const releaseData = await this.parseReleaseFile(
                path.join(versionPath, file),
                platform,
                version
              );
              if (releaseData) {
                releases.push(releaseData);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading releases:', error);
    }
    
    return releases;
  }

  async parseReleaseFile(filePath, platform, version) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const data = filePath.endsWith('.json') ? JSON.parse(content) : this.parseYml(content);
      
      return {
        version,
        platform: this.normalizePlatform(platform),
        arch: data.arch || 'x64',
        url: data.url,
        sha512: data.sha512,
        size: data.size,
        releaseDate: data.releaseDate || new Date().toISOString(),
        releaseNotes: data.releaseNotes,
        signature: data.signature,
        files: data.files || []
      };
    } catch (error) {
      console.error(`Error parsing release file ${filePath}:`, error);
      return null;
    }
  }

  parseYml(content) {
    // Simple YAML parser for electron-builder format
    const lines = content.split('\n');
    const data = {};
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split(':');
        if (key && valueParts.length > 0) {
          const value = valueParts.join(':').trim();
          data[key.trim()] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    }
    
    return data;
  }

  normalizePlatform(platform) {
    const platformMap = {
      'win': 'win32',
      'windows': 'win32',
      'mac': 'darwin',
      'macos': 'darwin',
      'osx': 'darwin',
      'linux': 'linux'
    };
    
    return platformMap[platform.toLowerCase()] || platform;
  }

  findLatestVersion(platform, arch, currentVersion) {
    const releases = Array.from(releaseCache.values())
      .filter(r => r.platform === platform && r.arch === arch)
      .sort((a, b) => semver.rcompare(a.version, b.version));
    
    if (releases.length === 0) return null;
    
    const latest = releases[0];
    
    // Check if update is available
    if (!currentVersion || semver.gt(latest.version, currentVersion)) {
      return latest;
    }
    
    return null;
  }

  generateChecksum(data) {
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }
}

// Initialize update server
const updateServer = new UpdateServer();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    cacheSize: releaseCache.size,
    cacheAge: Date.now() - cacheTimestamp
  });
});

// Update check endpoint
app.get('/update/:platform/:arch/:version', async (req, res) => {
  try {
    const { platform, arch, version } = req.params;
    
    // Validate parameters
    if (!UPDATE_CONFIG.supportedPlatforms.includes(platform)) {
      return res.status(400).json({ error: 'Unsupported platform' });
    }
    
    if (!UPDATE_CONFIG.supportedArchs.includes(arch)) {
      return res.status(400).json({ error: 'Unsupported architecture' });
    }
    
    if (!semver.valid(version)) {
      return res.status(400).json({ error: 'Invalid version format' });
    }
    
    // Find latest version
    const update = updateServer.findLatestVersion(platform, arch, version);
    
    if (!update) {
      return res.status(204).send(); // No updates available
    }
    
    // Return update information
    res.json({
      version: update.version,
      url: update.url,
      sha512: update.sha512,
      size: update.size,
      releaseDate: update.releaseDate,
      releaseNotes: update.releaseNotes,
      signature: update.signature
    });
    
  } catch (error) {
    console.error('Update check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy update check (electron-updater format)
app.get('/update/latest', (req, res) => {
  const platform = req.query.platform || req.headers['user-agent']?.includes('Windows') ? 'win32' : 
                   req.headers['user-agent']?.includes('Mac') ? 'darwin' : 'linux';
  const arch = req.query.arch || 'x64';
  const version = req.query.version || '0.0.0';
  
  req.params = { platform, arch, version };
  return app._router.handle(req, res);
});

// Release information endpoint
app.get('/releases', (req, res) => {
  const { platform, arch, limit = 10 } = req.query;
  
  let releases = Array.from(releaseCache.values());
  
  if (platform) {
    releases = releases.filter(r => r.platform === platform);
  }
  
  if (arch) {
    releases = releases.filter(r => r.arch === arch);
  }
  
  releases = releases
    .sort((a, b) => semver.rcompare(a.version, b.version))
    .slice(0, parseInt(limit));
  
  res.json({
    releases,
    total: releases.length,
    cacheTimestamp
  });
});

// Webhook endpoint for GitHub releases
app.post('/webhook/github', (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const payload = JSON.stringify(req.body);
  
  // Verify GitHub webhook signature
  if (process.env.GITHUB_WEBHOOK_SECRET) {
    const expectedSignature = 'sha256=' + createHash('sha256')
      .update(payload, 'utf8')
      .update(process.env.GITHUB_WEBHOOK_SECRET, 'utf8')
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }
  
  // Handle release events
  if (req.body.action === 'published' && req.body.release) {
    console.log('New release published:', req.body.release.tag_name);
    
    // Trigger cache refresh
    updateServer.refreshReleaseCache().catch(console.error);
  }
  
  res.json({ status: 'received' });
});

// Statistics endpoint
app.get('/stats', (req, res) => {
  res.json({
    totalReleases: releaseCache.size,
    platforms: UPDATE_CONFIG.supportedPlatforms,
    architectures: UPDATE_CONFIG.supportedArchs,
    cacheAge: Date.now() - cacheTimestamp,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`MeetingMind Update Server running on port ${PORT}`);
  console.log(`Base URL: ${UPDATE_CONFIG.baseUrl}`);
  console.log(`Releases path: ${UPDATE_CONFIG.releasesPath}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

module.exports = app;