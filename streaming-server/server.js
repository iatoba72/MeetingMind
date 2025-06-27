#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import NodeMediaServer from 'node-media-server';
import dotenv from 'dotenv';
import winston from 'winston';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { RateLimiterMemory } from 'rate-limiter-flexible';

import { StreamManager } from './lib/StreamManager.js';
import { AuthManager } from './lib/AuthManager.js';
import { HealthMonitor } from './lib/HealthMonitor.js';
import { SRTServer } from './lib/SRTServer.js';
import { WHIPServer } from './lib/WHIPServer.js';
import { MetricsCollector } from './lib/MetricsCollector.js';

// Load environment variables
dotenv.config();

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'streaming-server' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

class MeetingMindStreamingServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"]
      }
    });

    // Initialize components
    this.streamManager = new StreamManager();
    this.authManager = new AuthManager();
    this.healthMonitor = new HealthMonitor();
    this.metricsCollector = new MetricsCollector();
    
    // Rate limiting
    this.rateLimiter = new RateLimiterMemory({
      keyGenerator: (req) => req.ip,
      points: 100, // Number of requests
      duration: 60, // Per 60 seconds
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
    this.setupRTMPServer();
    this.setupSRTServer();
    this.setupWHIPServer();
    this.startServer();
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Rate limiting middleware
    this.app.use(async (req, res, next) => {
      try {
        await this.rateLimiter.consume(req.ip);
        next();
      } catch (rejRes) {
        res.status(429).json({
          error: 'Too Many Requests',
          retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 1
        });
      }
    });

    // Logging middleware
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
          rtmp: this.nms ? this.nms.getStats() : null,
          srt: this.srtServer ? this.srtServer.getStats() : null,
          whip: this.whipServer ? this.whipServer.getStats() : null
        }
      });
    });

    // Stream management routes
    this.app.get('/api/streams', this.authenticateToken, async (req, res) => {
      try {
        const streams = await this.streamManager.getAllStreams();
        res.json(streams);
      } catch (error) {
        logger.error('Error fetching streams:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    this.app.get('/api/streams/:streamId', this.authenticateToken, async (req, res) => {
      try {
        const stream = await this.streamManager.getStream(req.params.streamId);
        if (!stream) {
          return res.status(404).json({ error: 'Stream not found' });
        }
        res.json(stream);
      } catch (error) {
        logger.error('Error fetching stream:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Stream authentication routes
    this.app.post('/api/auth/stream-keys', this.authenticateToken, async (req, res) => {
      try {
        const { meetingId, userId, permissions } = req.body;
        const streamKey = await this.authManager.generateStreamKey({
          meetingId,
          userId,
          permissions,
          expiresIn: req.body.expiresIn || '24h'
        });
        res.json({ streamKey });
      } catch (error) {
        logger.error('Error generating stream key:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    this.app.delete('/api/auth/stream-keys/:keyId', this.authenticateToken, async (req, res) => {
      try {
        await this.authManager.revokeStreamKey(req.params.keyId);
        res.json({ success: true });
      } catch (error) {
        logger.error('Error revoking stream key:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Metrics and monitoring
    this.app.get('/api/metrics', this.authenticateToken, async (req, res) => {
      try {
        const metrics = await this.metricsCollector.getMetrics();
        res.json(metrics);
      } catch (error) {
        logger.error('Error fetching metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    this.app.get('/api/health-monitor', this.authenticateToken, async (req, res) => {
      try {
        const health = await this.healthMonitor.getHealthStatus();
        res.json(health);
      } catch (error) {
        logger.error('Error fetching health status:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // WHIP endpoint for WebRTC
    this.app.post('/whip/:streamId', async (req, res) => {
      try {
        const { streamId } = req.params;
        const { sdp } = req.body;
        
        // Authenticate stream
        const authHeader = req.headers.authorization;
        if (!authHeader) {
          return res.status(401).json({ error: 'Authorization required' });
        }

        const streamKey = authHeader.replace('Bearer ', '');
        const isValid = await this.authManager.validateStreamKey(streamKey, streamId);
        
        if (!isValid) {
          return res.status(403).json({ error: 'Invalid stream key' });
        }

        const answer = await this.whipServer.handleOffer(streamId, sdp);
        res.json({ sdp: answer });
      } catch (error) {
        logger.error('WHIP error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Serve static dashboard
    this.app.use('/dashboard', express.static('public/dashboard'));
    this.app.get('/', (req, res) => {
      res.redirect('/dashboard');
    });
  }

  setupSocketIO() {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      socket.on('subscribe-stream', async (streamId) => {
        try {
          const stream = await this.streamManager.getStream(streamId);
          if (stream) {
            socket.join(`stream-${streamId}`);
            socket.emit('stream-status', stream);
          }
        } catch (error) {
          logger.error('Error subscribing to stream:', error);
          socket.emit('error', { message: 'Failed to subscribe to stream' });
        }
      });

      socket.on('unsubscribe-stream', (streamId) => {
        socket.leave(`stream-${streamId}`);
      });

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });
  }

  setupRTMPServer() {
    const config = {
      rtmp: {
        port: parseInt(process.env.RTMP_PORT) || 1935,
        chunk_size: parseInt(process.env.RTMP_CHUNK_SIZE) || 60000,
        gop_cache: process.env.RTMP_GOP_CACHE === 'true',
        ping: parseInt(process.env.RTMP_PING) || 30,
        ping_timeout: parseInt(process.env.RTMP_PING_TIMEOUT) || 60
      },
      http: {
        port: parseInt(process.env.PORT) || 3001,
        allow_origin: '*'
      },
      auth: {
        play: true,
        publish: true,
        secret: process.env.JWT_SECRET
      }
    };

    this.nms = new NodeMediaServer(config);

    // RTMP event handlers
    this.nms.on('preConnect', async (id, args) => {
      logger.info(`[RTMP PreConnect] id=${id} args=${JSON.stringify(args)}`);
    });

    this.nms.on('postConnect', async (id, args) => {
      logger.info(`[RTMP PostConnect] id=${id} args=${JSON.stringify(args)}`);
    });

    this.nms.on('doneConnect', async (id, args) => {
      logger.info(`[RTMP DoneConnect] id=${id}`);
    });

    this.nms.on('prePublish', async (id, StreamPath, args) => {
      logger.info(`[RTMP PrePublish] id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
      
      // Extract stream key from path
      const streamKey = StreamPath.split('/').pop();
      const streamId = StreamPath.split('/')[2]; // /live/streamId format
      
      try {
        const isValid = await this.authManager.validateStreamKey(streamKey, streamId);
        if (!isValid) {
          logger.warn(`[RTMP Auth Failed] Invalid stream key: ${streamKey}`);
          return false; // Reject the publish attempt
        }
        
        // Create stream record
        await this.streamManager.createStream({
          id: streamId,
          type: 'rtmp',
          status: 'live',
          startTime: new Date(),
          publisher: id
        });

        return true;
      } catch (error) {
        logger.error('[RTMP Auth Error]', error);
        return false;
      }
    });

    this.nms.on('postPublish', async (id, StreamPath, args) => {
      logger.info(`[RTMP PostPublish] id=${id} StreamPath=${StreamPath}`);
      
      const streamId = StreamPath.split('/')[2];
      await this.streamManager.updateStreamStatus(streamId, 'live');
      
      // Notify subscribers
      this.io.to(`stream-${streamId}`).emit('stream-live', { streamId, type: 'rtmp' });
      
      // Start health monitoring
      this.healthMonitor.startMonitoring(streamId, 'rtmp');
    });

    this.nms.on('donePublish', async (id, StreamPath, args) => {
      logger.info(`[RTMP DonePublish] id=${id} StreamPath=${StreamPath}`);
      
      const streamId = StreamPath.split('/')[2];
      await this.streamManager.updateStreamStatus(streamId, 'ended');
      
      // Notify subscribers
      this.io.to(`stream-${streamId}`).emit('stream-ended', { streamId, type: 'rtmp' });
      
      // Stop health monitoring
      this.healthMonitor.stopMonitoring(streamId);
    });

    this.nms.run();
    logger.info(`RTMP Server started on port ${config.rtmp.port}`);
  }

  setupSRTServer() {
    this.srtServer = new SRTServer({
      port: parseInt(process.env.SRT_PORT) || 9998,
      latency: parseInt(process.env.SRT_LATENCY) || 120,
      maxbw: parseInt(process.env.SRT_MAXBW) || 1000000,
      authManager: this.authManager,
      streamManager: this.streamManager,
      io: this.io,
      healthMonitor: this.healthMonitor
    });

    this.srtServer.start();
    logger.info(`SRT Server started on port ${parseInt(process.env.SRT_PORT) || 9998}`);
  }

  setupWHIPServer() {
    this.whipServer = new WHIPServer({
      port: parseInt(process.env.WEBRTC_PORT) || 8443,
      authManager: this.authManager,
      streamManager: this.streamManager,
      io: this.io,
      healthMonitor: this.healthMonitor
    });

    this.whipServer.start();
    logger.info(`WebRTC WHIP Server started on port ${parseInt(process.env.WEBRTC_PORT) || 8443}`);
  }

  authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid token' });
      }
      req.user = user;
      next();
    });
  };

  startServer() {
    const port = parseInt(process.env.PORT) || 3001;
    this.server.listen(port, () => {
      logger.info(`MeetingMind Streaming Server running on port ${port}`);
      logger.info('Available protocols:');
      logger.info(`  RTMP: rtmp://localhost:${parseInt(process.env.RTMP_PORT) || 1935}/live/{stream-key}`);
      logger.info(`  SRT: srt://localhost:${parseInt(process.env.SRT_PORT) || 9998}?streamid={stream-key}`);
      logger.info(`  WebRTC WHIP: https://localhost:${parseInt(process.env.WEBRTC_PORT) || 8443}/whip/{stream-id}`);
      logger.info(`  Dashboard: http://localhost:${port}/dashboard`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      this.server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      this.server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
  }
}

// Start the server
new MeetingMindStreamingServer();