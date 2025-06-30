"""Add automation features: recurring meetings, action items, workflows, community templates

Revision ID: 003_add_automation_features
Revises: 002_add_indexes
Create Date: 2024-12-16 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "003_add_automation_features"
down_revision = "002_add_indexes"
branch_labels = None
depends_on = None


def upgrade():
    # Add new enum types
    recurrence_type_enum = postgresql.ENUM(
        "none",
        "daily",
        "weekly",
        "monthly",
        "quarterly",
        "yearly",
        "custom",
        name="recurrencetype",
    )
    recurrence_type_enum.create(op.get_bind())

    action_item_status_enum = postgresql.ENUM(
        "pending",
        "assigned",
        "in_progress",
        "completed",
        "cancelled",
        "overdue",
        name="actionitemstatus",
    )
    action_item_status_enum.create(op.get_bind())

    workflow_state_enum = postgresql.ENUM(
        "template_selected",
        "scheduled",
        "agenda_distributed",
        "reminders_sent",
        "in_progress",
        "recording",
        "transcribing",
        "analyzing",
        "insights_generated",
        "follow_up_sent",
        "completed",
        name="workflowstate",
    )
    workflow_state_enum.create(op.get_bind())

    notification_type_enum = postgresql.ENUM(
        "meeting_scheduled",
        "agenda_distributed",
        "reminder_24h",
        "reminder_1h",
        "meeting_started",
        "action_items_assigned",
        "follow_up_required",
        "meeting_summary",
        name="notificationtype",
    )
    notification_type_enum.create(op.get_bind())

    # Create recurring_meeting_series table
    op.create_table(
        "recurring_meeting_series",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recurrence_type", recurrence_type_enum, nullable=False),
        sa.Column("recurrence_interval", sa.Integer(), nullable=True, default=1),
        sa.Column(
            "recurrence_rule", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("start_time", sa.String(length=8), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("timezone", sa.String(length=50), nullable=True, default="UTC"),
        sa.Column("is_active", sa.Boolean(), nullable=True, default=True),
        sa.Column("created_by", sa.String(length=255), nullable=False),
        sa.Column("organization_id", sa.String(length=255), nullable=True),
        sa.Column(
            "detected_pattern", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("confidence_score", sa.Float(), nullable=True, default=0.0),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["template_id"], ["meeting_templates.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for recurring_meeting_series
    op.create_index(
        "idx_recurring_series_template_active",
        "recurring_meeting_series",
        ["template_id", "is_active"],
    )
    op.create_index(
        "idx_recurring_series_organization_type",
        "recurring_meeting_series",
        ["organization_id", "recurrence_type"],
    )
    op.create_index(
        "idx_recurring_series_start_date", "recurring_meeting_series", ["start_date"]
    )
    op.create_index(
        "idx_recurring_series_next_occurrence",
        "recurring_meeting_series",
        ["start_date", "is_active"],
    )

    # Create recurring_meeting_exceptions table
    op.create_table(
        "recurring_meeting_exceptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("series_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("original_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("exception_type", sa.String(length=50), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("new_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "modifications", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_by", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(
            ["series_id"], ["recurring_meeting_series.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "idx_recurring_exceptions_series_date",
        "recurring_meeting_exceptions",
        ["series_id", "original_date"],
    )

    # Create action_items table
    op.create_table(
        "action_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("insight_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(length=20), nullable=True, default="medium"),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("assigned_to", sa.String(length=255), nullable=True),
        sa.Column("assigned_by", sa.String(length=255), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", action_item_status_enum, nullable=False, default="pending"),
        sa.Column("progress_percentage", sa.Integer(), nullable=True, default=0),
        sa.Column("completion_notes", sa.Text(), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("estimated_hours", sa.Float(), nullable=True),
        sa.Column("actual_hours", sa.Float(), nullable=True),
        sa.Column("auto_extracted", sa.Boolean(), nullable=True, default=False),
        sa.Column("extraction_confidence", sa.Float(), nullable=True, default=0.0),
        sa.Column("reminder_count", sa.Integer(), nullable=True, default=0),
        sa.Column("last_reminder_sent", sa.DateTime(timezone=True), nullable=True),
        sa.Column("context", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "dependencies", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["insight_id"], ["ai_insights.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for action_items
    op.create_index(
        "idx_action_items_meeting_status", "action_items", ["meeting_id", "status"]
    )
    op.create_index(
        "idx_action_items_assigned_status", "action_items", ["assigned_to", "status"]
    )
    op.create_index(
        "idx_action_items_due_date_status", "action_items", ["due_date", "status"]
    )
    op.create_index(
        "idx_action_items_priority_status", "action_items", ["priority", "status"]
    )

    # Create action_item_updates table
    op.create_table(
        "action_item_updates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action_item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("update_text", sa.Text(), nullable=False),
        sa.Column("status_change", sa.String(length=100), nullable=True),
        sa.Column("progress_change", sa.Integer(), nullable=True),
        sa.Column("updated_by", sa.String(length=255), nullable=False),
        sa.Column("update_type", sa.String(length=50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["action_item_id"], ["action_items.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "idx_action_item_updates_item_created",
        "action_item_updates",
        ["action_item_id", "created_at"],
    )

    # Create meeting_workflows table
    op.create_table(
        "meeting_workflows",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "current_state",
            workflow_state_enum,
            nullable=False,
            default="template_selected",
        ),
        sa.Column("previous_state", workflow_state_enum, nullable=True),
        sa.Column(
            "workflow_name",
            sa.String(length=100),
            nullable=True,
            default="standard_meeting",
        ),
        sa.Column(
            "state_history",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "state_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "automation_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("auto_advance", sa.Boolean(), nullable=True, default=True),
        sa.Column("paused", sa.Boolean(), nullable=True, default=False),
        sa.Column("error_state", sa.String(length=100), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=True, default=0),
        sa.Column("next_scheduled_action", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_action_executed", sa.DateTime(timezone=True), nullable=True),
        sa.Column("estimated_completion", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for meeting_workflows
    op.create_index(
        "idx_meeting_workflows_state_scheduled",
        "meeting_workflows",
        ["current_state", "next_scheduled_action"],
    )
    op.create_index(
        "idx_meeting_workflows_meeting_state",
        "meeting_workflows",
        ["meeting_id", "current_state"],
    )

    # Create workflow_notifications table
    op.create_table(
        "workflow_notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("notification_type", notification_type_enum, nullable=False),
        sa.Column("trigger_state", workflow_state_enum, nullable=True),
        sa.Column("recipient_type", sa.String(length=50), nullable=False),
        sa.Column("recipients", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("subject_template", sa.String(length=500), nullable=True),
        sa.Column("body_template", sa.Text(), nullable=True),
        sa.Column(
            "notification_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "delivery_status", sa.String(length=50), nullable=True, default="pending"
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=True, default=True),
        sa.Column("retry_count", sa.Integer(), nullable=True, default=0),
        sa.Column("max_retries", sa.Integer(), nullable=True, default=3),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["workflow_id"], ["meeting_workflows.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for workflow_notifications
    op.create_index(
        "idx_workflow_notifications_scheduled",
        "workflow_notifications",
        ["scheduled_for", "delivery_status"],
    )
    op.create_index(
        "idx_workflow_notifications_workflow_type",
        "workflow_notifications",
        ["workflow_id", "notification_type"],
    )

    # Create template_ratings table
    op.create_table(
        "template_ratings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rated_by", sa.String(length=255), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("review", sa.Text(), nullable=True),
        sa.Column("organization_id", sa.String(length=255), nullable=True),
        sa.Column("usage_count", sa.Integer(), nullable=True, default=1),
        sa.Column("helpful_votes", sa.Integer(), nullable=True, default=0),
        sa.Column("total_votes", sa.Integer(), nullable=True, default=0),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["template_id"], ["meeting_templates.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_id", "rated_by", name="uq_template_rating_user"),
    )

    op.create_index(
        "idx_template_ratings_template_rating",
        "template_ratings",
        ["template_id", "rating"],
    )

    # Add foreign key columns to existing tables
    op.add_column(
        "meetings",
        sa.Column("recurring_series_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_meetings_recurring_series",
        "meetings",
        "recurring_meeting_series",
        ["recurring_series_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Create additional specialized indexes with WHERE clauses (PostgreSQL specific)
    op.execute(
        """
        CREATE INDEX CONCURRENTLY idx_action_items_overdue 
        ON action_items (due_date, status) 
        WHERE due_date < NOW()
    """
    )

    op.execute(
        """
        CREATE INDEX CONCURRENTLY idx_workflow_notifications_pending 
        ON workflow_notifications (scheduled_for) 
        WHERE delivery_status = 'pending'
    """
    )


def downgrade():
    # Remove indexes
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_workflow_notifications_pending")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_action_items_overdue")

    # Remove foreign key and column from meetings
    op.drop_constraint("fk_meetings_recurring_series", "meetings", type_="foreignkey")
    op.drop_column("meetings", "recurring_series_id")

    # Drop tables in reverse order
    op.drop_table("template_ratings")
    op.drop_table("workflow_notifications")
    op.drop_table("meeting_workflows")
    op.drop_table("action_item_updates")
    op.drop_table("action_items")
    op.drop_table("recurring_meeting_exceptions")
    op.drop_table("recurring_meeting_series")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS notificationtype")
    op.execute("DROP TYPE IF EXISTS workflowstate")
    op.execute("DROP TYPE IF EXISTS actionitemstatus")
    op.execute("DROP TYPE IF EXISTS recurrencetype")
