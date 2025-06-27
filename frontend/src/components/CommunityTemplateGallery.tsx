// Community Template Gallery Component
// Community-driven template sharing with ratings, reviews, and discovery

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Grid,
  Avatar,
  Rating,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Alert,
  LinearProgress,
  Tabs,
  Tab,
  Badge,
  Tooltip,
  Menu,
  MenuList,
  ListItemIcon,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  InputAdornment,
  CircularProgress,
  Pagination
} from '@mui/material';
import {
  Public as PublicIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  Download as DownloadIcon,
  Share as ShareIcon,
  Favorite as FavoriteIcon,
  FavoriteBorder as FavoriteBorderIcon,
  Visibility as ViewIcon,
  TrendingUp as TrendingUpIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  Sort as SortIcon,
  MoreVert as MoreVertIcon,
  Flag as FlagIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  ExpandMore as ExpandMoreIcon,
  Category as CategoryIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
  AccessTime as TimeIcon,
  Group as GroupIcon,
  Verified as VerifiedIcon
} from '@mui/icons-material';

// Types
interface CommunityTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  created_by: string;
  creator_name: string;
  creator_avatar?: string;
  created_at: string;
  updated_at: string;
  
  // Template details
  default_duration_minutes: number;
  default_settings: any;
  agenda_template: string;
  
  // Community features
  is_public: boolean;
  is_featured: boolean;
  is_verified: boolean;
  download_count: number;
  view_count: number;
  favorite_count: number;
  
  // Ratings and reviews
  rating_average: number;
  rating_count: number;
  reviews: TemplateReview[];
  user_rating?: number;
  user_favorite: boolean;
}

interface TemplateReview {
  id: string;
  template_id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  rating: number;
  review: string;
  usage_count: number;
  helpful_votes: number;
  total_votes: number;
  created_at: string;
}

interface TemplateFilter {
  search: string;
  category: string;
  rating: number;
  sort_by: 'popular' | 'newest' | 'rating' | 'downloads';
  verified_only: boolean;
  featured_only: boolean;
}

interface CommunityTemplateGalleryProps {
  clientId: string;
  onTemplateSelect?: (template: CommunityTemplate) => void;
  showMyTemplates?: boolean;
}

const CommunityTemplateGallery: React.FC<CommunityTemplateGalleryProps> = ({
  clientId,
  onTemplateSelect,
  showMyTemplates = false
}) => {
  // State
  const [templates, setTemplates] = useState<CommunityTemplate[]>([]);
  const [myTemplates, setMyTemplates] = useState<CommunityTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // UI State
  const [activeTab, setActiveTab] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<CommunityTemplate | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Filter State
  const [filters, setFilters] = useState<TemplateFilter>({
    search: '',
    category: 'all',
    rating: 0,
    sort_by: 'popular',
    verified_only: false,
    featured_only: false
  });
  
  // Review Form
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    review: '',
    usage_count: 1
  });

  const categories = [
    { value: 'all', label: 'All Categories', icon: '📁' },
    { value: 'standup', label: 'Stand-up', icon: '🏃' },
    { value: 'planning', label: 'Planning', icon: '📋' },
    { value: 'review', label: 'Review', icon: '🔍' },
    { value: 'presentation', label: 'Presentation', icon: '📊' },
    { value: 'interview', label: 'Interview', icon: '💬' },
    { value: 'training', label: 'Training', icon: '🎓' },
    { value: 'retrospective', label: 'Retrospective', icon: '🔄' },
    { value: 'brainstorming', label: 'Brainstorming', icon: '💡' },
    { value: 'client', label: 'Client Meeting', icon: '🤝' },
    { value: 'team', label: 'Team Sync', icon: '👥' }
  ];

  useEffect(() => {
    loadTemplates();
    if (showMyTemplates) {
      loadMyTemplates();
    }
  }, [filters, page]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '12',
        search: filters.search,
        category: filters.category,
        sort_by: filters.sort_by,
        min_rating: filters.rating.toString(),
        verified_only: filters.verified_only.toString(),
        featured_only: filters.featured_only.toString()
      });

      const response = await fetch(`http://localhost:8000/community-templates?${params}`);
      
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
        setTotalPages(data.total_pages || 1);
      }
    } catch (err) {
      setError('Failed to load community templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMyTemplates = async () => {
    try {
      const response = await fetch(`http://localhost:8000/community-templates/my?user_id=${clientId}`);
      
      if (response.ok) {
        const data = await response.json();
        setMyTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Error loading my templates:', err);
    }
  };

  const handleTemplateAction = async (action: string, templateId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/community-templates/${templateId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: clientId })
      });

      if (response.ok) {
        await loadTemplates();
      }
    } catch (err) {
      console.error(`Error performing ${action}:`, err);
    }
  };

  const handleRateTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      const response = await fetch(`http://localhost:8000/community-templates/${selectedTemplate.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: clientId,
          ...reviewForm
        })
      });

      if (response.ok) {
        await loadTemplates();
        setShowReviewDialog(false);
        setReviewForm({ rating: 5, review: '', usage_count: 1 });
      }
    } catch (err) {
      setError('Failed to submit review');
      console.error(err);
    }
  };

  const handleUseTemplate = async (template: CommunityTemplate) => {
    // Track usage
    await handleTemplateAction('use', template.id);
    
    if (onTemplateSelect) {
      onTemplateSelect(template);
    }
  };

  const renderTemplateCard = (template: CommunityTemplate) => (
    <Card key={template.id} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
          <Box flex={1}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <Typography variant="h6" noWrap>
                {template.name}
              </Typography>
              {template.is_verified && (
                <Tooltip title="Verified Template">
                  <VerifiedIcon color="primary" sx={{ fontSize: 20 }} />
                </Tooltip>
              )}
              {template.is_featured && (
                <Chip label="Featured" size="small" color="warning" />
              )}
            </Box>
            
            <Box display="flex" alignItems="center" gap={1}>
              <Chip
                label={categories.find(c => c.value === template.category)?.label || template.category}
                size="small"
                variant="outlined"
              />
              <Box display="flex" alignItems="center" gap={0.5}>
                <Rating value={template.rating_average} precision={0.1} size="small" readOnly />
                <Typography variant="caption" color="textSecondary">
                  ({template.rating_count})
                </Typography>
              </Box>
            </Box>
          </Box>
          
          <IconButton
            size="small"
            onClick={(e) => {
              setSelectedTemplate(template);
              setAnchorEl(e.currentTarget);
            }}
          >
            <MoreVertIcon />
          </IconButton>
        </Box>

        {/* Description */}
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2, minHeight: 40 }}>
          {template.description}
        </Typography>

        {/* Creator Info */}
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <Avatar src={template.creator_avatar} sx={{ width: 24, height: 24 }}>
            {template.creator_name.charAt(0)}
          </Avatar>
          <Typography variant="caption" color="textSecondary">
            by {template.creator_name}
          </Typography>
        </Box>

        {/* Stats */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Box display="flex" gap={2}>
            <Box display="flex" alignItems="center" gap={0.5}>
              <DownloadIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption">{template.download_count}</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={0.5}>
              <ViewIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption">{template.view_count}</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={0.5}>
              <FavoriteIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption">{template.favorite_count}</Typography>
            </Box>
          </Box>
          
          <Typography variant="caption" color="textSecondary">
            {template.default_duration_minutes}min
          </Typography>
        </Box>

        {/* Tags */}
        <Box display="flex" flexWrap="wrap" gap={1}>
          <Chip
            label={`${template.default_settings?.max_participants || 'N/A'} people`}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem' }}
          />
          {template.default_settings?.is_recording && (
            <Chip label="Recording" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
          )}
          {template.default_settings?.is_ai_insights_enabled && (
            <Chip label="AI Insights" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
          )}
        </Box>
      </CardContent>

      <CardActions>
        <Button
          size="small"
          startIcon={<ViewIcon />}
          onClick={() => {
            setSelectedTemplate(template);
            setShowDetailsDialog(true);
          }}
        >
          Details
        </Button>
        
        <Button
          size="small"
          startIcon={<DownloadIcon />}
          onClick={() => handleUseTemplate(template)}
          variant="contained"
        >
          Use
        </Button>
        
        <IconButton
          size="small"
          onClick={() => handleTemplateAction('favorite', template.id)}
          color={template.user_favorite ? 'error' : 'default'}
        >
          {template.user_favorite ? <FavoriteIcon /> : <FavoriteBorderIcon />}
        </IconButton>
      </CardActions>
    </Card>
  );

  const renderFilters = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search templates..."
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                )
              }}
              size="small"
            />
          </Grid>
          
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Category</InputLabel>
              <Select
                value={filters.category}
                onChange={(e) => setFilters({...filters, category: e.target.value})}
              >
                {categories.map((category) => (
                  <MenuItem key={category.value} value={category.value}>
                    {category.icon} {category.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Sort By</InputLabel>
              <Select
                value={filters.sort_by}
                onChange={(e) => setFilters({...filters, sort_by: e.target.value as any})}
              >
                <MenuItem value="popular">Most Popular</MenuItem>
                <MenuItem value="newest">Newest</MenuItem>
                <MenuItem value="rating">Highest Rated</MenuItem>
                <MenuItem value="downloads">Most Downloaded</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="body2">Min Rating:</Typography>
              <Rating
                value={filters.rating}
                onChange={(_, newValue) => setFilters({...filters, rating: newValue || 0})}
                size="small"
              />
            </Box>
          </Grid>
          
          <Grid item xs={12} md={2}>
            <Box display="flex" flexDirection="column" gap={1}>
              <Box display="flex" alignItems="center">
                <input
                  type="checkbox"
                  checked={filters.verified_only}
                  onChange={(e) => setFilters({...filters, verified_only: e.target.checked})}
                />
                <Typography variant="caption" sx={{ ml: 0.5 }}>
                  Verified only
                </Typography>
              </Box>
              <Box display="flex" alignItems="center">
                <input
                  type="checkbox"
                  checked={filters.featured_only}
                  onChange={(e) => setFilters({...filters, featured_only: e.target.checked})}
                />
                <Typography variant="caption" sx={{ ml: 0.5 }}>
                  Featured only
                </Typography>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );

  const renderTemplateDetails = () => (
    <Dialog open={showDetailsDialog} onClose={() => setShowDetailsDialog(false)} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">{selectedTemplate?.name}</Typography>
          <Box display="flex" gap={1}>
            <IconButton
              onClick={() => handleTemplateAction('favorite', selectedTemplate?.id || '')}
              color={selectedTemplate?.user_favorite ? 'error' : 'default'}
            >
              {selectedTemplate?.user_favorite ? <FavoriteIcon /> : <FavoriteBorderIcon />}
            </IconButton>
            <IconButton onClick={() => setShowShareDialog(true)}>
              <ShareIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {selectedTemplate && (
          <Box>
            {/* Creator and Stats */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar src={selectedTemplate.creator_avatar}>
                  {selectedTemplate.creator_name.charAt(0)}
                </Avatar>
                <Box>
                  <Typography variant="subtitle1">{selectedTemplate.creator_name}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    Created {new Date(selectedTemplate.created_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </Box>
              
              <Box display="flex" alignItems="center" gap={1}>
                <Rating value={selectedTemplate.rating_average} precision={0.1} readOnly />
                <Typography variant="body2">
                  ({selectedTemplate.rating_count} reviews)
                </Typography>
              </Box>
            </Box>

            {/* Description */}
            <Typography variant="body1" gutterBottom>
              {selectedTemplate.description}
            </Typography>

            {/* Template Details */}
            <Accordion sx={{ mt: 2 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Template Configuration</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">Duration</Typography>
                    <Typography variant="body1">{selectedTemplate.default_duration_minutes} minutes</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">Max Participants</Typography>
                    <Typography variant="body1">{selectedTemplate.default_settings?.max_participants || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">Recording</Typography>
                    <Typography variant="body1">
                      {selectedTemplate.default_settings?.is_recording ? 'Enabled' : 'Disabled'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">AI Insights</Typography>
                    <Typography variant="body1">
                      {selectedTemplate.default_settings?.is_ai_insights_enabled ? 'Enabled' : 'Disabled'}
                    </Typography>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>

            {/* Agenda Preview */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Agenda Template</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {selectedTemplate.agenda_template}
                  </Typography>
                </Paper>
              </AccordionDetails>
            </Accordion>

            {/* Reviews */}
            <Box mt={3}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Reviews</Typography>
                <Button
                  startIcon={<StarIcon />}
                  onClick={() => setShowReviewDialog(true)}
                  variant="outlined"
                  size="small"
                >
                  Write Review
                </Button>
              </Box>
              
              {selectedTemplate.reviews && selectedTemplate.reviews.length > 0 ? (
                selectedTemplate.reviews.map((review) => (
                  <Paper key={review.id} sx={{ p: 2, mb: 2 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="start" mb={1}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Avatar src={review.user_avatar} sx={{ width: 32, height: 32 }}>
                          {review.user_name.charAt(0)}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle2">{review.user_name}</Typography>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Rating value={review.rating} size="small" readOnly />
                            <Typography variant="caption" color="textSecondary">
                              Used {review.usage_count} time(s)
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                      
                      <Typography variant="caption" color="textSecondary">
                        {new Date(review.created_at).toLocaleDateString()}
                      </Typography>
                    </Box>
                    
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      {review.review}
                    </Typography>
                    
                    <Box display="flex" alignItems="center" gap={1}>
                      <IconButton size="small">
                        <ThumbUpIcon fontSize="small" />
                      </IconButton>
                      <Typography variant="caption">{review.helpful_votes}</Typography>
                      <IconButton size="small">
                        <ThumbDownIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Paper>
                ))
              ) : (
                <Typography variant="body2" color="textSecondary">
                  No reviews yet. Be the first to review this template!
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={() => setShowDetailsDialog(false)}>Close</Button>
        <Button
          onClick={() => selectedTemplate && handleUseTemplate(selectedTemplate)}
          variant="contained"
          startIcon={<DownloadIcon />}
        >
          Use Template
        </Button>
      </DialogActions>
    </Dialog>
  );

  const renderReviewDialog = () => (
    <Dialog open={showReviewDialog} onClose={() => setShowReviewDialog(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Write a Review</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" gutterBottom>Rating</Typography>
          <Rating
            value={reviewForm.rating}
            onChange={(_, newValue) => setReviewForm({...reviewForm, rating: newValue || 5})}
            size="large"
          />
          
          <TextField
            fullWidth
            label="Review"
            multiline
            rows={4}
            value={reviewForm.review}
            onChange={(e) => setReviewForm({...reviewForm, review: e.target.value})}
            sx={{ mt: 2 }}
          />
          
          <TextField
            fullWidth
            label="How many times have you used this template?"
            type="number"
            value={reviewForm.usage_count}
            onChange={(e) => setReviewForm({...reviewForm, usage_count: parseInt(e.target.value)})}
            sx={{ mt: 2 }}
            inputProps={{ min: 1 }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowReviewDialog(false)}>Cancel</Button>
        <Button onClick={handleRateTemplate} variant="contained">
          Submit Review
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
          if (selectedTemplate) handleTemplateAction('favorite', selectedTemplate.id);
          setAnchorEl(null);
        }}>
          <ListItemIcon>
            {selectedTemplate?.user_favorite ? <FavoriteIcon /> : <FavoriteBorderIcon />}
          </ListItemIcon>
          <ListItemText>
            {selectedTemplate?.user_favorite ? 'Remove from Favorites' : 'Add to Favorites'}
          </ListItemText>
        </MenuItem>
        
        <MenuItem onClick={() => {
          setShowShareDialog(true);
          setAnchorEl(null);
        }}>
          <ListItemIcon><ShareIcon /></ListItemIcon>
          <ListItemText>Share Template</ListItemText>
        </MenuItem>
        
        <MenuItem onClick={() => setAnchorEl(null)}>
          <ListItemIcon><FlagIcon /></ListItemIcon>
          <ListItemText>Report Template</ListItemText>
        </MenuItem>
      </MenuList>
    </Menu>
  );

  return (
    <Box p={3}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h4" gutterBottom>
          Community Template Gallery
        </Typography>
        <Typography variant="body1" color="textSecondary">
          Discover and share meeting templates with the community
        </Typography>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Tabs */}
      {showMyTemplates && (
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
          <Tab label={`Community Templates (${templates.length})`} />
          <Tab label={`My Templates (${myTemplates.length})`} />
        </Tabs>
      )}

      {/* Filters */}
      {renderFilters()}

      {/* Loading State */}
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Templates Grid */}
      <Grid container spacing={3}>
        {(activeTab === 0 ? templates : myTemplates).map((template) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={template.id}>
            {renderTemplateCard(template)}
          </Grid>
        ))}
      </Grid>

      {/* Empty State */}
      {(activeTab === 0 ? templates : myTemplates).length === 0 && !loading && (
        <Paper sx={{ p: 6, textAlign: 'center', mt: 3 }}>
          <PublicIcon sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
          <Typography variant="h6" color="textSecondary" gutterBottom>
            No Templates Found
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Try adjusting your search criteria or create your own template
          </Typography>
        </Paper>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Box display="flex" justifyContent="center" mt={4}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, newPage) => setPage(newPage)}
            color="primary"
          />
        </Box>
      )}

      {/* Dialogs */}
      {renderTemplateDetails()}
      {renderReviewDialog()}
      {renderActionMenu()}
    </Box>
  );
};

export default CommunityTemplateGallery;