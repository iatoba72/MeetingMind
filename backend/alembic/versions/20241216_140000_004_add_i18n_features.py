"""Add internationalization features: multi-language transcription, translation memory, cultural context

Revision ID: 004_add_i18n_features
Revises: 003_add_automation_features
Create Date: 2024-12-16 14:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "004_add_i18n_features"
down_revision = "003_add_automation_features"
branch_labels = None
depends_on = None


def upgrade():
    # Add new enum types for internationalization
    language_code_enum = postgresql.ENUM(
        "en",
        "es",
        "fr",
        "de",
        "it",
        "pt",
        "ru",
        "zh",
        "ja",
        "ko",
        "ar",
        "hi",
        "bn",
        "tr",
        "nl",
        "sv",
        "no",
        "da",
        "fi",
        "pl",
        "cs",
        "hu",
        "ro",
        "bg",
        "hr",
        "sk",
        "sl",
        "et",
        "lv",
        "lt",
        "mt",
        "ga",
        "cy",
        name="languagecode",
    )
    language_code_enum.create(op.get_bind())

    translation_provider_enum = postgresql.ENUM(
        "google_translate",
        "azure_translator",
        "aws_translate",
        "deepl",
        "openai_gpt",
        "anthropic_claude",
        "internal_model",
        name="translationprovider",
    )
    translation_provider_enum.create(op.get_bind())

    translation_quality_enum = postgresql.ENUM(
        "draft", "standard", "professional", "premium", name="translationquality"
    )
    translation_quality_enum.create(op.get_bind())

    cultural_context_enum = postgresql.ENUM(
        "business_formal",
        "business_casual",
        "academic",
        "government",
        "healthcare",
        "legal",
        "technology",
        "creative",
        "international",
        name="culturalcontext",
    )
    cultural_context_enum.create(op.get_bind())

    # Create languages table
    op.create_table(
        "languages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", language_code_enum, nullable=False, index=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("native_name", sa.String(length=100), nullable=False),
        sa.Column("region", sa.String(length=100), nullable=True),
        sa.Column("script", sa.String(length=50), nullable=True),
        sa.Column("direction", sa.String(length=10), nullable=True, default="ltr"),
        sa.Column("family", sa.String(length=50), nullable=True),
        sa.Column("transcription_supported", sa.Boolean(), nullable=True, default=True),
        sa.Column("translation_supported", sa.Boolean(), nullable=True, default=True),
        sa.Column("tts_supported", sa.Boolean(), nullable=True, default=False),
        sa.Column(
            "sentiment_analysis_supported", sa.Boolean(), nullable=True, default=False
        ),
        sa.Column("transcription_accuracy", sa.Float(), nullable=True, default=0.0),
        sa.Column("translation_quality", sa.Float(), nullable=True, default=0.0),
        sa.Column("primary_cultural_context", cultural_context_enum, nullable=True),
        sa.Column(
            "cultural_notes", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "preferred_transcription_provider", sa.String(length=50), nullable=True
        ),
        sa.Column(
            "preferred_translation_provider", translation_provider_enum, nullable=True
        ),
        sa.Column("is_active", sa.Boolean(), nullable=True, default=True, index=True),
        sa.Column("usage_count", sa.Integer(), nullable=True, default=0),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )

    # Create indexes for languages
    op.create_index("idx_languages_code_active", "languages", ["code", "is_active"])
    op.create_index(
        "idx_languages_script_direction", "languages", ["script", "direction"]
    )
    op.create_index(
        "idx_languages_transcription_capability",
        "languages",
        ["transcription_supported", "transcription_accuracy"],
    )
    op.create_index(
        "idx_languages_translation_capability",
        "languages",
        ["translation_supported", "translation_quality"],
    )

    # Create multilanguage_transcripts table
    op.create_table(
        "multilanguage_transcripts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("language_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("original_text", sa.Text(), nullable=False),
        sa.Column("normalized_text", sa.Text(), nullable=True),
        sa.Column("phonetic_text", sa.Text(), nullable=True),
        sa.Column("detected_language", language_code_enum, nullable=False),
        sa.Column("detection_confidence", sa.Float(), nullable=True, default=0.0),
        sa.Column(
            "alternative_languages",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("is_code_switched", sa.Boolean(), nullable=True, default=False),
        sa.Column(
            "language_segments", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("start_time_seconds", sa.Float(), nullable=False),
        sa.Column("end_time_seconds", sa.Float(), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("transcription_confidence", sa.Float(), nullable=True, default=0.0),
        sa.Column("audio_quality_score", sa.Float(), nullable=True, default=0.0),
        sa.Column("speaker_clarity_score", sa.Float(), nullable=True, default=0.0),
        sa.Column("cultural_context", cultural_context_enum, nullable=True),
        sa.Column("formality_level", sa.String(length=20), nullable=True),
        sa.Column("regional_dialect", sa.String(length=50), nullable=True),
        sa.Column(
            "linguistic_features",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("transcription_provider", sa.String(length=50), nullable=True),
        sa.Column("model_version", sa.String(length=50), nullable=True),
        sa.Column("processing_time_ms", sa.Integer(), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["participant_id"], ["participants.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["language_id"], ["languages.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for multilanguage_transcripts
    op.create_index(
        "idx_ml_transcripts_meeting_lang",
        "multilanguage_transcripts",
        ["meeting_id", "language_id"],
    )
    op.create_index(
        "idx_ml_transcripts_time_range",
        "multilanguage_transcripts",
        ["meeting_id", "start_time_seconds", "end_time_seconds"],
    )
    op.create_index(
        "idx_ml_transcripts_detection_confidence",
        "multilanguage_transcripts",
        ["detected_language", "detection_confidence"],
    )
    op.create_index(
        "idx_ml_transcripts_code_switching",
        "multilanguage_transcripts",
        ["is_code_switched", "detection_confidence"],
    )

    # Create translation_memory table
    op.create_table(
        "translation_memory",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_hash", sa.String(length=64), nullable=False, index=True),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("target_text", sa.Text(), nullable=False),
        sa.Column("source_language", language_code_enum, nullable=False),
        sa.Column("target_language", language_code_enum, nullable=False),
        sa.Column("domain", sa.String(length=100), nullable=True),
        sa.Column(
            "context_tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("meeting_type", sa.String(length=50), nullable=True),
        sa.Column("quality_score", sa.Float(), nullable=True, default=0.0),
        sa.Column("usage_frequency", sa.Integer(), nullable=True, default=0),
        sa.Column("last_used", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fuzzy_threshold", sa.Float(), nullable=True, default=0.8),
        sa.Column("exact_matches", sa.Integer(), nullable=True, default=0),
        sa.Column("fuzzy_matches", sa.Integer(), nullable=True, default=0),
        sa.Column("is_validated", sa.Boolean(), nullable=True, default=False),
        sa.Column("validated_by", sa.String(length=255), nullable=True),
        sa.Column("validation_notes", sa.Text(), nullable=True),
        sa.Column("organization_id", sa.String(length=255), nullable=True, index=True),
        sa.Column("is_global", sa.Boolean(), nullable=True, default=False),
        sa.Column("created_by", sa.String(length=255), nullable=False),
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
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for translation_memory
    op.create_index(
        "idx_tm_languages_domain",
        "translation_memory",
        ["source_language", "target_language", "domain"],
    )
    op.create_index(
        "idx_tm_quality_usage",
        "translation_memory",
        ["quality_score", "usage_frequency"],
    )
    op.create_index(
        "idx_tm_organization_global",
        "translation_memory",
        ["organization_id", "is_global"],
    )
    op.create_index(
        "idx_tm_exact_fuzzy_ratio",
        "translation_memory",
        ["exact_matches", "fuzzy_matches"],
    )

    # Create unique constraint for translation memory
    op.create_unique_constraint(
        "uq_tm_source_target_org",
        "translation_memory",
        ["source_hash", "source_language", "target_language", "organization_id"],
    )

    # Create translations table
    op.create_table(
        "translations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_transcript_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_language_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_language_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "translation_memory_id", postgresql.UUID(as_uuid=True), nullable=True
        ),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("translated_text", sa.Text(), nullable=False),
        sa.Column(
            "alternative_translations",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("provider", translation_provider_enum, nullable=False),
        sa.Column("quality_level", translation_quality_enum, nullable=False),
        sa.Column("model_version", sa.String(length=50), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=True, default=0.0),
        sa.Column("quality_score", sa.Float(), nullable=True, default=0.0),
        sa.Column("fluency_score", sa.Float(), nullable=True, default=0.0),
        sa.Column("accuracy_score", sa.Float(), nullable=True, default=0.0),
        sa.Column(
            "cultural_adaptation_applied", sa.Boolean(), nullable=True, default=False
        ),
        sa.Column(
            "cultural_changes", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("formality_adjustment", sa.String(length=50), nullable=True),
        sa.Column("usage_count", sa.Integer(), nullable=True, default=0),
        sa.Column("user_feedback_score", sa.Float(), nullable=True),
        sa.Column("feedback_comments", sa.Text(), nullable=True),
        sa.Column("translation_time_ms", sa.Integer(), nullable=True),
        sa.Column("cache_hit", sa.Boolean(), nullable=True, default=False),
        sa.Column("cost", sa.Float(), nullable=True),
        sa.Column("is_approved", sa.Boolean(), nullable=True, default=False),
        sa.Column("is_human_reviewed", sa.Boolean(), nullable=True, default=False),
        sa.Column("version", sa.Integer(), nullable=True, default=1),
        sa.Column(
            "parent_translation_id", postgresql.UUID(as_uuid=True), nullable=True
        ),
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
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(
            ["source_transcript_id"],
            ["multilanguage_transcripts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["source_language_id"], ["languages.id"]),
        sa.ForeignKeyConstraint(["target_language_id"], ["languages.id"]),
        sa.ForeignKeyConstraint(["translation_memory_id"], ["translation_memory.id"]),
        sa.ForeignKeyConstraint(["parent_translation_id"], ["translations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for translations
    op.create_index(
        "idx_translations_languages",
        "translations",
        ["source_language_id", "target_language_id"],
    )
    op.create_index(
        "idx_translations_quality", "translations", ["quality_level", "quality_score"]
    )
    op.create_index(
        "idx_translations_provider_confidence",
        "translations",
        ["provider", "confidence_score"],
    )
    op.create_index(
        "idx_translations_real_time",
        "translations",
        ["provider", "translation_time_ms"],
    )

    # Add constraint to ensure different languages
    op.create_check_constraint(
        "check_different_languages",
        "translations",
        "source_language_id != target_language_id",
    )

    # Create language_detection_logs table
    op.create_table(
        "language_detection_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("transcript_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("detected_language", language_code_enum, nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column(
            "alternative_candidates",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("detection_algorithm", sa.String(length=50), nullable=False),
        sa.Column("model_version", sa.String(length=50), nullable=True),
        sa.Column("processing_time_ms", sa.Integer(), nullable=True),
        sa.Column("human_verified", sa.Boolean(), nullable=True, default=False),
        sa.Column("correct_language", language_code_enum, nullable=True),
        sa.Column("correction_reason", sa.String(length=200), nullable=True),
        sa.Column("text_length", sa.Integer(), nullable=True),
        sa.Column("audio_duration_seconds", sa.Float(), nullable=True),
        sa.Column("speaker_accent", sa.String(length=50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["transcript_id"], ["multilanguage_transcripts.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for language_detection_logs
    op.create_index(
        "idx_detection_log_algorithm_confidence",
        "language_detection_logs",
        ["detection_algorithm", "confidence_score"],
    )
    op.create_index(
        "idx_detection_log_language_verified",
        "language_detection_logs",
        ["detected_language", "human_verified"],
    )

    # Create cultural_context_rules table
    op.create_table(
        "cultural_context_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("source_culture", sa.String(length=50), nullable=True),
        sa.Column("target_culture", sa.String(length=50), nullable=True),
        sa.Column("language_pair", sa.String(length=10), nullable=True),
        sa.Column("meeting_type", sa.String(length=50), nullable=True),
        sa.Column(
            "participant_roles", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("business_context", cultural_context_enum, nullable=True),
        sa.Column("formality_adjustment", sa.String(length=50), nullable=True),
        sa.Column("directness_level", sa.String(length=50), nullable=True),
        sa.Column("hierarchy_awareness", sa.Boolean(), nullable=True, default=False),
        sa.Column(
            "trigger_patterns", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "replacement_patterns",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "example_transformations",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("effectiveness_score", sa.Float(), nullable=True, default=0.0),
        sa.Column("usage_count", sa.Integer(), nullable=True, default=0),
        sa.Column("user_feedback", sa.Float(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True, default=True),
        sa.Column("confidence_threshold", sa.Float(), nullable=True, default=0.7),
        sa.Column("created_by", sa.String(length=255), nullable=False),
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
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for cultural_context_rules
    op.create_index(
        "idx_cultural_rules_cultures",
        "cultural_context_rules",
        ["source_culture", "target_culture"],
    )
    op.create_index(
        "idx_cultural_rules_language_context",
        "cultural_context_rules",
        ["language_pair", "business_context"],
    )
    op.create_index(
        "idx_cultural_rules_active_effective",
        "cultural_context_rules",
        ["is_active", "effectiveness_score"],
    )

    # Create translation_quality_metrics table
    op.create_table(
        "translation_quality_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("translation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("metric_type", sa.String(length=50), nullable=False),
        sa.Column("metric_value", sa.Float(), nullable=False),
        sa.Column(
            "metric_details", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("baseline_type", sa.String(length=50), nullable=True),
        sa.Column("baseline_value", sa.Float(), nullable=True),
        sa.Column("improvement_score", sa.Float(), nullable=True),
        sa.Column("evaluator_type", sa.String(length=50), nullable=True),
        sa.Column("evaluator_id", sa.String(length=255), nullable=True),
        sa.Column(
            "evaluation_criteria",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("fluency_score", sa.Float(), nullable=True),
        sa.Column("adequacy_score", sa.Float(), nullable=True),
        sa.Column("cultural_score", sa.Float(), nullable=True),
        sa.Column("terminology_score", sa.Float(), nullable=True),
        sa.Column(
            "evaluated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["translation_id"], ["translations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for translation_quality_metrics
    op.create_index(
        "idx_quality_metrics_translation_type",
        "translation_quality_metrics",
        ["translation_id", "metric_type"],
    )
    op.create_index(
        "idx_quality_metrics_type_value",
        "translation_quality_metrics",
        ["metric_type", "metric_value"],
    )

    # Insert default language data
    op.execute(
        """
        INSERT INTO languages (id, code, name, native_name, script, direction, family, is_active, transcription_supported, translation_supported) VALUES
        (gen_random_uuid(), 'en', 'English', 'English', 'Latin', 'ltr', 'Germanic', true, true, true),
        (gen_random_uuid(), 'es', 'Spanish', 'Español', 'Latin', 'ltr', 'Romance', true, true, true),
        (gen_random_uuid(), 'fr', 'French', 'Français', 'Latin', 'ltr', 'Romance', true, true, true),
        (gen_random_uuid(), 'de', 'German', 'Deutsch', 'Latin', 'ltr', 'Germanic', true, true, true),
        (gen_random_uuid(), 'it', 'Italian', 'Italiano', 'Latin', 'ltr', 'Romance', true, true, true),
        (gen_random_uuid(), 'pt', 'Portuguese', 'Português', 'Latin', 'ltr', 'Romance', true, true, true),
        (gen_random_uuid(), 'ru', 'Russian', 'Русский', 'Cyrillic', 'ltr', 'Slavic', true, true, true),
        (gen_random_uuid(), 'zh', 'Chinese', '中文', 'Han', 'ltr', 'Sino-Tibetan', true, true, true),
        (gen_random_uuid(), 'ja', 'Japanese', '日本語', 'Mixed', 'ltr', 'Japonic', true, true, true),
        (gen_random_uuid(), 'ko', 'Korean', '한국어', 'Hangul', 'ltr', 'Koreanic', true, true, true),
        (gen_random_uuid(), 'ar', 'Arabic', 'العربية', 'Arabic', 'rtl', 'Semitic', true, true, true),
        (gen_random_uuid(), 'hi', 'Hindi', 'हिन्दी', 'Devanagari', 'ltr', 'Indo-Aryan', true, true, true)
    """
    )


def downgrade():
    # Drop tables in reverse order
    op.drop_table("translation_quality_metrics")
    op.drop_table("cultural_context_rules")
    op.drop_table("language_detection_logs")
    op.drop_table("translations")
    op.drop_table("translation_memory")
    op.drop_table("multilanguage_transcripts")
    op.drop_table("languages")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS culturalcontext")
    op.execute("DROP TYPE IF EXISTS translationquality")
    op.execute("DROP TYPE IF EXISTS translationprovider")
    op.execute("DROP TYPE IF EXISTS languagecode")
