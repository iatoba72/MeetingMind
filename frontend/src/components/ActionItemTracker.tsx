// Action Item Tracker Component
// Comprehensive action item management with assignment, tracking, and automation

import React, { useState, useEffect, useCallback } from 'react';
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
  ListItemSecondaryAction,
  Divider,
  Alert,
  LinearProgress,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Menu,
  MenuList,
} from '@mui/material';
import {
  Assignment as AssignmentIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Comment as CommentIcon,
  Timeline as TimelineIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as PendingIcon,
  PlayArrow as InProgressIcon,
  Cancel as CancelIcon,
  MoreVert as MoreVertIcon,
  Notifications as NotificationsIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

// Types
interface ActionItem {
  id: string;
  meeting_id: string;
  meeting_title: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  assigned_to?: string;
  assigned_to_name?: string;
  assigned_by?: string;
  assigned_by_name?: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'overdue';
  progress_percentage: number;
  due_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
  auto_extracted: boolean;
  extraction_confidence: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  is_overdue: boolean;
  updates: ActionItemUpdate[];
}

interface ActionItemUpdate {
  id: string;
  update_text: string;
  status_change?: string;
  progress_change?: number;
  updated_by: string;
  updated_by_name: string;
  update_type: string;
  created_at: string;
}

interface ActionItemAnalytics {
  total_items: number;
  completed_items: number;
  overdue_items: number;
  in_progress_items: number;
  completion_rate: number;
  avg_completion_days: number;
  priority_distribution: Record<string, number>;
  status_distribution: Record<string, number>;
}

interface ActionItemTrackerProps {
  clientId: string;
  meetingId?: string;
  showMeetingContext?: boolean;
}

const ActionItemTracker: React.FC<ActionItemTrackerProps> = ({
  clientId,
  meetingId,
  showMeetingContext = true
}) => {
  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [analytics, setAnalytics] = useState<ActionItemAnalytics | null>(null);
  
  // UI State
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ActionItem | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  
  // Filters
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    assigned_to: 'all',
    category: 'all'
  });
  
  // Form State
  const [itemForm, setItemForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    category: 'general',
    assigned_to: '',
    due_date: null as Date | null,
    estimated_hours: 0
  });
  
  const [updateForm, setUpdateForm] = useState({
    update_text: '',
    progress_percentage: 0,
    new_status: ''
  });

  const loadActionItems = useCallback(async () => {
    try {
      let url = `http://localhost:8000/action-items?user_id=${clientId}`;
      
      if (meetingId) {
        url += `&meeting_id=${meetingId}`;
      }
      
      // Add filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== 'all') {
          url += `&${key}=${value}`;
        }
      });

      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        setActionItems(data.action_items || []);
      }
    } catch (err) {
      console.error('Error loading action items:', err);
    }
  }, [clientId, meetingId, filters]);

  const loadAnalytics = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:8000/action-items/analytics?user_id=${clientId}`);
      
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  }, [clientId]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Load action items and analytics
      await Promise.all([
        loadActionItems(),
        loadAnalytics()
      ]);

    } catch (err) {
      setError('Failed to load action items');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [loadActionItems, loadAnalytics]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateItem = async () => {
    try {
      setLoading(true);

      const itemData = {
        ...itemForm,
        meeting_id: meetingId,
        due_date: itemForm.due_date?.toISOString()
      };

      const response = await fetch('http://localhost:8000/action-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
      });

      if (response.ok) {
        await loadData();
        setShowCreateDialog(false);
        resetForm();
      } else {
        throw new Error('Failed to create action item');
      }

    } catch (err) {
      setError('Failed to create action item');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProgress = async () => {
    if (!selectedItem) return;

    try {
      setLoading(true);

      const response = await fetch(`http://localhost:8000/action-items/${selectedItem.id}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updateForm,
          updated_by: clientId
        })
      });

      if (response.ok) {
        await loadData();
        setShowUpdateDialog(false);
        setSelectedItem(null);
      } else {
        throw new Error('Failed to update action item');
      }

    } catch (err) {
      setError('Failed to update action item');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setItemForm({
      title: '',
      description: '',
      priority: 'medium',
      category: 'general',
      assigned_to: '',
      due_date: null,
      estimated_hours: 0
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <PendingIcon color="disabled" />;
      case 'assigned': return <PersonIcon color="info" />;
      case 'in_progress': return <InProgressIcon color="primary" />;
      case 'completed': return <CheckCircleIcon color="success" />;
      case 'cancelled': return <CancelIcon color="error" />;
      case 'overdue': return <WarningIcon color="error" />;
      default: return <PendingIcon />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'default';
      default: return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': return 'primary';
      case 'overdue': return 'error';
      case 'assigned': return 'info';
      default: return 'default';
    }
  };

  const filteredItems = actionItems.filter(item => {
    if (filters.status !== 'all' && item.status !== filters.status) return false;
    if (filters.priority !== 'all' && item.priority !== filters.priority) return false;
    if (filters.assigned_to !== 'all' && item.assigned_to !== filters.assigned_to) return false;
    if (filters.category !== 'all' && item.category !== filters.category) return false;
    return true;
  });

  const renderAnalytics = () => {
    if (!analytics) return null;

    return (
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <AssignmentIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h4">{analytics.total_items}</Typography>
              <Typography variant="body2" color="textSecondary">
                Total Items
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <CheckCircleIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
              <Typography variant="h4">{analytics.completion_rate}%</Typography>
              <Typography variant="body2" color="textSecondary">
                Completion Rate
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <WarningIcon sx={{ fontSize: 40, color: 'error.main', mb: 1 }} />
              <Typography variant="h4">{analytics.overdue_items}</Typography>
              <Typography variant="body2" color="textSecondary">
                Overdue Items
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <TimelineIcon sx={{ fontSize: 40, color: 'info.main', mb: 1 }} />
              <Typography variant="h4">{analytics.avg_completion_days}</Typography>
              <Typography variant="body2" color="textSecondary">
                Avg Days to Complete
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  const renderFilters = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <FilterIcon />
          <Typography variant="h6">Filters</Typography>
          <Box flexGrow={1} />
          <Button
            startIcon={<RefreshIcon />}
            onClick={loadData}
            variant="outlined"
            size="small"
          >
            Refresh
          </Button>
        </Box>
        
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="assigned">Assigned</MenuItem>
                <MenuItem value="in_progress">In Progress</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="overdue">Overdue</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Priority</InputLabel>
              <Select
                value={filters.priority}
                onChange={(e) => setFilters({...filters, priority: e.target.value})}
              >
                <MenuItem value="all">All Priorities</MenuItem>
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="urgent">Urgent</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Category</InputLabel>
              <Select
                value={filters.category}
                onChange={(e) => setFilters({...filters, category: e.target.value})}
              >
                <MenuItem value="all">All Categories</MenuItem>
                <MenuItem value="general">General</MenuItem>
                <MenuItem value="follow_up">Follow Up</MenuItem>
                <MenuItem value="research">Research</MenuItem>
                <MenuItem value="development">Development</MenuItem>
                <MenuItem value="communication">Communication</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );

  const renderActionItems = () => (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">Action Items ({filteredItems.length})</Typography>
          <Button
            startIcon={<AddIcon />}
            onClick={() => setShowCreateDialog(true)}
            variant="contained"
          >
            Add Item
          </Button>
        </Box>

        {filteredItems.length === 0 ? (
          <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
            <AssignmentIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
            <Typography variant="h6" color="textSecondary" gutterBottom>
              No Action Items
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Create your first action item to get started
            </Typography>
          </Paper>
        ) : (
          <List>
            {filteredItems.map((item) => (
              <React.Fragment key={item.id}>
                <ListItem>
                  <ListItemIcon>
                    {getStatusIcon(item.status)}
                  </ListItemIcon>
                  
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="subtitle1">{item.title}</Typography>
                        <Chip
                          label={item.priority}
                          size="small"
                          color={getPriorityColor(item.priority)}
                        />
                        <Chip
                          label={item.status}
                          size="small"
                          color={getStatusColor(item.status)}
                          variant="outlined"
                        />
                        {item.auto_extracted && (
                          <Chip
                            label="AI"
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem' }}
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box>
                        {item.description && (
                          <Typography variant="body2" color="textSecondary" gutterBottom>
                            {item.description}
                          </Typography>
                        )}
                        
                        <Box display="flex" alignItems="center" gap={2} mt={1}>
                          {item.assigned_to_name && (
                            <Box display="flex" alignItems="center" gap={0.5}>
                              <PersonIcon sx={{ fontSize: 16 }} />
                              <Typography variant="caption">
                                {item.assigned_to_name}
                              </Typography>
                            </Box>
                          )}
                          
                          {item.due_date && (
                            <Box display="flex" alignItems="center" gap={0.5}>
                              <ScheduleIcon sx={{ fontSize: 16 }} />
                              <Typography 
                                variant="caption"
                                color={item.is_overdue ? 'error' : 'textSecondary'}
                              >
                                {new Date(item.due_date).toLocaleDateString()}
                              </Typography>
                            </Box>
                          )}
                          
                          {showMeetingContext && (
                            <Typography variant="caption" color="textSecondary">
                              From: {item.meeting_title}
                            </Typography>
                          )}
                        </Box>
                        
                        {item.progress_percentage > 0 && (
                          <Box display="flex" alignItems="center" gap={1} mt={1}>
                            <LinearProgress
                              variant="determinate"
                              value={item.progress_percentage}
                              sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                            />
                            <Typography variant="caption">
                              {item.progress_percentage}%
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    }
                  />
                  
                  <ListItemSecondaryAction>
                    <IconButton
                      onClick={(e) => {
                        setSelectedItem(item);
                        setAnchorEl(e.currentTarget);
                      }}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
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
    <Dialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} maxWidth="md" fullWidth>
      <DialogTitle>Create Action Item</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Title"
              value={itemForm.title}
              onChange={(e) => setItemForm({...itemForm, title: e.target.value})}
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Description"
              multiline
              rows={3}
              value={itemForm.description}
              onChange={(e) => setItemForm({...itemForm, description: e.target.value})}
            />
          </Grid>
          
          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select
                value={itemForm.priority}
                onChange={(e) => setItemForm({...itemForm, priority: e.target.value})}
              >
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="urgent">Urgent</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={itemForm.category}
                onChange={(e) => setItemForm({...itemForm, category: e.target.value})}
              >
                <MenuItem value="general">General</MenuItem>
                <MenuItem value="follow_up">Follow Up</MenuItem>
                <MenuItem value="research">Research</MenuItem>
                <MenuItem value="development">Development</MenuItem>
                <MenuItem value="communication">Communication</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={6}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Due Date"
                value={itemForm.due_date}
                onChange={(date) => setItemForm({...itemForm, due_date: date})}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </LocalizationProvider>
          </Grid>
          
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Estimated Hours"
              type="number"
              value={itemForm.estimated_hours}
              onChange={(e) => setItemForm({...itemForm, estimated_hours: parseFloat(e.target.value)})}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowCreateDialog(false)}>Cancel</Button>
        <Button onClick={handleCreateItem} variant="contained" disabled={loading}>
          {loading ? 'Creating...' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const renderUpdateDialog = () => (
    <Dialog open={showUpdateDialog} onClose={() => setShowUpdateDialog(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Update Progress</DialogTitle>
      <DialogContent>
        {selectedItem && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              {selectedItem.title}
            </Typography>
            
            <TextField
              fullWidth
              label="Progress Update"
              multiline
              rows={3}
              value={updateForm.update_text}
              onChange={(e) => setUpdateForm({...updateForm, update_text: e.target.value})}
              sx={{ mb: 2 }}
            />
            
            <Box display="flex" alignItems="center" gap={2} mb={2}>
              <Typography variant="body2">Progress:</Typography>
              <Box flexGrow={1}>
                <LinearProgress
                  variant="determinate"
                  value={updateForm.progress_percentage}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
              <Typography variant="body2">
                {updateForm.progress_percentage}%
              </Typography>
            </Box>
            
            <TextField
              fullWidth
              label="Progress Percentage"
              type="number"
              inputProps={{ min: 0, max: 100 }}
              value={updateForm.progress_percentage}
              onChange={(e) => setUpdateForm({...updateForm, progress_percentage: parseInt(e.target.value)})}
              sx={{ mb: 2 }}
            />
            
            <FormControl fullWidth>
              <InputLabel>New Status (optional)</InputLabel>
              <Select
                value={updateForm.new_status}
                onChange={(e) => setUpdateForm({...updateForm, new_status: e.target.value})}
              >
                <MenuItem value="">Keep Current</MenuItem>
                <MenuItem value="assigned">Assigned</MenuItem>
                <MenuItem value="in_progress">In Progress</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowUpdateDialog(false)}>Cancel</Button>
        <Button onClick={handleUpdateProgress} variant="contained" disabled={loading}>
          {loading ? 'Updating...' : 'Update'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const renderActionMenu = () => (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={() => setAnchorEl(null)}
    >
      <MenuList>
        <MenuItem onClick={() => {
          setUpdateForm({
            update_text: '',
            progress_percentage: selectedItem?.progress_percentage || 0,
            new_status: ''
          });
          setShowUpdateDialog(true);
          setAnchorEl(null);
        }}>
          <EditIcon sx={{ mr: 1 }} />
          Update Progress
        </MenuItem>
        <MenuItem onClick={() => setAnchorEl(null)}>
          <CommentIcon sx={{ mr: 1 }} />
          View Updates
        </MenuItem>
        <MenuItem onClick={() => setAnchorEl(null)}>
          <NotificationsIcon sx={{ mr: 1 }} />
          Send Reminder
        </MenuItem>
      </MenuList>
    </Menu>
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box p={3}>
        {/* Header */}
        <Box mb={3}>
          <Typography variant="h4" gutterBottom>
            Action Item Tracker
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Track and manage action items with automated assignment and follow-up
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

        {/* Analytics */}
        {renderAnalytics()}

        {/* Filters */}
        {renderFilters()}

        {/* Action Items */}
        {renderActionItems()}

        {/* Dialogs */}
        {renderCreateDialog()}
        {renderUpdateDialog()}
        {renderActionMenu()}
      </Box>
    </LocalizationProvider>
  );
};

export default ActionItemTracker;