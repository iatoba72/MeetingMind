import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  Alert,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  CircularProgress,
  LinearProgress,
  Tooltip,
  Fab,
  Snackbar
} from '@mui/material';
import {
  ScreenShare as ScreenShareIcon,
  StopScreenShare as StopIcon,
  TextFields as TextIcon,
  Timeline as TimelineIcon,
  Science as LabIcon,
  Settings as SettingsIcon,
  Visibility as ViewIcon,
  Download as DownloadIcon,
  Share as ShareIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  RecordVoiceOver as SpeechIcon,
  Assessment as AnalyticsIcon,
  BugReport as DebugIcon,
  Close as CloseIcon
} from '@mui/icons-material';

// Services
import ScreenCaptureService, { CaptureFrame, CaptureSettings } from '../services/screenCaptureService';
import SlideDetectionService, { SlideChangeEvent, SlideInfo } from '../services/slideDetectionService';
import OCRService, { OCRResult } from '../services/ocrService';

// Components
import VisualTimeline from './VisualTimeline';
import VisionLab from './VisionLab';

// Types
interface AnalysisSession {
  id: string;
  startTime: number;
  endTime?: number;
  slides: SlideInfo[];
  ocrResults: OCRResult[];
  totalFrames: number;
  totalTextExtracted: number;
  averageConfidence: number;
}

interface RealTimeStats {
  isCapturing: boolean;
  currentSlide?: SlideInfo;
  totalSlides: number;
  currentText: string;
  processingFPS: number;
  ocrQueueSize: number;
  memoryUsage: number;
}

const ScreenSharingAnalysis: React.FC = () => {
  // Services
  const [screenCapture] = useState(() => new ScreenCaptureService());
  const [slideDetection] = useState(() => new SlideDetectionService());
  const [ocrService] = useState(() => new OCRService(1)); // Single worker for real-time
  
  // State
  const [activeTab, setActiveTab] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Session data
  const [currentSession, setCurrentSession] = useState<AnalysisSession | null>(null);
  const [realtimeStats, setRealtimeStats] = useState<RealTimeStats>({
    isCapturing: false,
    totalSlides: 0,
    currentText: '',
    processingFPS: 0,
    ocrQueueSize: 0,
    memoryUsage: 0
  });

  // Settings
  const [captureSettings, setCaptureSettings] = useState<CaptureSettings>({
    frameRate: 1, // 1 FPS for screen analysis
    quality: 0.8,
    maxWidth: 1920,
    maxHeight: 1080,
    enableOptimization: true,
    compressionLevel: 0.7
  });

  const [enableOCR, setEnableOCR] = useState(true);
  const [enableSlideDetection, setEnableSlideDetection] = useState(true);
  const [autoSaveResults, setAutoSaveResults] = useState(true);

  // Refs
  const processingQueue = useRef<CaptureFrame[]>([]);
  const statsInterval = useRef<NodeJS.Timeout | null>(null);

  // Initialize services
  useEffect(() => {
    initializeServices();
    return () => {
      cleanup();
    };
  }, []);

  // Update real-time stats
  useEffect(() => {
    if (isActive) {
      statsInterval.current = setInterval(updateStats, 1000);
    } else {
      if (statsInterval.current) {
        clearInterval(statsInterval.current);
        statsInterval.current = null;
      }
    }

    return () => {
      if (statsInterval.current) {
        clearInterval(statsInterval.current);
      }
    };
  }, [isActive]);

  const initializeServices = async () => {
    try {
      setLoading(true);
      
      // Initialize OCR service
      if (enableOCR) {
        await ocrService.initialize();
      }

      // Set up event handlers
      screenCapture.onFrameCapture(handleFrameCapture);
      screenCapture.onErrorOccurred(handleError);
      
      slideDetection.onSlideChangeDetected(handleSlideChange);

      setIsInitialized(true);
      setSuccessMessage('Screen sharing analysis ready!');
    } catch (err) {
      setError('Failed to initialize services');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const cleanup = () => {
    stopAnalysis();
    screenCapture.destroy();
    ocrService.terminate();
  };

  // Event handlers
  const handleFrameCapture = useCallback(async (frame: CaptureFrame) => {
    // Add to processing queue
    processingQueue.current.push(frame);
    
    // Process slide detection
    if (enableSlideDetection) {
      try {
        const slideChange = await slideDetection.processFrame(frame);
        if (slideChange) {
          handleSlideChange(slideChange);
        }
      } catch (err) {
        console.error('Slide detection error:', err);
      }
    }

    // Process OCR (async, don't block frame capture)
    if (enableOCR && processingQueue.current.length <= 5) { // Limit queue size
      processFrameOCR(frame);
    }
  }, [enableSlideDetection, enableOCR]);

  const handleSlideChange = useCallback((event: SlideChangeEvent) => {
    console.log('Slide change detected:', event);
    
    // Update current session
    if (currentSession) {
      setCurrentSession(prev => ({
        ...prev!,
        slides: [...prev!.slides, event.currentSlide]
      }));
    }

    // Update real-time stats
    setRealtimeStats(prev => ({
      ...prev,
      currentSlide: event.currentSlide,
      totalSlides: prev.totalSlides + 1
    }));
  }, [currentSession]);

  const handleError = useCallback((error: Error) => {
    setError(`Screen capture error: ${error.message}`);
    console.error(error);
  }, []);

  const processFrameOCR = async (frame: CaptureFrame) => {
    try {
      // Convert frame to image data
      const imageData = frame.imageData;
      
      // Process with OCR
      const ocrResult = await ocrService.extractTextFromSlide(frame.canvas);
      
      // Update session with OCR result
      if (currentSession && ocrResult.trim()) {
        setCurrentSession(prev => ({
          ...prev!,
          totalTextExtracted: prev!.totalTextExtracted + ocrResult.length
        }));

        // Update real-time stats
        setRealtimeStats(prev => ({
          ...prev,
          currentText: ocrResult.substring(0, 200) + (ocrResult.length > 200 ? '...' : '')
        }));
      }
    } catch (err) {
      console.error('OCR processing error:', err);
    } finally {
      // Remove from queue
      processingQueue.current.shift();
    }
  };

  const updateStats = () => {
    const captureMetrics = screenCapture.getPerformanceMetrics();
    const slideStats = slideDetection.getDetectionStats();
    const ocrStats = ocrService.getStats();

    setRealtimeStats(prev => ({
      ...prev,
      isCapturing: captureMetrics.isCapturing,
      processingFPS: captureMetrics.frameRate,
      ocrQueueSize: processingQueue.current.length,
      memoryUsage: captureMetrics.memoryUsage
    }));
  };

  // Control methods
  const startAnalysis = async () => {
    try {
      setLoading(true);
      setError('');

      // Update capture settings
      screenCapture.updateSettings(captureSettings);

      // Start screen capture
      const metadata = await screenCapture.startCapture();
      
      // Create new session
      const session: AnalysisSession = {
        id: `session_${Date.now()}`,
        startTime: Date.now(),
        slides: [],
        ocrResults: [],
        totalFrames: 0,
        totalTextExtracted: 0,
        averageConfidence: 0
      };

      setCurrentSession(session);
      setIsActive(true);
      setSuccessMessage('Screen sharing analysis started!');
      
      console.log('Screen capture started:', metadata);
    } catch (err) {
      setError('Failed to start screen capture');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const stopAnalysis = async () => {
    try {
      screenCapture.stopCapture();
      slideDetection.reset();
      
      // Finalize session
      if (currentSession) {
        const finalSession = {
          ...currentSession,
          endTime: Date.now()
        };
        
        if (autoSaveResults) {
          await saveSession(finalSession);
        }
        
        setCurrentSession(null);
      }

      setIsActive(false);
      setRealtimeStats(prev => ({
        ...prev,
        isCapturing: false,
        totalSlides: 0,
        currentText: '',
        processingFPS: 0,
        ocrQueueSize: 0
      }));

      setSuccessMessage('Analysis stopped and results saved!');
    } catch (err) {
      setError('Error stopping analysis');
      console.error(err);
    }
  };

  const saveSession = async (session: AnalysisSession) => {
    try {
      // Save to localStorage (in production, this would be an API call)
      const savedSessions = JSON.parse(localStorage.getItem('screenAnalysisSessions') || '[]');
      savedSessions.push(session);
      localStorage.setItem('screenAnalysisSessions', JSON.stringify(savedSessions));
      
      console.log('Session saved:', session);
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  };

  const downloadResults = () => {
    if (!currentSession) return;

    const data = {
      session: currentSession,
      stats: realtimeStats,
      timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screen-analysis-${currentSession.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Render methods
  const renderControls = () => (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">Screen Analysis Controls</Typography>
          <Box display="flex" gap={1}>
            {!isActive ? (
              <Button
                variant="contained"
                startIcon={<ScreenShareIcon />}
                onClick={startAnalysis}
                disabled={loading || !isInitialized}
                size="large"
              >
                Start Analysis
              </Button>
            ) : (
              <Button
                variant="contained"
                color="error"
                startIcon={<StopIcon />}
                onClick={stopAnalysis}
                size="large"
              >
                Stop Analysis
              </Button>
            )}
          </Box>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <FormControlLabel
              control={
                <Switch
                  checked={enableSlideDetection}
                  onChange={(e) => setEnableSlideDetection(e.target.checked)}
                  disabled={isActive}
                />
              }
              label="Slide Detection"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControlLabel
              control={
                <Switch
                  checked={enableOCR}
                  onChange={(e) => setEnableOCR(e.target.checked)}
                  disabled={isActive}
                />
              }
              label="Text Recognition (OCR)"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControlLabel
              control={
                <Switch
                  checked={autoSaveResults}
                  onChange={(e) => setAutoSaveResults(e.target.checked)}
                />
              }
              label="Auto-save Results"
            />
          </Grid>
        </Grid>

        {loading && <LinearProgress sx={{ mt: 2 }} />}
      </CardContent>
    </Card>
  );

  const renderRealTimeStats = () => (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Real-time Statistics
        </Typography>
        
        <Grid container spacing={2}>
          <Grid item xs={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" color="primary">
                {realtimeStats.totalSlides}
              </Typography>
              <Typography variant="body2">Slides Detected</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" color="secondary">
                {realtimeStats.processingFPS.toFixed(1)}
              </Typography>
              <Typography variant="body2">Processing FPS</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" color="success.main">
                {realtimeStats.ocrQueueSize}
              </Typography>
              <Typography variant="body2">OCR Queue</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" color="warning.main">
                {realtimeStats.memoryUsage.toFixed(1)}
              </Typography>
              <Typography variant="body2">Memory (MB)</Typography>
            </Paper>
          </Grid>
        </Grid>

        {realtimeStats.currentSlide && (
          <Box mt={2}>
            <Typography variant="subtitle1" gutterBottom>
              Current Slide
            </Typography>
            <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
              <Box display="flex" alignItems="center" gap={2}>
                <img
                  src={realtimeStats.currentSlide.thumbnail}
                  alt="Current slide"
                  style={{ width: 100, height: 56, objectFit: 'cover', borderRadius: 4 }}
                />
                <Box>
                  <Typography variant="body2">
                    Detected at {new Date(realtimeStats.currentSlide.timestamp).toLocaleTimeString()}
                  </Typography>
                  <Box display="flex" gap={1} mt={1}>
                    {realtimeStats.currentSlide.layout.hasTitle && <Chip label="Title" size="small" />}
                    {realtimeStats.currentSlide.layout.hasBulletPoints && <Chip label="Bullets" size="small" />}
                    {realtimeStats.currentSlide.layout.hasCharts && <Chip label="Charts" size="small" />}
                  </Box>
                </Box>
              </Box>
            </Paper>
          </Box>
        )}

        {realtimeStats.currentText && (
          <Box mt={2}>
            <Typography variant="subtitle1" gutterBottom>
              Latest Text Recognition
            </Typography>
            <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
              <Typography variant="body2" style={{ whiteSpace: 'pre-wrap' }}>
                {realtimeStats.currentText}
              </Typography>
            </Paper>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const renderSessionInfo = () => (
    currentSession && (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Current Session</Typography>
            <Box>
              <IconButton onClick={downloadResults} disabled={!currentSession}>
                <DownloadIcon />
              </IconButton>
              <IconButton disabled={!currentSession}>
                <ShareIcon />
              </IconButton>
            </Box>
          </Box>

          <List dense>
            <ListItem>
              <ListItemText 
                primary="Session ID" 
                secondary={currentSession.id}
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="Start Time" 
                secondary={new Date(currentSession.startTime).toLocaleString()}
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="Duration" 
                secondary={`${Math.round((Date.now() - currentSession.startTime) / 1000)} seconds`}
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="Slides Captured" 
                secondary={currentSession.slides.length}
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="Text Characters" 
                secondary={currentSession.totalTextExtracted}
              />
            </ListItem>
          </List>
        </CardContent>
      </Card>
    )
  );

  const renderDashboard = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        {renderControls()}
      </Grid>
      
      <Grid item xs={12} lg={8}>
        {renderRealTimeStats()}
      </Grid>
      
      <Grid item xs={12} lg={4}>
        {renderSessionInfo()}
      </Grid>
      
      {isActive && (
        <Grid item xs={12}>
          <Alert severity="info" icon={<AnalyticsIcon />}>
            Screen analysis is active. Switch to other tabs to view timeline and detailed analysis.
          </Alert>
        </Grid>
      )}
    </Grid>
  );

  if (!isInitialized && loading) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="60vh">
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Initializing Screen Analysis...
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Setting up capture, OCR, and slide detection services
        </Typography>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" mb={3}>
        <ScreenShareIcon sx={{ mr: 2, fontSize: 32 }} />
        <Box>
          <Typography variant="h4">Screen Sharing Analysis</Typography>
          <Typography variant="body1" color="text.secondary">
            Real-time analysis of shared screen content with OCR and slide detection
          </Typography>
        </Box>
      </Box>

      <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
        <Tab 
          label="Dashboard" 
          icon={<ViewIcon />} 
          iconPosition="start"
        />
        <Tab 
          label="Visual Timeline" 
          icon={<TimelineIcon />} 
          iconPosition="start"
        />
        <Tab 
          label="Vision Lab" 
          icon={<LabIcon />} 
          iconPosition="start"
        />
      </Tabs>

      {activeTab === 0 && renderDashboard()}
      {activeTab === 1 && <VisualTimeline />}
      {activeTab === 2 && <VisionLab />}

      {/* Status indicator */}
      {isActive && (
        <Fab
          color="primary"
          sx={{ 
            position: 'fixed', 
            bottom: 16, 
            right: 16,
            animation: 'pulse 2s infinite'
          }}
        >
          <ScreenShareIcon />
        </Fab>
      )}

      {/* Snackbars */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError('')}
      >
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage('')}
      >
        <Alert severity="success" onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ScreenSharingAnalysis;