"""Initial database schema for MeetingMind

Revision ID: 001
Revises: 
Create Date: 2024-12-09 12:00:00.000000

Migration Type: initial_schema
Database Impact: high
Rollback Safe: yes

Description:
Creates the initial database schema for MeetingMind including:
- Meeting templates for reusable meeting configurations
- Meetings table with comprehensive state management
- Participants with role-based access and engagement tracking
- Transcripts with speaker identification and timing
- AI insights for meeting analysis and action items
- Tags for flexible categorization and search

Performance Notes:
This migration creates all base tables and indexes. Expect longer execution
time on large databases. All indexes are optimized for common query patterns.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    """
    Apply the initial schema migration
    
    Creates all tables, relationships, constraints, and indexes for
    the MeetingMind application database.
    """
    
    # Create custom enum types for PostgreSQL
    meeting_status_enum = postgresql.ENUM(
        'not_started', 'active', 'paused', 'ended', 'cancelled',
        name='meetingstatus'
    )
    
    participant_role_enum = postgresql.ENUM(
        'host', 'co_host', 'presenter', 'participant', 'observer',
        name='participantrole'
    )
    
    participant_status_enum = postgresql.ENUM(
        'invited', 'joined', 'left', 'removed', 'no_show',
        name='participantstatus'
    )
    
    transcript_type_enum = postgresql.ENUM(
        'speech', 'system', 'chat', 'action_item', 'summary',
        name='transcripttype'
    )
    
    insight_type_enum = postgresql.ENUM(
        'summary', 'action_items', 'decisions', 'sentiment', 'topics',
        'participants_analysis', 'follow_up',
        name='insighttype'
    )
    
    # Create enums only for PostgreSQL
    if op.get_context().dialect.name == 'postgresql':
        meeting_status_enum.create(op.get_bind())
        participant_role_enum.create(op.get_bind())
        participant_status_enum.create(op.get_bind())
        transcript_type_enum.create(op.get_bind())
        insight_type_enum.create(op.get_bind())
    
    # Create meeting_templates table
    op.create_table(
        'meeting_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('category', sa.String(100)),
        sa.Column('default_duration_minutes', sa.Integer(), default=60),
        sa.Column('default_settings', postgresql.JSONB(), default=dict),
        sa.Column('agenda_template', sa.Text()),
        sa.Column('created_by', sa.String(255), nullable=False),
        sa.Column('is_public', sa.Boolean(), default=False),
        sa.Column('organization_id', sa.String(255)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    
    # Create meetings table
    op.create_table(
        'meetings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('meeting_number', sa.String(50), unique=True),
        sa.Column('scheduled_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('scheduled_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('actual_start', sa.DateTime(timezone=True)),
        sa.Column('actual_end', sa.DateTime(timezone=True)),
        sa.Column('timezone', sa.String(50), default='UTC'),
        sa.Column('status', meeting_status_enum if op.get_context().dialect.name == 'postgresql' 
                 else sa.String(20), default='not_started', nullable=False),
        sa.Column('max_participants', sa.Integer(), default=100),
        sa.Column('is_recording', sa.Boolean(), default=True),
        sa.Column('is_transcription_enabled', sa.Boolean(), default=True),
        sa.Column('is_ai_insights_enabled', sa.Boolean(), default=True),
        sa.Column('meeting_url', sa.String(500)),
        sa.Column('meeting_password', sa.String(100)),
        sa.Column('is_public', sa.Boolean(), default=False),
        sa.Column('requires_approval', sa.Boolean(), default=False),
        sa.Column('created_by', sa.String(255), nullable=False),
        sa.Column('organization_id', sa.String(255)),
        sa.Column('template_id', postgresql.UUID(as_uuid=True), 
                 sa.ForeignKey('meeting_templates.id', ondelete='SET NULL')),
        sa.Column('calendar_event_id', sa.String(255)),
        sa.Column('external_meeting_id', sa.String(255)),
        sa.Column('agenda', sa.Text()),
        sa.Column('meeting_notes', sa.Text()),
        sa.Column('recording_url', sa.String(500)),
        sa.Column('participant_count', sa.Integer(), default=0),
        sa.Column('total_speaking_time_seconds', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint('scheduled_end > scheduled_start', name='check_meeting_schedule_order'),
        sa.CheckConstraint('actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start',
                          name='check_meeting_actual_times'),
    )
    
    # Create participants table
    op.create_table(
        'participants',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('meeting_id', postgresql.UUID(as_uuid=True), 
                 sa.ForeignKey('meetings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(255)),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('display_name', sa.String(255), nullable=False),
        sa.Column('avatar_url', sa.String(500)),
        sa.Column('role', participant_role_enum if op.get_context().dialect.name == 'postgresql'
                 else sa.String(20), default='participant', nullable=False),
        sa.Column('status', participant_status_enum if op.get_context().dialect.name == 'postgresql'
                 else sa.String(20), default='invited', nullable=False),
        sa.Column('invited_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('joined_at', sa.DateTime(timezone=True)),
        sa.Column('left_at', sa.DateTime(timezone=True)),
        sa.Column('speaking_time_seconds', sa.Integer(), default=0),
        sa.Column('microphone_on_duration_seconds', sa.Integer(), default=0),
        sa.Column('camera_on_duration_seconds', sa.Integer(), default=0),
        sa.Column('chat_messages_count', sa.Integer(), default=0),
        sa.Column('screen_share_duration_seconds', sa.Integer(), default=0),
        sa.Column('connection_quality_score', sa.Float()),
        sa.Column('device_info', postgresql.JSONB(), default=dict),
        sa.Column('ip_address', sa.String(45)),
        sa.Column('can_speak', sa.Boolean(), default=True),
        sa.Column('can_share_screen', sa.Boolean(), default=True),
        sa.Column('can_use_chat', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('meeting_id', 'email', name='uq_participant_meeting_email'),
    )
    
    # Create transcripts table
    op.create_table(
        'transcripts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('meeting_id', postgresql.UUID(as_uuid=True), 
                 sa.ForeignKey('meetings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('participant_id', postgresql.UUID(as_uuid=True), 
                 sa.ForeignKey('participants.id', ondelete='SET NULL')),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('transcript_type', transcript_type_enum if op.get_context().dialect.name == 'postgresql'
                 else sa.String(20), default='speech', nullable=False),
        sa.Column('language', sa.String(10), default='en'),
        sa.Column('start_time_seconds', sa.Float(), nullable=False),
        sa.Column('end_time_seconds', sa.Float(), nullable=False),
        sa.Column('sequence_number', sa.Integer(), nullable=False),
        sa.Column('confidence_score', sa.Float()),
        sa.Column('word_count', sa.Integer(), default=0),
        sa.Column('is_final', sa.Boolean(), default=False),
        sa.Column('speaker_id', sa.String(100)),
        sa.Column('is_speaker_identified', sa.Boolean(), default=False),
        sa.Column('transcription_engine', sa.String(100)),
        sa.Column('processing_metadata', postgresql.JSONB(), default=dict),
        sa.Column('is_processed_for_insights', sa.Boolean(), default=False),
        sa.Column('contains_action_items', sa.Boolean(), default=False),
        sa.Column('sentiment_score', sa.Float()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint('end_time_seconds >= start_time_seconds', name='check_transcript_time_order'),
        sa.UniqueConstraint('meeting_id', 'sequence_number', name='uq_transcript_meeting_sequence'),
    )
    
    # Create tags table
    op.create_table(
        'tags',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('slug', sa.String(100), nullable=False, unique=True),
        sa.Column('description', sa.Text()),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), 
                 sa.ForeignKey('tags.id', ondelete='CASCADE')),
        sa.Column('color', sa.String(7), default='#3B82F6'),
        sa.Column('icon', sa.String(50)),
        sa.Column('is_system', sa.Boolean(), default=False),
        sa.Column('is_auto_assigned', sa.Boolean(), default=False),
        sa.Column('usage_count', sa.Integer(), default=0),
        sa.Column('last_used', sa.DateTime(timezone=True)),
        sa.Column('created_by', sa.String(255)),
        sa.Column('organization_id', sa.String(255)),
        sa.Column('is_public', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('name', 'organization_id', name='uq_tag_name_organization'),
    )
    
    # Create ai_insights table
    op.create_table(
        'ai_insights',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('meeting_id', postgresql.UUID(as_uuid=True), 
                 sa.ForeignKey('meetings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('insight_type', insight_type_enum if op.get_context().dialect.name == 'postgresql'
                 else sa.String(30), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('structured_data', postgresql.JSONB(), default=dict),
        sa.Column('confidence_score', sa.Float(), nullable=False),
        sa.Column('accuracy_rating', sa.Float()),
        sa.Column('usefulness_rating', sa.Float()),
        sa.Column('ai_model', sa.String(100), nullable=False),
        sa.Column('processing_version', sa.String(50)),
        sa.Column('processing_duration_seconds', sa.Float()),
        sa.Column('input_token_count', sa.Integer()),
        sa.Column('output_token_count', sa.Integer()),
        sa.Column('processing_cost_cents', sa.Float()),
        sa.Column('source_transcript_ids', postgresql.JSONB(), default=list),
        sa.Column('source_time_range', postgresql.JSONB(), default=dict),
        sa.Column('is_user_validated', sa.Boolean(), default=False),
        sa.Column('user_feedback', sa.Text()),
        sa.Column('is_action_required', sa.Boolean(), default=False),
        sa.Column('action_assignee', sa.String(255)),
        sa.Column('action_due_date', sa.DateTime(timezone=True)),
        sa.Column('is_public', sa.Boolean(), default=False),
        sa.Column('shared_with', postgresql.JSONB(), default=list),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    
    # Create meeting_tags association table
    op.create_table(
        'meeting_tags',
        sa.Column('meeting_id', postgresql.UUID(as_uuid=True), 
                 sa.ForeignKey('meetings.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('tag_id', postgresql.UUID(as_uuid=True), 
                 sa.ForeignKey('tags.id', ondelete='CASCADE'), primary_key=True),
    )


def downgrade():
    """
    Revert the initial schema migration
    
    WARNING: This will drop all tables and data.
    Make sure you have a backup before running this downgrade.
    """
    
    # Drop tables in reverse order of creation (respecting foreign keys)
    op.drop_table('meeting_tags')
    op.drop_table('ai_insights')
    op.drop_table('tags')
    op.drop_table('transcripts')
    op.drop_table('participants')
    op.drop_table('meetings')
    op.drop_table('meeting_templates')
    
    # Drop enums for PostgreSQL
    if op.get_context().dialect.name == 'postgresql':
        sa.Enum(name='insighttype').drop(op.get_bind())
        sa.Enum(name='transcripttype').drop(op.get_bind())
        sa.Enum(name='participantstatus').drop(op.get_bind())
        sa.Enum(name='participantrole').drop(op.get_bind())
        sa.Enum(name='meetingstatus').drop(op.get_bind())