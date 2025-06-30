// Workflow State Machine Designer Component
// Visual workflow designer for meeting automation and state management

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Alert,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Chip,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot
} from '@mui/material';
import {
  Add as AddIcon,
  PlayArrow as PlayIcon,
  Settings as SettingsIcon,
  Save as SaveIcon,
  Code as CodeIcon,
  Timeline as TimelineIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as PendingIcon,
  Email as EmailIcon,
  Notifications as NotificationsIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';

// Types
interface WorkflowState {
  id: string;
  name: string;
  type: 'start' | 'process' | 'decision' | 'end';
  position: { x: number; y: number };
  config: {
    auto_advance?: boolean;
    delay_minutes?: number;
    conditions?: string[];
    actions?: WorkflowAction[];
    notifications?: WorkflowNotification[];
  };
}

interface WorkflowTransition {
  id: string;
  from_state: string;
  to_state: string;
  trigger: string;
  condition?: string;
  label: string;
}

interface WorkflowAction {
  id: string;
  name: string;
  type: 'email' | 'notification' | 'api_call' | 'delay' | 'condition';
  config: Record<string, unknown>;
  enabled: boolean;
}

interface WorkflowNotification {
  id: string;
  type: string;
  recipients: string;
  template: string;
  delay_minutes: number;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface WorkflowExecution {
  id: string;
  workflow_id: string;
  meeting_id: string;
  current_state: string;
  state_history: Array<Record<string, unknown>>;
  started_at: string;
  completed_at?: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
}

interface WorkflowDesignerProps {
  workflowId?: string;
  onSave?: (workflow: WorkflowDefinition) => void;
  readonly?: boolean;
}

const WorkflowDesigner: React.FC<WorkflowDesignerProps> = ({
  workflowId,
  onSave,
  readonly = false
}) => {
  // State
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // UI State
  const [selectedState, setSelectedState] = useState<WorkflowState | null>(null);
  const [showStateDialog, setShowStateDialog] = useState(false);
  const [showExecutionsDrawer, setShowExecutionsDrawer] = useState(false);
  
  // Form State
  const [stateForm, setStateForm] = useState({
    name: '',
    type: 'process',
    auto_advance: true,
    delay_minutes: 0,
    actions: [] as WorkflowAction[],
    notifications: [] as WorkflowNotification[]
  });

  // Predefined workflow states
  const defaultStates = [
    { id: 'template_selected', name: 'Template Selected', type: 'start' },
    { id: 'scheduled', name: 'Meeting Scheduled', type: 'process' },
    { id: 'agenda_distributed', name: 'Agenda Distributed', type: 'process' },
    { id: 'reminders_sent', name: 'Reminders Sent', type: 'process' },
    { id: 'in_progress', name: 'Meeting in Progress', type: 'process' },
    { id: 'recording', name: 'Recording', type: 'process' },
    { id: 'transcribing', name: 'Transcribing', type: 'process' },
    { id: 'analyzing', name: 'AI Analysis', type: 'process' },
    { id: 'insights_generated', name: 'Insights Generated', type: 'process' },
    { id: 'follow_up_sent', name: 'Follow-up Sent', type: 'process' },
    { id: 'completed', name: 'Workflow Complete', type: 'end' }
  ];

  useEffect(() => {
    if (workflowId) {
      loadWorkflow();
      loadExecutions();
    } else {
      // Create new workflow with default states
      createDefaultWorkflow();
    }
  }, [workflowId, loadWorkflow, loadExecutions, createDefaultWorkflow]);

  const loadWorkflow = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8000/workflows/${workflowId}`);
      
      if (response.ok) {
        const data = await response.json();
        setWorkflow(data);
      }
    } catch (err) {
      setError('Failed to load workflow');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  const loadExecutions = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:8000/workflows/${workflowId}/executions`);
      
      if (response.ok) {
        const data = await response.json();
        setExecutions(data.executions || []);
      }
    } catch (err) {
      console.error('Error loading executions:', err);
    }
  }, [workflowId]);

  const createDefaultWorkflow = useCallback(() => {
    const states: WorkflowState[] = defaultStates.map((state, index) => ({
      ...state,
      type: state.type as 'start' | 'process' | 'decision' | 'end',
      position: { x: 100 + (index % 3) * 300, y: 100 + Math.floor(index / 3) * 200 },
      config: { auto_advance: true, delay_minutes: 0, actions: [], notifications: [] }
    }));

    const transitions: WorkflowTransition[] = [
      { id: '1', from_state: 'template_selected', to_state: 'scheduled', trigger: 'meeting_scheduled', label: 'Schedule Meeting' },
      { id: '2', from_state: 'scheduled', to_state: 'agenda_distributed', trigger: 'agenda_sent', label: 'Send Agenda' },
      { id: '3', from_state: 'agenda_distributed', to_state: 'reminders_sent', trigger: 'reminders_sent', label: 'Send Reminders' },
      { id: '4', from_state: 'reminders_sent', to_state: 'in_progress', trigger: 'meeting_started', label: 'Start Meeting' },
      { id: '5', from_state: 'in_progress', to_state: 'recording', trigger: 'recording_started', label: 'Start Recording' },
      { id: '6', from_state: 'recording', to_state: 'transcribing', trigger: 'meeting_ended', label: 'End Meeting' },
      { id: '7', from_state: 'transcribing', to_state: 'analyzing', trigger: 'transcription_complete', label: 'Start Analysis' },
      { id: '8', from_state: 'analyzing', to_state: 'insights_generated', trigger: 'insights_complete', label: 'Generate Insights' },
      { id: '9', from_state: 'insights_generated', to_state: 'follow_up_sent', trigger: 'follow_up_sent', label: 'Send Follow-up' },
      { id: '10', from_state: 'follow_up_sent', to_state: 'completed', trigger: 'workflow_complete', label: 'Complete' }
    ];

    setWorkflow({
      id: 'new',
      name: 'Standard Meeting Workflow',
      description: 'Default meeting automation workflow',
      states,
      transitions,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }, [defaultStates]);

  const handleSaveWorkflow = async () => {
    if (!workflow) return;

    try {
      setLoading(true);

      const response = await fetch('http://localhost:8000/workflows', {
        method: workflow.id === 'new' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow)
      });

      if (response.ok) {
        const savedWorkflow = await response.json();
        setWorkflow(savedWorkflow);
        
        if (onSave) {
          onSave(savedWorkflow);
        }
      } else {
        throw new Error('Failed to save workflow');
      }

    } catch (err) {
      setError('Failed to save workflow');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddState = () => {
    if (!workflow) return;

    const newState: WorkflowState = {
      id: `state_${Date.now()}`,
      name: 'New State',
      type: 'process',
      position: { x: 200, y: 200 },
      config: { auto_advance: true, delay_minutes: 0, actions: [], notifications: [] }
    };

    setWorkflow({
      ...workflow,
      states: [...workflow.states, newState]
    });
  };

  const handleEditState = (state: WorkflowState) => {
    setSelectedState(state);
    setStateForm({
      name: state.name,
      type: state.type,
      auto_advance: state.config.auto_advance || true,
      delay_minutes: state.config.delay_minutes || 0,
      actions: state.config.actions || [],
      notifications: state.config.notifications || []
    });
    setShowStateDialog(true);
  };

  const handleUpdateState = () => {
    if (!workflow || !selectedState) return;

    const updatedStates = workflow.states.map(state =>
      state.id === selectedState.id
        ? {
            ...state,
            name: stateForm.name,
            type: stateForm.type as 'start' | 'process' | 'decision' | 'end',
            config: {
              ...state.config,
              auto_advance: stateForm.auto_advance,
              delay_minutes: stateForm.delay_minutes,
              actions: stateForm.actions,
              notifications: stateForm.notifications
            }
          }
        : state
    );

    setWorkflow({ ...workflow, states: updatedStates });
    setShowStateDialog(false);
    setSelectedState(null);
  };


  const getStateIcon = (type: string) => {
    switch (type) {
      case 'start': return <PlayIcon color="success" />;
      case 'process': return <SettingsIcon color="primary" />;
      case 'decision': return <CodeIcon color="warning" />;
      case 'end': return <CheckCircleIcon color="success" />;
      default: return <PendingIcon />;
    }
  };

  const getStateColor = (type: string) => {
    switch (type) {
      case 'start': return 'success.light';
      case 'process': return 'primary.light';
      case 'decision': return 'warning.light';
      case 'end': return 'success.light';
      default: return 'grey.300';
    }
  };

  const renderWorkflowCanvas = () => {
    if (!workflow) return null;

    return (
      <Paper 
        sx={{ 
          position: 'relative', 
          height: 600, 
          overflow: 'auto',
          border: 1,
          borderColor: 'grey.300',
          bgcolor: 'grey.50'
        }}
      >
        {/* States */}
        {workflow.states.map((state) => (
          <Paper
            key={state.id}
            sx={{
              position: 'absolute',
              left: state.position.x,
              top: state.position.y,
              width: 200,
              p: 2,
              cursor: readonly ? 'default' : 'move',
              border: selectedState?.id === state.id ? 2 : 1,
              borderColor: selectedState?.id === state.id ? 'primary.main' : 'grey.300',
              bgcolor: getStateColor(state.type),
              '&:hover': readonly ? {} : { borderColor: 'primary.light' }
            }}
            onClick={() => !readonly && handleEditState(state)}
          >
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              {getStateIcon(state.type)}
              <Typography variant="subtitle2" noWrap>
                {state.name}
              </Typography>
            </Box>
            
            <Typography variant="caption" color="textSecondary">
              {state.type}
            </Typography>
            
            {state.config.actions && state.config.actions.length > 0 && (
              <Chip
                label={`${state.config.actions.length} actions`}
                size="small"
                sx={{ mt: 1 }}
              />
            )}
          </Paper>
        ))}

        {/* Transitions (simplified as lines) */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}
        >
          {workflow.transitions.map((transition) => {
            const fromState = workflow.states.find(s => s.id === transition.from_state);
            const toState = workflow.states.find(s => s.id === transition.to_state);
            
            if (!fromState || !toState) return null;

            const x1 = fromState.position.x + 100;
            const y1 = fromState.position.y + 50;
            const x2 = toState.position.x + 100;
            const y2 = toState.position.y + 50;

            return (
              <g key={transition.id}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#1976d2"
                  strokeWidth="2"
                  markerEnd="url(#arrowhead)"
                />
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 5}
                  fill="#666"
                  fontSize="12"
                  textAnchor="middle"
                >
                  {transition.label}
                </text>
              </g>
            );
          })}
          
          {/* Arrow marker definition */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3.5, 0 7"
                fill="#1976d2"
              />
            </marker>
          </defs>
        </svg>
      </Paper>
    );
  };

  const renderStateDialog = () => (
    <Dialog open={showStateDialog} onClose={() => setShowStateDialog(false)} maxWidth="md" fullWidth>
      <DialogTitle>Edit Workflow State</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="State Name"
              value={stateForm.name}
              onChange={(e) => setStateForm({...stateForm, name: e.target.value})}
            />
          </Grid>
          
          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>State Type</InputLabel>
              <Select
                value={stateForm.type}
                onChange={(e) => setStateForm({...stateForm, type: e.target.value})}
              >
                <MenuItem value="start">Start</MenuItem>
                <MenuItem value="process">Process</MenuItem>
                <MenuItem value="decision">Decision</MenuItem>
                <MenuItem value="end">End</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Delay (minutes)"
              type="number"
              value={stateForm.delay_minutes}
              onChange={(e) => setStateForm({...stateForm, delay_minutes: parseInt(e.target.value)})}
            />
          </Grid>
          
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={stateForm.auto_advance}
                  onChange={(e) => setStateForm({...stateForm, auto_advance: e.target.checked})}
                />
              }
              label="Auto-advance to next state"
            />
          </Grid>

          <Grid item xs={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Actions ({stateForm.actions.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => {
                    const newAction: WorkflowAction = {
                      id: `action_${Date.now()}`,
                      name: 'New Action',
                      type: 'email',
                      config: {},
                      enabled: true
                    };
                    setStateForm({
                      ...stateForm,
                      actions: [...stateForm.actions, newAction]
                    });
                  }}
                  variant="outlined"
                  size="small"
                >
                  Add Action
                </Button>
                
                <List>
                  {stateForm.actions.map((action, index) => (
                    <ListItem key={action.id}>
                      <ListItemIcon>
                        {action.type === 'email' ? <EmailIcon /> : 
                         action.type === 'notification' ? <NotificationsIcon /> : 
                         <SettingsIcon />}
                      </ListItemIcon>
                      <ListItemText
                        primary={action.name}
                        secondary={action.type}
                      />
                      <Switch
                        checked={action.enabled}
                        onChange={(e) => {
                          const updatedActions = [...stateForm.actions];
                          updatedActions[index].enabled = e.target.checked;
                          setStateForm({...stateForm, actions: updatedActions});
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowStateDialog(false)}>Cancel</Button>
        <Button onClick={handleUpdateState} variant="contained">
          Update State
        </Button>
      </DialogActions>
    </Dialog>
  );

  const renderExecutionsDrawer = () => (
    <Drawer
      anchor="right"
      open={showExecutionsDrawer}
      onClose={() => setShowExecutionsDrawer(false)}
      PaperProps={{ sx: { width: 400 } }}
    >
      <Box p={2}>
        <Typography variant="h6" gutterBottom>
          Workflow Executions
        </Typography>
        
        {executions.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No executions found
          </Typography>
        ) : (
          <Timeline>
            {executions.map((execution) => (
              <TimelineItem key={execution.id}>
                <TimelineSeparator>
                  <TimelineDot
                    color={
                      execution.status === 'completed' ? 'success' :
                      execution.status === 'failed' ? 'error' :
                      execution.status === 'paused' ? 'warning' : 'primary'
                    }
                  />
                  <TimelineConnector />
                </TimelineSeparator>
                <TimelineContent>
                  <Typography variant="subtitle2">
                    Meeting: {execution.meeting_id}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Current: {execution.current_state}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    Started: {new Date(execution.started_at).toLocaleString()}
                  </Typography>
                  <Chip
                    label={execution.status}
                    size="small"
                    color={
                      execution.status === 'completed' ? 'success' :
                      execution.status === 'failed' ? 'error' :
                      execution.status === 'paused' ? 'warning' : 'default'
                    }
                    sx={{ mt: 1 }}
                  />
                </TimelineContent>
              </TimelineItem>
            ))}
          </Timeline>
        )}
      </Box>
    </Drawer>
  );

  if (!workflow) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height={400}>
        <Typography>Loading workflow...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" gutterBottom>
            Workflow Designer: {workflow.name}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {workflow.description}
          </Typography>
        </Box>
        
        <Box display="flex" gap={1}>
          <Button
            startIcon={<TimelineIcon />}
            onClick={() => setShowExecutionsDrawer(true)}
            variant="outlined"
          >
            Executions
          </Button>
          
          {!readonly && (
            <>
              <Button
                startIcon={<AddIcon />}
                onClick={handleAddState}
                variant="outlined"
              >
                Add State
              </Button>
              
              <Button
                startIcon={<SaveIcon />}
                onClick={handleSaveWorkflow}
                variant="contained"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save'}
              </Button>
            </>
          )}
        </Box>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Workflow Canvas */}
      {renderWorkflowCanvas()}

      {/* Workflow Info */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Workflow Statistics
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    States
                  </Typography>
                  <Typography variant="h4">
                    {workflow.states.length}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">
                    Transitions
                  </Typography>
                  <Typography variant="h4">
                    {workflow.transitions.length}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Configuration
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={workflow.is_active}
                    onChange={(e) => setWorkflow({...workflow, is_active: e.target.checked})}
                    disabled={readonly}
                  />
                }
                label="Workflow Active"
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Dialogs */}
      {renderStateDialog()}
      {renderExecutionsDrawer()}
    </Box>
  );
};

export default WorkflowDesigner;