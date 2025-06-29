import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  Grid, 
  Button, 
  TextField, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  Chip, 
  IconButton, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  Tabs,
  Tab,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  Switch,
  FormControlLabel
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Preview as PreviewIcon,
  Save as SaveIcon,
  Copy as CopyIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Template as TemplateIcon,
  PlayArrow as PlayIcon,
  ExpandMore as ExpandMoreIcon,
  Help as HelpIcon,
  Star as StarIcon
} from '@mui/icons-material';

// Types
interface SummaryTemplate {
  id: string;
  name: string;
  description: string;
  meetingType: string;
  templateContent: string;
  placeholders: string[];
  format: string;
  exampleOutput: string;
  createdBy: string;
  createdAt: string;
  usageCount: number;
  rating: number;
  isPublic: boolean;
  tags: string[];
}

interface TemplateVariable {
  name: string;
  description: string;
  type: 'text' | 'list' | 'date' | 'number';
  required: boolean;
  defaultValue?: string;
}

interface PreviewData {
  meetingTitle: string;
  meetingDate: string;
  participants: string[];
  keyPoints: string[];
  actionItems: string[];
  decisions: string[];
  duration: string;
}

const SummaryWorkshop: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [templates, setTemplates] = useState<SummaryTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SummaryTemplate | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Template editor state
  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    meetingType: 'general',
    templateContent: '',
    format: 'paragraph',
    isPublic: false,
    tags: [] as string[]
  });

  // Available variables for templates
  const availableVariables: TemplateVariable[] = [
    { name: 'meeting_title', description: 'Title of the meeting', type: 'text', required: false, defaultValue: 'Team Meeting' },
    { name: 'meeting_date', description: 'Date of the meeting', type: 'date', required: false },
    { name: 'participants', description: 'List of meeting participants', type: 'list', required: false },
    { name: 'duration', description: 'Meeting duration', type: 'text', required: false },
    { name: 'key_points', description: 'Key discussion points', type: 'list', required: true },
    { name: 'action_items', description: 'Action items identified', type: 'list', required: false },
    { name: 'decisions', description: 'Decisions made', type: 'list', required: false },
    { name: 'next_steps', description: 'Next steps planned', type: 'list', required: false },
    { name: 'next_meeting', description: 'Next meeting details', type: 'text', required: false },
    { name: 'project_name', description: 'Related project name', type: 'text', required: false },
    { name: 'objectives', description: 'Meeting objectives', type: 'list', required: false },
    { name: 'blockers', description: 'Identified blockers', type: 'list', required: false },
    { name: 'feedback', description: 'Feedback provided', type: 'list', required: false },
    { name: 'risks', description: 'Risks identified', type: 'list', required: false }
  ];

  // Sample preview data
  const samplePreviewData: PreviewData = {
    meetingTitle: 'Weekly Sprint Planning',
    meetingDate: '2024-01-15',
    participants: ['Alice Johnson', 'Bob Smith', 'Carol Davis'],
    keyPoints: [
      'Reviewed sprint goals and capacity',
      'Discussed technical debt priorities',
      'Planned user story breakdown'
    ],
    actionItems: [
      'Alice to refine user stories by Wednesday',
      'Bob to review technical architecture',
      'Carol to update sprint backlog'
    ],
    decisions: [
      'Decided to use React Query for state management',
      'Agreed on 2-week sprint duration',
      'Approved new UI design system'
    ],
    duration: '45 minutes'
  };

  // Predefined template examples
  const templateExamples = [
    {
      name: 'Daily Standup',
      description: 'Quick daily standup summary',
      meetingType: 'standup',
      content: `# Daily Standup - {meeting_date}

## Completed Yesterday
{completed_work}

## Planned Today  
{planned_work}

## Blockers
{blockers}

## Team Updates
{team_updates}`
    },
    {
      name: 'Sprint Review',
      description: 'Comprehensive sprint review summary',
      meetingType: 'review',
      content: `# Sprint Review Summary - {meeting_date}

**Sprint Goal:** {sprint_goal}
**Team:** {participants}

## Demo Items
{demo_items}

## Stakeholder Feedback
{feedback}

## Sprint Metrics
- **Velocity:** {velocity}
- **Completion Rate:** {completion_rate}

## Action Items
{action_items}

## Next Sprint Planning
{next_sprint_items}`
    },
    {
      name: 'Client Meeting',
      description: 'Professional client meeting summary',
      meetingType: 'client',
      content: `# Client Meeting Summary

**Date:** {meeting_date}
**Client:** {client_name}
**Project:** {project_name}
**Attendees:** {participants}

## Discussion Overview
{key_points}

## Client Requirements
{requirements}

## Deliverables Discussed
{deliverables}

## Next Steps
{action_items}

## Follow-up Actions
{follow_up_actions}

**Next Meeting:** {next_meeting}`
    }
  ];

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      // Simulate API call - replace with actual implementation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock data - replace with actual API call
      const mockTemplates: SummaryTemplate[] = [
        {
          id: '1',
          name: 'Executive Summary',
          description: 'High-level summary for executives',
          meetingType: 'general',
          templateContent: `# Executive Summary - {meeting_title}

**Date:** {meeting_date}
**Duration:** {duration}
**Attendees:** {participants}

## Key Outcomes
{key_points}

## Strategic Decisions
{decisions}

## Action Items
{action_items}

## Business Impact
{business_impact}`,
          placeholders: ['meeting_title', 'meeting_date', 'duration', 'participants', 'key_points', 'decisions', 'action_items', 'business_impact'],
          format: 'report',
          exampleOutput: 'Executive summary with strategic focus',
          createdBy: 'system',
          createdAt: '2024-01-01',
          usageCount: 45,
          rating: 4.8,
          isPublic: true,
          tags: ['executive', 'formal', 'strategic']
        },
        {
          id: '2',
          name: 'Quick Team Update',
          description: 'Brief team meeting summary',
          meetingType: 'standup',
          templateContent: `# Team Update - {meeting_date}

## Highlights
{key_points}

## Action Items
{action_items}

## Next Meeting: {next_meeting}`,
          placeholders: ['meeting_date', 'key_points', 'action_items', 'next_meeting'],
          format: 'bullet_points',
          exampleOutput: 'Concise team update',
          createdBy: 'user',
          createdAt: '2024-01-10',
          usageCount: 23,
          rating: 4.5,
          isPublic: false,
          tags: ['quick', 'team', 'informal']
        }
      ];
      
      setTemplates(mockTemplates);
    } catch {
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = () => {
    setEditMode(true);
    setSelectedTemplate(null);
    setTemplateForm({
      name: '',
      description: '',
      meetingType: 'general',
      templateContent: '',
      format: 'paragraph',
      isPublic: false,
      tags: []
    });
  };

  const handleEditTemplate = (template: SummaryTemplate) => {
    setEditMode(true);
    setSelectedTemplate(template);
    setTemplateForm({
      name: template.name,
      description: template.description,
      meetingType: template.meetingType,
      templateContent: template.templateContent,
      format: template.format,
      isPublic: template.isPublic,
      tags: template.tags
    });
  };

  const handleSaveTemplate = async () => {
    setLoading(true);
    try {
      // Validate template
      if (!templateForm.name.trim()) {
        throw new Error('Template name is required');
      }
      
      if (!templateForm.templateContent.trim()) {
        throw new Error('Template content is required');
      }

      // Extract placeholders from template content
      const placeholders = extractPlaceholders(templateForm.templateContent);

      const templateData = {
        ...templateForm,
        placeholders,
        id: selectedTemplate?.id || `template_${Date.now()}`,
        createdBy: 'current_user',
        createdAt: selectedTemplate?.createdAt || new Date().toISOString(),
        usageCount: selectedTemplate?.usageCount || 0,
        rating: selectedTemplate?.rating || 0
      };

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (selectedTemplate) {
        // Update existing template
        setTemplates(prev => prev.map(t => 
          t.id === selectedTemplate.id ? { ...templateData } : t
        ));
      } else {
        // Add new template
        setTemplates(prev => [...prev, templateData]);
      }

      setEditMode(false);
      setSelectedTemplate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async (template: SummaryTemplate) => {
    if (!window.confirm(`Are you sure you want to delete "${template.name}"?`)) {
      return;
    }

    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setTemplates(prev => prev.filter(t => t.id !== template.id));
    } catch {
      setError('Failed to delete template');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateTemplate = (template: SummaryTemplate) => {
    const duplicated = {
      ...template,
      id: `template_${Date.now()}`,
      name: `${template.name} (Copy)`,
      createdAt: new Date().toISOString(),
      usageCount: 0,
      isPublic: false
    };
    
    setTemplates(prev => [...prev, duplicated]);
  };

  const extractPlaceholders = (content: string): string[] => {
    const regex = /\{([^}]+)\}/g;
    const placeholders = [];
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      if (!placeholders.includes(match[1])) {
        placeholders.push(match[1]);
      }
    }
    
    return placeholders;
  };

  const generatePreview = (): string => {
    let preview = templateForm.templateContent;
    
    // Replace placeholders with sample data
    const replacements: Record<string, string> = {
      meeting_title: samplePreviewData.meetingTitle,
      meeting_date: samplePreviewData.meetingDate,
      participants: samplePreviewData.participants.join(', '),
      duration: samplePreviewData.duration,
      key_points: samplePreviewData.keyPoints.map(p => `• ${p}`).join('\n'),
      action_items: samplePreviewData.actionItems.map(a => `• ${a}`).join('\n'),
      decisions: samplePreviewData.decisions.map(d => `• ${d}`).join('\n'),
      next_meeting: 'Next Friday at 2:00 PM',
      project_name: 'MeetingMind Development',
      business_impact: 'Improved team productivity and communication'
    };

    Object.entries(replacements).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      preview = preview.replace(regex, value);
    });

    return preview;
  };

  const insertVariable = (variableName: string) => {
    const textarea = document.getElementById('template-content') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = templateForm.templateContent;
      const newText = text.substring(0, start) + `{${variableName}}` + text.substring(end);
      
      setTemplateForm(prev => ({ ...prev, templateContent: newText }));
      
      // Restore cursor position
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variableName.length + 2, start + variableName.length + 2);
      }, 0);
    }
  };

  const loadTemplateExample = (example: any) => {
    setTemplateForm(prev => ({
      ...prev,
      name: example.name,
      description: example.description,
      meetingType: example.meetingType,
      templateContent: example.content
    }));
  };

  const exportTemplate = (template: SummaryTemplate) => {
    const exportData = {
      name: template.name,
      description: template.description,
      meetingType: template.meetingType,
      templateContent: template.templateContent,
      format: template.format,
      placeholders: template.placeholders,
      tags: template.tags
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name.replace(/\s+/g, '_').toLowerCase()}_template.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importTemplate = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target?.result as string);
        setTemplateForm({
          name: importData.name || '',
          description: importData.description || '',
          meetingType: importData.meetingType || 'general',
          templateContent: importData.templateContent || '',
          format: importData.format || 'paragraph',
          isPublic: false,
          tags: importData.tags || []
        });
        setEditMode(true);
      } catch {
        setError('Invalid template file format');
      }
    };
    reader.readAsText(file);
  };

  const renderTemplateList = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">My Templates</Typography>
        <Box>
          <input
            accept=".json"
            style={{ display: 'none' }}
            id="import-template"
            type="file"
            onChange={importTemplate}
          />
          <label htmlFor="import-template">
            <IconButton component="span" color="primary">
              <UploadIcon />
            </IconButton>
          </label>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateTemplate}
            sx={{ ml: 1 }}
          >
            Create Template
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2}>
        {templates.map((template) => (
          <Grid item xs={12} md={6} lg={4} key={template.id}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                  <Typography variant="h6" gutterBottom>
                    {template.name}
                  </Typography>
                  <Box display="flex" alignItems="center">
                    {template.rating > 0 && (
                      <Box display="flex" alignItems="center" mr={1}>
                        <StarIcon color="primary" fontSize="small" />
                        <Typography variant="body2" ml={0.5}>
                          {template.rating.toFixed(1)}
                        </Typography>
                      </Box>
                    )}
                    {template.isPublic && (
                      <Chip label="Public" size="small" color="primary" />
                    )}
                  </Box>
                </Box>

                <Typography variant="body2" color="text.secondary" mb={2}>
                  {template.description}
                </Typography>

                <Box display="flex" flexWrap="wrap" gap={0.5} mb={2}>
                  <Chip label={template.meetingType} size="small" variant="outlined" />
                  <Chip label={template.format} size="small" variant="outlined" />
                  {template.tags.map((tag) => (
                    <Chip key={tag} label={tag} size="small" variant="outlined" />
                  ))}
                </Box>

                <Typography variant="body2" color="text.secondary" mb={2}>
                  Used {template.usageCount} times
                </Typography>

                <Box display="flex" justifyContent="space-between">
                  <Box>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => handleEditTemplate(template)}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Duplicate">
                      <IconButton size="small" onClick={() => handleDuplicateTemplate(template)}>
                        <CopyIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Export">
                      <IconButton size="small" onClick={() => exportTemplate(template)}>
                        <DownloadIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box>
                    <Tooltip title="Preview">
                      <IconButton size="small" onClick={() => {
                        setSelectedTemplate(template);
                        setTemplateForm({
                          name: template.name,
                          description: template.description,
                          meetingType: template.meetingType,
                          templateContent: template.templateContent,
                          format: template.format,
                          isPublic: template.isPublic,
                          tags: template.tags
                        });
                        setPreviewOpen(true);
                      }}>
                        <PreviewIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton 
                        size="small" 
                        color="error"
                        onClick={() => handleDeleteTemplate(template)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );

  const renderTemplateEditor = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">
          {selectedTemplate ? 'Edit Template' : 'Create Template'}
        </Typography>
        <Box>
          <Button 
            variant="outlined" 
            onClick={() => setEditMode(false)}
            sx={{ mr: 1 }}
          >
            Cancel
          </Button>
          <Button 
            variant="contained" 
            startIcon={<SaveIcon />}
            onClick={handleSaveTemplate}
            disabled={loading}
          >
            Save Template
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Template Information */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Template Information
            </Typography>
            
            <TextField
              fullWidth
              label="Template Name"
              value={templateForm.name}
              onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
              margin="normal"
              required
            />
            
            <TextField
              fullWidth
              label="Description"
              value={templateForm.description}
              onChange={(e) => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
              margin="normal"
              multiline
              rows={2}
            />
            
            <FormControl fullWidth margin="normal">
              <InputLabel>Meeting Type</InputLabel>
              <Select
                value={templateForm.meetingType}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, meetingType: e.target.value }))}
              >
                <MenuItem value="general">General</MenuItem>
                <MenuItem value="standup">Daily Standup</MenuItem>
                <MenuItem value="planning">Planning</MenuItem>
                <MenuItem value="retrospective">Retrospective</MenuItem>
                <MenuItem value="review">Review</MenuItem>
                <MenuItem value="brainstorming">Brainstorming</MenuItem>
                <MenuItem value="decision_making">Decision Making</MenuItem>
                <MenuItem value="training">Training</MenuItem>
                <MenuItem value="client">Client Meeting</MenuItem>
              </Select>
            </FormControl>
            
            <FormControl fullWidth margin="normal">
              <InputLabel>Format</InputLabel>
              <Select
                value={templateForm.format}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, format: e.target.value }))}
              >
                <MenuItem value="paragraph">Paragraph</MenuItem>
                <MenuItem value="bullet_points">Bullet Points</MenuItem>
                <MenuItem value="numbered_list">Numbered List</MenuItem>
                <MenuItem value="executive">Executive</MenuItem>
                <MenuItem value="report">Report</MenuItem>
                <MenuItem value="email">Email</MenuItem>
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={templateForm.isPublic}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, isPublic: e.target.checked }))}
                />
              }
              label="Make Public"
            />
          </Paper>

          {/* Available Variables */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Available Variables
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Click to insert into template
            </Typography>
            
            <List dense>
              {availableVariables.map((variable) => (
                <ListItem
                  key={variable.name}
                  button
                  onClick={() => insertVariable(variable.name)}
                >
                  <ListItemText
                    primary={`{${variable.name}}`}
                    secondary={variable.description}
                  />
                  <ListItemSecondaryAction>
                    {variable.required && (
                      <Chip label="Required" size="small" color="primary" />
                    )}
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Template Content Editor */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Template Content
            </Typography>
            
            <TextField
              id="template-content"
              fullWidth
              multiline
              rows={20}
              value={templateForm.templateContent}
              onChange={(e) => setTemplateForm(prev => ({ ...prev, templateContent: e.target.value }))}
              placeholder="Enter your template content here. Use {variable_name} for dynamic content."
              variant="outlined"
              sx={{ 
                fontFamily: 'monospace',
                '& .MuiInputBase-input': {
                  fontFamily: 'monospace'
                }
              }}
            />
            
            <Box mt={2} display="flex" justifyContent="space-between">
              <Button
                variant="outlined"
                startIcon={<PlayIcon />}
                onClick={() => setPreviewOpen(true)}
                disabled={!templateForm.templateContent}
              >
                Preview Template
              </Button>
              
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Variables found: {extractPlaceholders(templateForm.templateContent).length}
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Template Examples */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Template Examples
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Click to load an example template
            </Typography>
            
            <Grid container spacing={2}>
              {templateExamples.map((example, index) => (
                <Grid item xs={12} md={4} key={index}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" gutterBottom>
                        {example.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" mb={2}>
                        {example.description}
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => loadTemplateExample(example)}
                      >
                        Load Example
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );

  const renderHelp = () => (
    <Box>
      <Typography variant="h5" gutterBottom>
        Template Workshop Help
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Getting Started</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography>
                The Summary Workshop allows you to create custom templates for meeting summaries. 
                Templates use variables in curly braces {'{}'} that get replaced with actual meeting data.
              </Typography>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Template Variables</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box>
                <Typography mb={2}>
                  Use these variables in your templates:
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText primary="{meeting_title}" secondary="Title of the meeting" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="{meeting_date}" secondary="Date when meeting occurred" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="{participants}" secondary="List of attendees" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="{key_points}" secondary="Main discussion points" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="{action_items}" secondary="Tasks assigned" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="{decisions}" secondary="Decisions made" />
                  </ListItem>
                </List>
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Formatting Tips</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box>
                <Typography mb={2}>
                  Tips for creating effective templates:
                </Typography>
                <ul>
                  <li>Use Markdown formatting for structure (# for headers, * for bullets)</li>
                  <li>Keep variable names descriptive and consistent</li>
                  <li>Include section headers to organize content</li>
                  <li>Use list variables for bullet points and action items</li>
                  <li>Test your template with the preview feature</li>
                </ul>
              </Box>
            </AccordionDetails>
          </Accordion>
        </Grid>

        <Grid item xs={12} md={6}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Best Practices</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box>
                <Typography mb={2}>
                  Follow these best practices:
                </Typography>
                <ul>
                  <li>Start with a clear template name and description</li>
                  <li>Choose the appropriate meeting type for better AI processing</li>
                  <li>Include all necessary sections for your meeting type</li>
                  <li>Use consistent formatting throughout</li>
                  <li>Make templates reusable across similar meetings</li>
                  <li>Test templates with real meeting data</li>
                </ul>
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Sharing Templates</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography>
                You can share templates by making them public or exporting them as JSON files. 
                Public templates are available to all team members, while exported templates 
                can be imported by specific users.
              </Typography>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Troubleshooting</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box>
                <Typography mb={2}>
                  Common issues and solutions:
                </Typography>
                <ul>
                  <li><strong>Variables not replaced:</strong> Check spelling and use correct syntax</li>
                  <li><strong>Poor formatting:</strong> Use Markdown or plain text consistently</li>
                  <li><strong>Missing content:</strong> Ensure required variables are included</li>
                  <li><strong>Template not saving:</strong> Check for required fields and valid content</li>
                </ul>
              </Box>
            </AccordionDetails>
          </Accordion>
        </Grid>
      </Grid>
    </Box>
  );

  // Preview Dialog
  const PreviewDialog = () => (
    <Dialog
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        Template Preview
        <Typography variant="body2" color="text.secondary">
          {templateForm.name || 'Untitled Template'}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {generatePreview()}
          </pre>
        </Paper>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setPreviewOpen(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  );

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" mb={3}>
        <TemplateIcon sx={{ mr: 2, fontSize: 32 }} />
        <Box>
          <Typography variant="h4">Summary Workshop</Typography>
          <Typography variant="body1" color="text.secondary">
            Create and manage custom summary templates for different meeting types
          </Typography>
        </Box>
      </Box>

      <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
        <Tab 
          label="Templates" 
          icon={<TemplateIcon />} 
          iconPosition="start"
          disabled={editMode}
        />
        <Tab 
          label="Help" 
          icon={<HelpIcon />} 
          iconPosition="start"
          disabled={editMode}
        />
      </Tabs>

      {editMode ? (
        renderTemplateEditor()
      ) : activeTab === 0 ? (
        renderTemplateList()
      ) : (
        renderHelp()
      )}

      <PreviewDialog />
    </Box>
  );
};

export default SummaryWorkshop;