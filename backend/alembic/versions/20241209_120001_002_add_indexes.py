"""Add performance indexes for MeetingMind

Revision ID: 002
Revises: 001
Create Date: 2024-12-09 12:00:01.000000

Migration Type: performance_optimization
Database Impact: medium
Rollback Safe: yes

Description:
Adds comprehensive indexes for optimal query performance across all tables.
Includes compound indexes for common query patterns, partial indexes for
specific conditions, and full-text search indexes for content search.

Performance Notes:
Index creation may take significant time on large datasets.
All indexes are designed based on common query patterns identified
in the application layer.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade():
    """
    Add performance indexes to all tables

    Creates indexes optimized for common query patterns including:
    - Lookup by foreign keys
    - Date range queries
    - Status and state filtering
    - Full-text search capabilities
    """

    # Meeting Templates Indexes
    op.create_index("idx_meeting_templates_name", "meeting_templates", ["name"])
    op.create_index("idx_meeting_templates_category", "meeting_templates", ["category"])
    op.create_index(
        "idx_meeting_templates_created_by", "meeting_templates", ["created_by"]
    )
    op.create_index(
        "idx_meeting_templates_organization_public",
        "meeting_templates",
        ["organization_id", "is_public"],
    )
    op.create_index(
        "idx_meeting_templates_created_by_category",
        "meeting_templates",
        ["created_by", "category"],
    )

    # Meetings Indexes
    op.create_index("idx_meetings_title", "meetings", ["title"])
    op.create_index("idx_meetings_meeting_number", "meetings", ["meeting_number"])
    op.create_index("idx_meetings_scheduled_start", "meetings", ["scheduled_start"])
    op.create_index("idx_meetings_scheduled_end", "meetings", ["scheduled_end"])
    op.create_index("idx_meetings_status", "meetings", ["status"])
    op.create_index("idx_meetings_is_public", "meetings", ["is_public"])
    op.create_index("idx_meetings_created_by", "meetings", ["created_by"])
    op.create_index("idx_meetings_organization_id", "meetings", ["organization_id"])
    op.create_index("idx_meetings_template_id", "meetings", ["template_id"])
    op.create_index("idx_meetings_calendar_event_id", "meetings", ["calendar_event_id"])
    op.create_index(
        "idx_meetings_external_meeting_id", "meetings", ["external_meeting_id"]
    )

    # Compound indexes for common query patterns
    op.create_index(
        "idx_meetings_status_scheduled_start", "meetings", ["status", "scheduled_start"]
    )
    op.create_index(
        "idx_meetings_created_by_status", "meetings", ["created_by", "status"]
    )
    op.create_index(
        "idx_meetings_organization_status", "meetings", ["organization_id", "status"]
    )
    op.create_index(
        "idx_meetings_template_created_at", "meetings", ["template_id", "created_at"]
    )
    op.create_index(
        "idx_meetings_status_date_range",
        "meetings",
        ["status", "scheduled_start", "scheduled_end"],
    )

    # Partial indexes for specific conditions (PostgreSQL)
    if op.get_context().dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX idx_active_meetings ON meetings(id) WHERE status = 'active'"
        )
        op.execute(
            "CREATE INDEX idx_public_meetings ON meetings(scheduled_start) WHERE is_public = true"
        )

    # Participants Indexes
    op.create_index("idx_participants_meeting_id", "participants", ["meeting_id"])
    op.create_index("idx_participants_user_id", "participants", ["user_id"])
    op.create_index("idx_participants_email", "participants", ["email"])
    op.create_index("idx_participants_role", "participants", ["role"])
    op.create_index("idx_participants_status", "participants", ["status"])

    # Compound indexes for participant queries
    op.create_index(
        "idx_participants_meeting_role", "participants", ["meeting_id", "role"]
    )
    op.create_index(
        "idx_participants_meeting_status", "participants", ["meeting_id", "status"]
    )
    op.create_index(
        "idx_participants_user_id_status", "participants", ["user_id", "status"]
    )
    op.create_index(
        "idx_participants_email_status", "participants", ["email", "status"]
    )
    op.create_index(
        "idx_participants_meeting_engagement",
        "participants",
        ["meeting_id", sa.text("speaking_time_seconds DESC")],
    )

    # Transcripts Indexes
    op.create_index("idx_transcripts_meeting_id", "transcripts", ["meeting_id"])
    op.create_index("idx_transcripts_participant_id", "transcripts", ["participant_id"])
    op.create_index(
        "idx_transcripts_transcript_type", "transcripts", ["transcript_type"]
    )
    op.create_index(
        "idx_transcripts_start_time_seconds", "transcripts", ["start_time_seconds"]
    )
    op.create_index(
        "idx_transcripts_is_processed_for_insights",
        "transcripts",
        ["is_processed_for_insights"],
    )
    op.create_index(
        "idx_transcripts_contains_action_items",
        "transcripts",
        ["contains_action_items"],
    )

    # Compound indexes for transcript queries
    op.create_index(
        "idx_transcripts_meeting_time",
        "transcripts",
        ["meeting_id", "start_time_seconds"],
    )
    op.create_index(
        "idx_transcripts_meeting_type", "transcripts", ["meeting_id", "transcript_type"]
    )
    op.create_index(
        "idx_transcripts_participant_time",
        "transcripts",
        ["participant_id", "start_time_seconds"],
    )
    op.create_index(
        "idx_transcripts_processing_flags",
        "transcripts",
        ["is_processed_for_insights", "contains_action_items"],
    )
    op.create_index(
        "idx_transcripts_meeting_speaker_time",
        "transcripts",
        ["meeting_id", "participant_id", "start_time_seconds"],
    )

    # Full-text search indexes for PostgreSQL
    if op.get_context().dialect.name == "postgresql":
        # Enable trigram extension for better text search
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        # Create trigram indexes for content search
        op.execute(
            "CREATE INDEX idx_transcripts_content_fts ON transcripts USING gin(content gin_trgm_ops)"
        )

    # AI Insights Indexes
    op.create_index("idx_ai_insights_meeting_id", "ai_insights", ["meeting_id"])
    op.create_index("idx_ai_insights_insight_type", "ai_insights", ["insight_type"])
    op.create_index(
        "idx_ai_insights_is_user_validated", "ai_insights", ["is_user_validated"]
    )
    op.create_index(
        "idx_ai_insights_is_action_required", "ai_insights", ["is_action_required"]
    )
    op.create_index(
        "idx_ai_insights_action_due_date", "ai_insights", ["action_due_date"]
    )
    op.create_index("idx_ai_insights_is_public", "ai_insights", ["is_public"])

    # Compound indexes for AI insights
    op.create_index(
        "idx_ai_insights_meeting_type", "ai_insights", ["meeting_id", "insight_type"]
    )
    op.create_index(
        "idx_ai_insights_type_confidence",
        "ai_insights",
        ["insight_type", sa.text("confidence_score DESC")],
    )
    op.create_index(
        "idx_ai_insights_action_required_due",
        "ai_insights",
        ["is_action_required", "action_due_date"],
    )
    op.create_index(
        "idx_ai_insights_user_validated_created",
        "ai_insights",
        ["is_user_validated", "created_at"],
    )
    op.create_index(
        "idx_ai_insights_meeting_confidence",
        "ai_insights",
        ["meeting_id", sa.text("confidence_score DESC")],
    )

    # Full-text search for AI insights
    if op.get_context().dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX idx_ai_insights_content_fts ON ai_insights USING gin(to_tsvector('english', content))"
        )
        op.execute(
            "CREATE INDEX idx_ai_insights_title_fts ON ai_insights USING gin(to_tsvector('english', title))"
        )

    # Tags Indexes
    op.create_index("idx_tags_name", "tags", ["name"])
    op.create_index("idx_tags_slug", "tags", ["slug"])
    op.create_index("idx_tags_parent_id", "tags", ["parent_id"])
    op.create_index("idx_tags_is_system", "tags", ["is_system"])
    op.create_index("idx_tags_usage_count", "tags", [sa.text("usage_count DESC")])
    op.create_index("idx_tags_created_by", "tags", ["created_by"])
    op.create_index("idx_tags_organization_id", "tags", ["organization_id"])
    op.create_index("idx_tags_is_public", "tags", ["is_public"])

    # Compound indexes for tags
    op.create_index(
        "idx_tags_parent_usage", "tags", ["parent_id", sa.text("usage_count DESC")]
    )
    op.create_index(
        "idx_tags_organization_system", "tags", ["organization_id", "is_system"]
    )

    # Meeting Tags Association Indexes
    op.create_index("idx_meeting_tags_meeting_id", "meeting_tags", ["meeting_id"])
    op.create_index("idx_meeting_tags_tag_id", "meeting_tags", ["tag_id"])

    # Partial indexes for specific use cases (PostgreSQL only)
    if op.get_context().dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX idx_pending_insights ON ai_insights(meeting_id) WHERE is_user_validated = false"
        )
        op.execute(
            "CREATE INDEX idx_actionable_insights ON ai_insights(id) WHERE is_action_required = true"
        )
        op.execute(
            "CREATE INDEX idx_unprocessed_transcripts ON transcripts(meeting_id) WHERE is_processed_for_insights = false"
        )


def downgrade():
    """
    Remove all performance indexes

    This will significantly impact query performance but can be useful
    for debugging or if indexes are causing issues.
    """

    # Drop partial indexes (PostgreSQL specific)
    if op.get_context().dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS idx_unprocessed_transcripts")
        op.execute("DROP INDEX IF EXISTS idx_actionable_insights")
        op.execute("DROP INDEX IF EXISTS idx_pending_insights")
        op.execute("DROP INDEX IF EXISTS idx_public_meetings")
        op.execute("DROP INDEX IF EXISTS idx_active_meetings")

        # Drop full-text search indexes
        op.execute("DROP INDEX IF EXISTS idx_ai_insights_title_fts")
        op.execute("DROP INDEX IF EXISTS idx_ai_insights_content_fts")
        op.execute("DROP INDEX IF EXISTS idx_transcripts_content_fts")

    # Drop meeting_tags indexes
    op.drop_index("idx_meeting_tags_tag_id", "meeting_tags")
    op.drop_index("idx_meeting_tags_meeting_id", "meeting_tags")

    # Drop tags indexes
    op.drop_index("idx_tags_organization_system", "tags")
    op.drop_index("idx_tags_parent_usage", "tags")
    op.drop_index("idx_tags_is_public", "tags")
    op.drop_index("idx_tags_organization_id", "tags")
    op.drop_index("idx_tags_created_by", "tags")
    op.drop_index("idx_tags_usage_count", "tags")
    op.drop_index("idx_tags_is_system", "tags")
    op.drop_index("idx_tags_parent_id", "tags")
    op.drop_index("idx_tags_slug", "tags")
    op.drop_index("idx_tags_name", "tags")

    # Drop AI insights indexes
    op.drop_index("idx_ai_insights_meeting_confidence", "ai_insights")
    op.drop_index("idx_ai_insights_user_validated_created", "ai_insights")
    op.drop_index("idx_ai_insights_action_required_due", "ai_insights")
    op.drop_index("idx_ai_insights_type_confidence", "ai_insights")
    op.drop_index("idx_ai_insights_meeting_type", "ai_insights")
    op.drop_index("idx_ai_insights_is_public", "ai_insights")
    op.drop_index("idx_ai_insights_action_due_date", "ai_insights")
    op.drop_index("idx_ai_insights_is_action_required", "ai_insights")
    op.drop_index("idx_ai_insights_is_user_validated", "ai_insights")
    op.drop_index("idx_ai_insights_insight_type", "ai_insights")
    op.drop_index("idx_ai_insights_meeting_id", "ai_insights")

    # Drop transcript indexes
    op.drop_index("idx_transcripts_meeting_speaker_time", "transcripts")
    op.drop_index("idx_transcripts_processing_flags", "transcripts")
    op.drop_index("idx_transcripts_participant_time", "transcripts")
    op.drop_index("idx_transcripts_meeting_type", "transcripts")
    op.drop_index("idx_transcripts_meeting_time", "transcripts")
    op.drop_index("idx_transcripts_contains_action_items", "transcripts")
    op.drop_index("idx_transcripts_is_processed_for_insights", "transcripts")
    op.drop_index("idx_transcripts_start_time_seconds", "transcripts")
    op.drop_index("idx_transcripts_transcript_type", "transcripts")
    op.drop_index("idx_transcripts_participant_id", "transcripts")
    op.drop_index("idx_transcripts_meeting_id", "transcripts")

    # Drop participant indexes
    op.drop_index("idx_participants_meeting_engagement", "participants")
    op.drop_index("idx_participants_email_status", "participants")
    op.drop_index("idx_participants_user_id_status", "participants")
    op.drop_index("idx_participants_meeting_status", "participants")
    op.drop_index("idx_participants_meeting_role", "participants")
    op.drop_index("idx_participants_status", "participants")
    op.drop_index("idx_participants_role", "participants")
    op.drop_index("idx_participants_email", "participants")
    op.drop_index("idx_participants_user_id", "participants")
    op.drop_index("idx_participants_meeting_id", "participants")

    # Drop meeting indexes
    op.drop_index("idx_meetings_status_date_range", "meetings")
    op.drop_index("idx_meetings_template_created_at", "meetings")
    op.drop_index("idx_meetings_organization_status", "meetings")
    op.drop_index("idx_meetings_created_by_status", "meetings")
    op.drop_index("idx_meetings_status_scheduled_start", "meetings")
    op.drop_index("idx_meetings_external_meeting_id", "meetings")
    op.drop_index("idx_meetings_calendar_event_id", "meetings")
    op.drop_index("idx_meetings_template_id", "meetings")
    op.drop_index("idx_meetings_organization_id", "meetings")
    op.drop_index("idx_meetings_created_by", "meetings")
    op.drop_index("idx_meetings_is_public", "meetings")
    op.drop_index("idx_meetings_status", "meetings")
    op.drop_index("idx_meetings_scheduled_end", "meetings")
    op.drop_index("idx_meetings_scheduled_start", "meetings")
    op.drop_index("idx_meetings_meeting_number", "meetings")
    op.drop_index("idx_meetings_title", "meetings")

    # Drop meeting template indexes
    op.drop_index("idx_meeting_templates_created_by_category", "meeting_templates")
    op.drop_index("idx_meeting_templates_organization_public", "meeting_templates")
    op.drop_index("idx_meeting_templates_created_by", "meeting_templates")
    op.drop_index("idx_meeting_templates_category", "meeting_templates")
    op.drop_index("idx_meeting_templates_name", "meeting_templates")
