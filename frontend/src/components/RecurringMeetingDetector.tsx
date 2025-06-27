// Recurring Meeting Detection and Management Component
// Automatically detects meeting patterns and suggests template application

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
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
  ListItemIcon,
  Divider,
  Alert,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Grid,
  Switch,
  FormControlLabel,
  Stepper,
  Step,
  StepLabel,
  StepContent
} from '@mui/material';
import {
  Repeat as RepeatIcon,
  TrendingUp as TrendingUpIcon,
  Schedule as ScheduleIcon,
  Assignment as AssignmentIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Settings as SettingsIcon,
  Visibility as ViewIcon,
  PlayArrow as PlayIcon,
  ExpandMore as ExpandMoreIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  AutoAwesome as AutoAwesomeIcon,
  EventRepeat as EventRepeatIcon,
  SmartToy as SmartToyIcon
} from '@mui/icons-material';

// Types
interface PatternDetectionResult {
  pattern_type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom';
  confidence: number;
  interval: number;
  start_date: string;
  suggested_template?: string;
  pattern_data?: any;
  meetings_analyzed: number;
}

interface RecurringSeries {
  id: string;
  name: string;
  description: string;
  template_id: string;
  template_name: string;
  recurrence_type: string;
  recurrence_interval: number;
  start_date: string;
  end_date?: string;
  duration_minutes: number;
  is_active: boolean;
  next_occurrence?: string;
  upcoming_count: number;
}

interface MeetingTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  default_duration_minutes: number;
}

interface RecurringMeetingDetectorProps {
  clientId: string;
  onSeriesCreated?: (series: RecurringSeries) => void;
}

const RecurringMeetingDetector: React.FC<RecurringMeetingDetectorProps> = ({
  clientId,
  onSeriesCreated
}) => {
  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detectedPatterns, setDetectedPatterns] = useState<PatternDetectionResult[]>([]);
  const [existingSeries, setExistingSeries] = useState<RecurringSeries[]>([]);
  const [templates, setTemplates] = useState<MeetingTemplate[]>([]);
  
  // UI State
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<PatternDetectionResult | null>(null);
  const [createStep, setCreateStep] = useState(0);
  const [autoDetectionEnabled, setAutoDetectionEnabled] = useState(true);
  
  // Form State
  const [seriesForm, setSeriesForm] = useState({
    name: '',
    description: '',
    template_id: '',
    recurrence_type: 'weekly',
    interval: 1,
    start_date: '',
    end_date: '',
    start_time: '09:00',
    duration_minutes: 60,
    timezone: 'UTC'
  });

  useEffect(() => {
    loadData();
  }, [clientId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      // Load in parallel
      await Promise.all([
        loadDetectedPatterns(),
        loadExistingSeries(),
        loadTemplates()
      ]);

    } catch (err) {
      setError('Failed to load recurring meeting data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadDetectedPatterns = async () => {
    try {
      const response = await fetch(`http://localhost:8000/recurring-meetings/detect-patterns?user_id=${clientId}&days_back=90`);
      
      if (response.ok) {
        const data = await response.json();
        setDetectedPatterns(data.patterns || []);
      }
    } catch (err) {
      console.error('Error loading detected patterns:', err);
    }
  };

  const loadExistingSeries = async () => {
    try {
      const response = await fetch(`http://localhost:8000/recurring-meetings/series?user_id=${clientId}`);
      
      if (response.ok) {
        const data = await response.json();
        setExistingSeries(data.series || []);
      }
    } catch (err) {
      console.error('Error loading existing series:', err);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await fetch('http://localhost:8000/meeting-templates');
      
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  };

  const handleApplyPattern = async (pattern: PatternDetectionResult) => {
    setSelectedPattern(pattern);
    setSeriesForm({
      ...seriesForm,
      name: `Auto-detected ${pattern.pattern_type} series`,
      recurrence_type: pattern.pattern_type,
      interval: pattern.interval,
      start_date: new Date(pattern.start_date).toISOString().split('T')[0]
    });
    setShowCreateDialog(true);
  };

  const handleCreateSeries = async () => {
    try {
      setLoading(true);

      const seriesData = {
        ...seriesForm,
        created_by: clientId,
        pattern_data: selectedPattern?.pattern_data
      };

      const response = await fetch('http://localhost:8000/recurring-meetings/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(seriesData)
      });

      if (response.ok) {
        const newSeries = await response.json();
        setExistingSeries(prev => [...prev, newSeries]);
        setShowCreateDialog(false);
        setCreateStep(0);
        
        if (onSeriesCreated) {
          onSeriesCreated(newSeries);
        }
      } else {
        throw new Error('Failed to create recurring series');
      }

    } catch (err) {
      setError('Failed to create recurring series');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getPatternIcon = (type: string) => {
    switch (type) {
      case 'daily': return '📅';
      case 'weekly': return '📆';
      case 'monthly': return '📊';
      case 'quarterly': return '📈';
      default: return '🔄';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    return 'error';
  };

  const renderDetectedPatterns = () => (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <SmartToyIcon color="primary" />
            <Typography variant="h6">AI-Detected Patterns</Typography>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={autoDetectionEnabled}
                onChange={(e) => setAutoDetectionEnabled(e.target.checked)}
              />
            }
            label="Auto-detect"
          />
        </Box>

        {detectedPatterns.length === 0 ? (
          <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
            <AutoAwesomeIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
            <Typography variant="h6" color="textSecondary" gutterBottom>
              No Patterns Detected
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Schedule more meetings to enable pattern detection
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={2}>
            {detectedPatterns.map((pattern, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Paper sx={{ p: 2, border: 1, borderColor: 'grey.200' }}>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="h6">
                        {getPatternIcon(pattern.pattern_type)} {pattern.pattern_type.charAt(0).toUpperCase() + pattern.pattern_type.slice(1)}
                      </Typography>
                      <Chip
                        label={`${Math.round(pattern.confidence * 100)}% confidence`}
                        size="small"
                        color={getConfidenceColor(pattern.confidence)}
                      />
                    </Box>
                    <Button
                      startIcon={<PlayIcon />}
                      onClick={() => handleApplyPattern(pattern)}
                      variant="outlined"
                      size="small"
                    >
                      Apply
                    </Button>
                  </Box>

                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    Analyzed {pattern.meetings_analyzed} meetings
                  </Typography>
                  
                  <Typography variant="body2" gutterBottom>
                    Every {pattern.interval} {pattern.pattern_type === 'daily' ? 'day(s)' : 
                           pattern.pattern_type === 'weekly' ? 'week(s)' : 
                           pattern.pattern_type === 'monthly' ? 'month(s)' : 'quarter(s)'}
                  </Typography>

                  <Typography variant="caption" color="textSecondary">
                    Detected from: {new Date(pattern.start_date).toLocaleDateString()}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        )}
      </CardContent>
    </Card>
  );

  const renderExistingSeries = () => (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <EventRepeatIcon color="primary" />
            <Typography variant="h6">Active Recurring Series</Typography>
          </Box>
          <Button
            startIcon={<RepeatIcon />}
            onClick={() => setShowCreateDialog(true)}
            variant="contained"
          >
            Create Series
          </Button>
        </Box>

        {existingSeries.length === 0 ? (
          <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
            <EventRepeatIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
            <Typography variant="h6" color="textSecondary" gutterBottom>
              No Recurring Series
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Create your first recurring meeting series
            </Typography>
          </Paper>
        ) : (
          <List>
            {existingSeries.map((series) => (
              <React.Fragment key={series.id}>
                <ListItem>
                  <ListItemIcon>
                    <RepeatIcon color={series.is_active ? 'primary' : 'disabled'} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="subtitle1">{series.name}</Typography>
                        <Chip
                          label={series.recurrence_type}
                          size="small"
                          variant="outlined"
                        />
                        {!series.is_active && (
                          <Chip label="Inactive" size="small" color="error" />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body2" color="textSecondary">
                          Template: {series.template_name} • {series.duration_minutes}min
                        </Typography>
                        {series.next_occurrence && (
                          <Typography variant="body2" color="primary">
                            Next: {new Date(series.next_occurrence).toLocaleString()}
                          </Typography>
                        )}
                        <Typography variant="caption" color="textSecondary">
                          {series.upcoming_count} upcoming meetings
                        </Typography>
                      </Box>
                    }
                  />
                  <Box display="flex" gap={1}>
                    <IconButton size="small">
                      <ViewIcon />
                    </IconButton>
                    <IconButton size="small">
                      <SettingsIcon />
                    </IconButton>
                  </Box>
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );

  const renderCreateDialog = () => (
    <Dialog 
      open={showCreateDialog} 
      onClose={() => setShowCreateDialog(false)}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <RepeatIcon />
          Create Recurring Meeting Series
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Stepper activeStep={createStep} orientation="vertical">
          <Step>
            <StepLabel>Basic Information</StepLabel>
            <StepContent>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Series Name"
                    value={seriesForm.name}
                    onChange={(e) => setSeriesForm({...seriesForm, name: e.target.value})}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Description"
                    multiline
                    rows={2}
                    value={seriesForm.description}
                    onChange={(e) => setSeriesForm({...seriesForm, description: e.target.value})}
                  />
                </Grid>
              </Grid>
              <Box sx={{ mt: 2 }}>
                <Button onClick={() => setCreateStep(1)} variant="contained">
                  Continue
                </Button>
              </Box>
            </StepContent>
          </Step>

          <Step>
            <StepLabel>Template & Schedule</StepLabel>
            <StepContent>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Meeting Template</InputLabel>
                    <Select
                      value={seriesForm.template_id}
                      onChange={(e) => setSeriesForm({...seriesForm, template_id: e.target.value})}
                    >
                      {templates.map((template) => (
                        <MenuItem key={template.id} value={template.id}>
                          {template.name} ({template.category})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={6}>
                  <FormControl fullWidth>
                    <InputLabel>Recurrence</InputLabel>
                    <Select
                      value={seriesForm.recurrence_type}
                      onChange={(e) => setSeriesForm({...seriesForm, recurrence_type: e.target.value})}
                    >
                      <MenuItem value="daily">Daily</MenuItem>
                      <MenuItem value="weekly">Weekly</MenuItem>
                      <MenuItem value="monthly">Monthly</MenuItem>
                      <MenuItem value="quarterly">Quarterly</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Interval"
                    type="number"
                    value={seriesForm.interval}
                    onChange={(e) => setSeriesForm({...seriesForm, interval: parseInt(e.target.value)})}
                  />
                </Grid>
              </Grid>
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                <Button onClick={() => setCreateStep(0)}>Back</Button>
                <Button onClick={() => setCreateStep(2)} variant="contained">
                  Continue
                </Button>
              </Box>
            </StepContent>
          </Step>

          <Step>
            <StepLabel>Timing & Duration</StepLabel>
            <StepContent>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Start Date"
                    type="date"
                    value={seriesForm.start_date}
                    onChange={(e) => setSeriesForm({...seriesForm, start_date: e.target.value})}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Start Time"
                    type="time"
                    value={seriesForm.start_time}
                    onChange={(e) => setSeriesForm({...seriesForm, start_time: e.target.value})}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Duration (minutes)"
                    type="number"
                    value={seriesForm.duration_minutes}
                    onChange={(e) => setSeriesForm({...seriesForm, duration_minutes: parseInt(e.target.value)})}
                  />
                </Grid>
                
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="End Date (optional)"
                    type="date"
                    value={seriesForm.end_date}
                    onChange={(e) => setSeriesForm({...seriesForm, end_date: e.target.value})}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </Grid>
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                <Button onClick={() => setCreateStep(1)}>Back</Button>
                <Button onClick={handleCreateSeries} variant="contained" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Series'}
                </Button>
              </Box>
            </StepContent>
          </Step>
        </Stepper>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={() => setShowCreateDialog(false)}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );

  return (
    <Box p={3}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h4" gutterBottom>
          Recurring Meetings
        </Typography>
        <Typography variant="body1" color="textSecondary">
          AI-powered pattern detection and automated recurring meeting management
        </Typography>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Loading State */}
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Content */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          {renderDetectedPatterns()}
        </Grid>
        
        <Grid item xs={12}>
          {renderExistingSeries()}
        </Grid>
      </Grid>

      {/* Create Dialog */}
      {renderCreateDialog()}
    </Box>
  );
};

export default RecurringMeetingDetector;