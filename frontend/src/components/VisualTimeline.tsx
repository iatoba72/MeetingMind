import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Slider,
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
  // ListItemAvatar,
  // Avatar,
  Tooltip,
  Drawer,
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent,
  // Zoom,
  Fab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Switch,
  FormControlLabel
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  FastForward as FastForwardIcon,
  FastRewind as FastRewindIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Fullscreen as FullscreenIcon,
  FilterList as FilterIcon,
  // Search as SearchIcon,
  Download as DownloadIcon,
  Share as ShareIcon,
  PresentToAll as SlideIcon,
  TextFields as TextIcon,
  Image as ImageIcon,
  BarChart as ChartIcon,
  // Schedule as TimeIcon,
  // Visibility as ViewIcon,
  ExpandMore as ExpandMoreIcon,
  Close as CloseIcon
} from '@mui/icons-material';

import type { SlideChangeEvent, SlideInfo } from '../services/slideDetectionService';
import type { OCRResult } from '../services/ocrService';

// Types
interface TimelineSlide {
  id: string;
  timestamp: number;
  duration: number;
  slideInfo: SlideInfo;
  ocrResult?: OCRResult;
  changeEvent: SlideChangeEvent;
  thumbnail: string;
  title?: string;
  summary?: string;
  speakerSegments?: SpeakerSegment[];
}

interface SpeakerSegment {
  speaker: string;
  text: string;
  timestamp: number;
  duration: number;
  confidence: number;
}

interface TimelineFilter {
  slideTypes: string[];
  confidenceThreshold: number;
  showTransitions: boolean;
  showAnimations: boolean;
  textOnly: boolean;
  dateRange: [number, number];
}

interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  playbackSpeed: number;
  totalDuration: number;
}

const VisualTimeline: React.FC = () => {
  // State
  const [slides, setSlides] = useState<TimelineSlide[]>([]);
  const [selectedSlide, setSelectedSlide] = useState<TimelineSlide | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    playbackSpeed: 1,
    totalDuration: 0
  });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [filter, setFilter] = useState<TimelineFilter>({
    slideTypes: ['slide_change', 'content_update'],
    confidenceThreshold: 0.5,
    showTransitions: true,
    showAnimations: false,
    textOnly: false,
    dateRange: [0, Date.now()]
  });
  const [showFilters, setShowFilters] = useState(false);
  const [fullscreenSlide, setFullscreenSlide] = useState<TimelineSlide | null>(null);
  const [searchQuery] = useState('');

  // Refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const playbackInterval = useRef<NodeJS.Timeout | null>(null);

  // Mock data - in real implementation, this would come from the screen sharing service
  useEffect(() => {
    loadTimelineData();
  }, []);

  const loadTimelineData = async () => {
    // Mock timeline data
    const mockSlides: TimelineSlide[] = [
      {
        id: 'slide_1',
        timestamp: Date.now() - 600000, // 10 minutes ago
        duration: 120000, // 2 minutes
        slideInfo: {
          id: 'slide_1',
          timestamp: Date.now() - 600000,
          thumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          dominantColors: ['#ffffff', '#2196f3', '#000000'],
          layout: {
            hasTitle: true,
            hasBulletPoints: true,
            hasImages: false,
            hasCharts: false,
            textRegions: []
          },
          metadata: {
            aspectRatio: 16/9,
            complexity: 0.3,
            textDensity: 0.6,
            brightness: 0.8
          }
        },
        changeEvent: {
          id: 'change_1',
          timestamp: Date.now() - 600000,
          frameId: 'frame_1',
          changeType: 'slide_change',
          confidence: 0.95,
          currentSlide: {} as SlideInfo,
          metrics: {
            visualDifference: 0.9,
            structuralDifference: 0.8,
            colorDifference: 0.7,
            edgeDifference: 0.6
          }
        },
        thumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        title: 'Welcome & Agenda',
        summary: 'Meeting introduction and agenda overview'
      },
      {
        id: 'slide_2',
        timestamp: Date.now() - 480000, // 8 minutes ago
        duration: 180000, // 3 minutes
        slideInfo: {
          id: 'slide_2',
          timestamp: Date.now() - 480000,
          thumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          dominantColors: ['#ffffff', '#ff9800', '#4caf50'],
          layout: {
            hasTitle: true,
            hasBulletPoints: false,
            hasImages: true,
            hasCharts: true,
            textRegions: []
          },
          metadata: {
            aspectRatio: 16/9,
            complexity: 0.7,
            textDensity: 0.4,
            brightness: 0.9
          }
        },
        changeEvent: {
          id: 'change_2',
          timestamp: Date.now() - 480000,
          frameId: 'frame_2',
          changeType: 'slide_change',
          confidence: 0.88,
          currentSlide: {} as SlideInfo,
          metrics: {
            visualDifference: 0.8,
            structuralDifference: 0.9,
            colorDifference: 0.6,
            edgeDifference: 0.7
          }
        },
        thumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        title: 'Q3 Performance Metrics',
        summary: 'Quarterly performance review with charts and graphs'
      },
      {
        id: 'slide_3',
        timestamp: Date.now() - 300000, // 5 minutes ago
        duration: 240000, // 4 minutes
        slideInfo: {
          id: 'slide_3',
          timestamp: Date.now() - 300000,
          thumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          dominantColors: ['#f5f5f5', '#3f51b5', '#e91e63'],
          layout: {
            hasTitle: true,
            hasBulletPoints: true,
            hasImages: false,
            hasCharts: false,
            textRegions: []
          },
          metadata: {
            aspectRatio: 16/9,
            complexity: 0.5,
            textDensity: 0.8,
            brightness: 0.7
          }
        },
        changeEvent: {
          id: 'change_3',
          timestamp: Date.now() - 300000,
          frameId: 'frame_3',
          changeType: 'content_update',
          confidence: 0.72,
          currentSlide: {} as SlideInfo,
          metrics: {
            visualDifference: 0.6,
            structuralDifference: 0.5,
            colorDifference: 0.8,
            edgeDifference: 0.4
          }
        },
        thumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        title: 'Action Items & Next Steps',
        summary: 'Summary of action items and upcoming milestones'
      }
    ];

    setSlides(mockSlides);
    
    const totalDuration = mockSlides.length > 0 
      ? mockSlides[mockSlides.length - 1].timestamp + mockSlides[mockSlides.length - 1].duration - mockSlides[0].timestamp
      : 0;
      
    setPlaybackState(prev => ({ ...prev, totalDuration }));
    
    if (mockSlides.length > 0) {
      setFilter(prev => ({
        ...prev,
        dateRange: [mockSlides[0].timestamp, mockSlides[mockSlides.length - 1].timestamp + mockSlides[mockSlides.length - 1].duration]
      }));
    }
  };

  // Playback controls
  const togglePlayback = () => {
    if (playbackState.isPlaying) {
      pausePlayback();
    } else {
      startPlayback();
    }
  };

  const startPlayback = () => {
    setPlaybackState(prev => ({ ...prev, isPlaying: true }));
    
    playbackInterval.current = setInterval(() => {
      setPlaybackState(prev => {
        const newTime = prev.currentTime + (1000 * prev.playbackSpeed);
        if (newTime >= prev.totalDuration) {
          return { ...prev, currentTime: prev.totalDuration, isPlaying: false };
        }
        return { ...prev, currentTime: newTime };
      });
    }, 1000);
  };

  const pausePlayback = () => {
    setPlaybackState(prev => ({ ...prev, isPlaying: false }));
    if (playbackInterval.current) {
      clearInterval(playbackInterval.current);
      playbackInterval.current = null;
    }
  };

  const stopPlayback = () => {
    pausePlayback();
    setPlaybackState(prev => ({ ...prev, currentTime: 0 }));
  };

  const seekTo = (time: number) => {
    setPlaybackState(prev => ({ ...prev, currentTime: time }));
  };

  const changePlaybackSpeed = (speed: number) => {
    setPlaybackState(prev => ({ ...prev, playbackSpeed: speed }));
  };

  // Filtering
  const filteredSlides = slides.filter(slide => {
    // Type filter
    if (!filter.slideTypes.includes(slide.changeEvent.changeType)) {
      return false;
    }
    
    // Confidence filter
    if (slide.changeEvent.confidence < filter.confidenceThreshold) {
      return false;
    }
    
    // Transition filter
    if (!filter.showTransitions && slide.changeEvent.changeType === 'transition') {
      return false;
    }
    
    // Animation filter
    if (!filter.showAnimations && slide.changeEvent.changeType === 'animation') {
      return false;
    }
    
    // Text filter
    if (filter.textOnly && !slide.slideInfo.layout.hasTitle && !slide.slideInfo.layout.hasBulletPoints) {
      return false;
    }
    
    // Date range filter
    if (slide.timestamp < filter.dateRange[0] || slide.timestamp > filter.dateRange[1]) {
      return false;
    }
    
    // Search filter
    if (searchQuery && !slide.title?.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !slide.summary?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  // Get current slide based on playback time
  const getCurrentSlide = useCallback(() => {
    if (slides.length === 0) return null;
    
    const baseTime = slides[0].timestamp;
    const relativeTime = baseTime + playbackState.currentTime;
    
    return slides.find(slide => 
      relativeTime >= slide.timestamp && 
      relativeTime < slide.timestamp + slide.duration
    ) || slides[slides.length - 1];
  }, [slides, playbackState.currentTime]);

  const currentSlide = getCurrentSlide();

  // Timeline visualization
  const renderTimelineItem = (slide: TimelineSlide, index: number) => {
    const isActive = currentSlide?.id === slide.id;
    const relativeTime = slide.timestamp - (slides[0]?.timestamp || 0);
    // const progress = slides.length > 0 ? relativeTime / playbackState.totalDuration : 0;

    return (
      <TimelineItem key={slide.id}>
        <TimelineOppositeContent color="text.secondary" sx={{ flex: 0.2 }}>
          <Typography variant="body2">
            {new Date(slide.timestamp).toLocaleTimeString()}
          </Typography>
          <Typography variant="caption">
            {Math.round(slide.duration / 1000)}s
          </Typography>
        </TimelineOppositeContent>
        
        <TimelineSeparator>
          <TimelineDot 
            color={isActive ? "primary" : "grey"}
            variant={isActive ? "filled" : "outlined"}
            sx={{ 
              width: 16 + (slide.changeEvent.confidence * 8),
              height: 16 + (slide.changeEvent.confidence * 8)
            }}
          >
            {slide.slideInfo.layout.hasCharts ? <ChartIcon fontSize="small" /> :
             slide.slideInfo.layout.hasImages ? <ImageIcon fontSize="small" /> :
             <TextIcon fontSize="small" />}
          </TimelineDot>
          {index < filteredSlides.length - 1 && <TimelineConnector />}
        </TimelineSeparator>
        
        <TimelineContent sx={{ flex: 0.8 }}>
          <Card 
            variant={isActive ? "elevation" : "outlined"}
            elevation={isActive ? 4 : 1}
            sx={{ 
              cursor: 'pointer',
              transition: 'all 0.2s',
              '&:hover': {
                elevation: 3,
                transform: 'translateY(-2px)'
              }
            }}
            onClick={() => {
              setSelectedSlide(slide);
              seekTo(relativeTime);
            }}
          >
            <CardContent sx={{ p: 2 }}>
              <Box display="flex" alignItems="center" mb={1}>
                <img 
                  src={slide.thumbnail}
                  alt={slide.title || 'Slide thumbnail'}
                  style={{
                    width: 60 * zoomLevel,
                    height: 34 * zoomLevel,
                    objectFit: 'cover',
                    borderRadius: 4,
                    marginRight: 12
                  }}
                />
                <Box flex={1}>
                  <Typography variant="subtitle2" gutterBottom>
                    {slide.title || `Slide ${index + 1}`}
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.5} mb={1}>
                    <Chip 
                      label={slide.changeEvent.changeType.replace('_', ' ')}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                    <Chip 
                      label={`${Math.round(slide.changeEvent.confidence * 100)}%`}
                      size="small"
                      color={slide.changeEvent.confidence > 0.8 ? "success" : "warning"}
                    />
                    {slide.slideInfo.layout.hasTitle && (
                      <Chip label="Title" size="small" />
                    )}
                    {slide.slideInfo.layout.hasBulletPoints && (
                      <Chip label="Bullets" size="small" />
                    )}
                    {slide.slideInfo.layout.hasCharts && (
                      <Chip label="Charts" size="small" />
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {slide.summary}
                  </Typography>
                </Box>
              </Box>
              
              {/* Color palette */}
              <Box display="flex" gap={0.5} mt={1}>
                {slide.slideInfo.dominantColors.map((color, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      width: 16,
                      height: 16,
                      backgroundColor: color,
                      borderRadius: '50%',
                      border: '1px solid #ddd'
                    }}
                  />
                ))}
              </Box>
            </CardContent>
          </Card>
        </TimelineContent>
      </TimelineItem>
    );
  };

  // Controls panel
  const renderControls = () => (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Grid container spacing={2} alignItems="center">
        {/* Playback controls */}
        <Grid item>
          <Box display="flex" gap={1}>
            <IconButton onClick={() => seekTo(Math.max(0, playbackState.currentTime - 30000))}>
              <FastRewindIcon />
            </IconButton>
            <IconButton onClick={togglePlayback} color="primary">
              {playbackState.isPlaying ? <PauseIcon /> : <PlayIcon />}
            </IconButton>
            <IconButton onClick={stopPlayback}>
              <StopIcon />
            </IconButton>
            <IconButton onClick={() => seekTo(Math.min(playbackState.totalDuration, playbackState.currentTime + 30000))}>
              <FastForwardIcon />
            </IconButton>
          </Box>
        </Grid>

        {/* Timeline scrubber */}
        <Grid item xs>
          <Box px={2}>
            <Slider
              value={playbackState.currentTime}
              max={playbackState.totalDuration}
              onChange={(_, value) => seekTo(value as number)}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => {
                const minutes = Math.floor(value / 60000);
                const seconds = Math.floor((value % 60000) / 1000);
                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
              }}
            />
            <Box display="flex" justifyContent="space-between" mt={1}>
              <Typography variant="caption">
                {Math.floor(playbackState.currentTime / 60000)}:
                {Math.floor((playbackState.currentTime % 60000) / 1000).toString().padStart(2, '0')}
              </Typography>
              <Typography variant="caption">
                {Math.floor(playbackState.totalDuration / 60000)}:
                {Math.floor((playbackState.totalDuration % 60000) / 1000).toString().padStart(2, '0')}
              </Typography>
            </Box>
          </Box>
        </Grid>

        {/* Speed control */}
        <Grid item>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="body2">Speed:</Typography>
            <Button
              size="small"
              variant={playbackState.playbackSpeed === 0.5 ? "contained" : "outlined"}
              onClick={() => changePlaybackSpeed(0.5)}
            >
              0.5x
            </Button>
            <Button
              size="small"
              variant={playbackState.playbackSpeed === 1 ? "contained" : "outlined"}
              onClick={() => changePlaybackSpeed(1)}
            >
              1x
            </Button>
            <Button
              size="small"
              variant={playbackState.playbackSpeed === 2 ? "contained" : "outlined"}
              onClick={() => changePlaybackSpeed(2)}
            >
              2x
            </Button>
          </Box>
        </Grid>

        {/* Zoom controls */}
        <Grid item>
          <Box display="flex" gap={1}>
            <IconButton onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}>
              <ZoomOutIcon />
            </IconButton>
            <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'center' }}>
              {Math.round(zoomLevel * 100)}%
            </Typography>
            <IconButton onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.25))}>
              <ZoomInIcon />
            </IconButton>
          </Box>
        </Grid>

        {/* Filter toggle */}
        <Grid item>
          <IconButton onClick={() => setShowFilters(!showFilters)} color={showFilters ? "primary" : "default"}>
            <FilterIcon />
          </IconButton>
        </Grid>
      </Grid>
    </Paper>
  );

  // Filter drawer
  const renderFilterDrawer = () => (
    <Drawer
      anchor="right"
      open={showFilters}
      onClose={() => setShowFilters(false)}
      sx={{ '& .MuiDrawer-paper': { width: 300, p: 2 } }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Filters</Typography>
        <IconButton onClick={() => setShowFilters(false)}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Change Types</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <FormControlLabel
            control={
              <Switch
                checked={filter.slideTypes.includes('slide_change')}
                onChange={(e) => {
                  if (e.target.checked) {
                    setFilter(prev => ({
                      ...prev,
                      slideTypes: [...prev.slideTypes, 'slide_change']
                    }));
                  } else {
                    setFilter(prev => ({
                      ...prev,
                      slideTypes: prev.slideTypes.filter(t => t !== 'slide_change')
                    }));
                  }
                }}
              />
            }
            label="Slide Changes"
          />
          <FormControlLabel
            control={
              <Switch
                checked={filter.slideTypes.includes('content_update')}
                onChange={(e) => {
                  if (e.target.checked) {
                    setFilter(prev => ({
                      ...prev,
                      slideTypes: [...prev.slideTypes, 'content_update']
                    }));
                  } else {
                    setFilter(prev => ({
                      ...prev,
                      slideTypes: prev.slideTypes.filter(t => t !== 'content_update')
                    }));
                  }
                }}
              />
            }
            label="Content Updates"
          />
          <FormControlLabel
            control={
              <Switch
                checked={filter.showTransitions}
                onChange={(e) => setFilter(prev => ({ ...prev, showTransitions: e.target.checked }))}
              />
            }
            label="Transitions"
          />
          <FormControlLabel
            control={
              <Switch
                checked={filter.showAnimations}
                onChange={(e) => setFilter(prev => ({ ...prev, showAnimations: e.target.checked }))}
              />
            }
            label="Animations"
          />
        </AccordionDetails>
      </Accordion>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Quality</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography gutterBottom>Confidence Threshold</Typography>
          <Slider
            value={filter.confidenceThreshold}
            onChange={(_, value) => setFilter(prev => ({ ...prev, confidenceThreshold: value as number }))}
            min={0}
            max={1}
            step={0.1}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
          />
        </AccordionDetails>
      </Accordion>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Content Type</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <FormControlLabel
            control={
              <Switch
                checked={filter.textOnly}
                onChange={(e) => setFilter(prev => ({ ...prev, textOnly: e.target.checked }))}
              />
            }
            label="Text Content Only"
          />
        </AccordionDetails>
      </Accordion>
    </Drawer>
  );

  // Slide detail dialog
  const renderSlideDetail = () => (
    <Dialog
      open={!!selectedSlide}
      onClose={() => setSelectedSlide(null)}
      maxWidth="md"
      fullWidth
    >
      {selectedSlide && (
        <>
          <DialogTitle>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">
                {selectedSlide.title || 'Slide Details'}
              </Typography>
              <Box>
                <IconButton onClick={() => setFullscreenSlide(selectedSlide)}>
                  <FullscreenIcon />
                </IconButton>
                <IconButton onClick={() => setSelectedSlide(null)}>
                  <CloseIcon />
                </IconButton>
              </Box>
            </Box>
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <img
                  src={selectedSlide.thumbnail}
                  alt="Slide"
                  style={{
                    width: '100%',
                    height: 'auto',
                    borderRadius: 8,
                    border: '1px solid #ddd'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Details</Typography>
                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary="Timestamp" 
                      secondary={new Date(selectedSlide.timestamp).toLocaleString()}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Duration" 
                      secondary={`${Math.round(selectedSlide.duration / 1000)} seconds`}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Change Type" 
                      secondary={selectedSlide.changeEvent.changeType.replace('_', ' ')}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Confidence" 
                      secondary={`${Math.round(selectedSlide.changeEvent.confidence * 100)}%`}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Complexity" 
                      secondary={`${Math.round(selectedSlide.slideInfo.metadata.complexity * 100)}%`}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Text Density" 
                      secondary={`${Math.round(selectedSlide.slideInfo.metadata.textDensity * 100)}%`}
                    />
                  </ListItem>
                </List>

                <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Layout Features</Typography>
                <Box display="flex" flexWrap="wrap" gap={1}>
                  {selectedSlide.slideInfo.layout.hasTitle && <Chip label="Title" size="small" color="primary" />}
                  {selectedSlide.slideInfo.layout.hasBulletPoints && <Chip label="Bullet Points" size="small" color="primary" />}
                  {selectedSlide.slideInfo.layout.hasImages && <Chip label="Images" size="small" color="secondary" />}
                  {selectedSlide.slideInfo.layout.hasCharts && <Chip label="Charts" size="small" color="secondary" />}
                </Box>

                <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Color Palette</Typography>
                <Box display="flex" gap={1}>
                  {selectedSlide.slideInfo.dominantColors.map((color, idx) => (
                    <Tooltip key={idx} title={color}>
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          backgroundColor: color,
                          borderRadius: 1,
                          border: '1px solid #ddd'
                        }}
                      />
                    </Tooltip>
                  ))}
                </Box>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedSlide(null)}>Close</Button>
            <Button startIcon={<DownloadIcon />}>Download</Button>
            <Button startIcon={<ShareIcon />}>Share</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );

  // Fullscreen slide view
  const renderFullscreenSlide = () => (
    <Dialog
      open={!!fullscreenSlide}
      onClose={() => setFullscreenSlide(null)}
      maxWidth={false}
      fullScreen
    >
      {fullscreenSlide && (
        <Box
          sx={{
            position: 'relative',
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'black'
          }}
        >
          <img
            src={fullscreenSlide.thumbnail}
            alt="Slide"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain'
            }}
          />
          <Fab
            color="primary"
            sx={{ position: 'absolute', top: 16, right: 16 }}
            onClick={() => setFullscreenSlide(null)}
          >
            <CloseIcon />
          </Fab>
        </Box>
      )}
    </Dialog>
  );

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" mb={3}>
        <SlideIcon sx={{ mr: 2, fontSize: 32 }} />
        <Box>
          <Typography variant="h4">Visual Timeline</Typography>
          <Typography variant="body1" color="text.secondary">
            Timeline of shared screen content with slide detection and analysis
          </Typography>
        </Box>
      </Box>

      {renderControls()}

      {/* Current slide preview */}
      {currentSlide && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Currently Viewing
            </Typography>
            <Box display="flex" alignItems="center" gap={2}>
              <img
                src={currentSlide.thumbnail}
                alt="Current slide"
                style={{
                  width: 120,
                  height: 68,
                  objectFit: 'cover',
                  borderRadius: 8
                }}
              />
              <Box>
                <Typography variant="subtitle1">
                  {currentSlide.title || 'Current Slide'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {currentSlide.summary}
                </Typography>
                <Box display="flex" gap={1} mt={1}>
                  <Chip 
                    label={currentSlide.changeEvent.changeType.replace('_', ' ')}
                    size="small"
                    color="primary"
                  />
                  <Chip 
                    label={`${Math.round(currentSlide.changeEvent.confidence * 100)}%`}
                    size="small"
                    color="success"
                  />
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Paper sx={{ p: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Timeline ({filteredSlides.length} slides)
          </Typography>
        </Box>

        <Timeline ref={timelineRef}>
          {filteredSlides.map((slide, index) => renderTimelineItem(slide, index))}
        </Timeline>
      </Paper>

      {renderFilterDrawer()}
      {renderSlideDetail()}
      {renderFullscreenSlide()}
    </Box>
  );
};

export default VisualTimeline;