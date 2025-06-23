/*
MeetingMind OBS Plugin Header
Defines interfaces and structures for the MeetingMind OBS integration
*/

#pragma once

#include <obs-module.h>
#include <obs-frontend-api.h>
#include <QWidget>
#include <QWebSocket>
#include <QNetworkAccessManager>
#include <QTimer>
#include <QJsonObject>

class QVBoxLayout;
class QHBoxLayout;
class QGridLayout;
class QGroupBox;
class QLabel;
class QPushButton;
class QLineEdit;
class QSpinBox;
class QCheckBox;
class QComboBox;
class QTextEdit;

// Plugin version information
#define MEETINGMIND_PLUGIN_VERSION_MAJOR 1
#define MEETINGMIND_PLUGIN_VERSION_MINOR 0
#define MEETINGMIND_PLUGIN_VERSION_PATCH 0
#define MEETINGMIND_PLUGIN_VERSION_STRING "1.0.0"

// Plugin configuration structure
struct meetingmind_config {
    char *server_url;
    int server_port;
    char *api_key;
    bool auto_scene_switching;
    bool auto_recording;
    bool audio_management;
    bool meeting_notifications;
    int connection_timeout;
    char *meeting_id;
    bool connected;
};

// Scene names for automatic switching
extern const char *SCENE_WELCOME;
extern const char *SCENE_PRESENTATION;
extern const char *SCENE_DISCUSSION;
extern const char *SCENE_SCREEN_SHARE;
extern const char *SCENE_BREAK;
extern const char *SCENE_ENDING;

// Audio source names
extern const char *AUDIO_MICROPHONE;
extern const char *AUDIO_DESKTOP;
extern const char *AUDIO_MEETING;

// Main plugin widget class
class MeetingMindWidget : public QWidget
{
    Q_OBJECT

public:
    explicit MeetingMindWidget(QWidget *parent = nullptr);
    ~MeetingMindWidget();

    // Public interface methods
    void connect_to_meeting(const QString &meeting_id);
    void disconnect_from_meeting();
    bool is_connected() const;
    void update_meeting_status(const QString &status);

private slots:
    void on_connect_clicked();
    void on_disconnect_clicked();
    void on_config_changed();
    void on_test_connection_clicked();
    void on_websocket_connected();
    void on_websocket_disconnected();
    void on_websocket_message(const QString &message);
    void on_status_update();
    void on_network_reply_finished();

private:
    void setup_ui();
    void setup_connections();
    void update_connection_status();
    void log_message(const QString &message);
    void load_ui_from_config();
    void save_config_from_ui();
    bool validate_connection_settings();
    void send_websocket_message(const QJsonObject &message);

    // UI layout methods
    void create_connection_group();
    void create_settings_group();
    void create_status_group();
    void create_logs_group();
    void create_button_layout();

    // Configuration methods
    void apply_default_config();
    void validate_config();

    // UI Elements
    QVBoxLayout *main_layout;
    QGroupBox *connection_group;
    QGroupBox *settings_group;
    QGroupBox *status_group;
    QGroupBox *logs_group;

    // Connection settings
    QLineEdit *server_url_edit;
    QSpinBox *server_port_spin;
    QLineEdit *api_key_edit;
    QLineEdit *meeting_id_edit;
    QSpinBox *timeout_spin;

    // Feature settings
    QCheckBox *auto_scene_switching_check;
    QCheckBox *auto_recording_check;
    QCheckBox *audio_management_check;
    QCheckBox *meeting_notifications_check;
    QCheckBox *auto_start_streaming_check;
    QCheckBox *auto_stop_streaming_check;

    // Control buttons
    QPushButton *connect_button;
    QPushButton *disconnect_button;
    QPushButton *test_button;
    QPushButton *save_config_button;
    QPushButton *reset_config_button;

    // Status labels
    QLabel *connection_status_label;
    QLabel *meeting_status_label;
    QLabel *recording_status_label;
    QLabel *streaming_status_label;
    QLabel *last_event_label;

    // Log display
    QTextEdit *log_text;

    // Network and connection objects
    QWebSocket *websocket;
    QNetworkAccessManager *network_manager;
    QTimer *status_timer;
    QTimer *reconnect_timer;

    // State tracking
    bool is_connecting;
    bool auto_reconnect_enabled;
    int reconnect_attempts;
    int max_reconnect_attempts;
    QString current_meeting_id;
    QString last_error_message;
};

// Utility functions
namespace MeetingMindUtils {
    bool scene_exists(const char *scene_name);
    bool source_exists(const char *source_name);
    void switch_to_scene_safe(const char *scene_name);
    void set_source_mute_safe(const char *source_name, bool muted);
    void set_source_visibility_safe(const char *source_name, bool visible);
    void start_recording_safe();
    void stop_recording_safe();
    void start_streaming_safe();
    void stop_streaming_safe();
    QString get_obs_version();
    QString get_current_scene_name();
    QStringList get_available_scenes();
    QStringList get_available_sources();
    bool is_recording_active();
    bool is_streaming_active();
}

// Event handler functions
namespace MeetingMindEvents {
    void handle_meeting_started(const QJsonObject &data);
    void handle_meeting_ended(const QJsonObject &data);
    void handle_participant_joined(const QJsonObject &data);
    void handle_participant_left(const QJsonObject &data);
    void handle_screen_share_started(const QJsonObject &data);
    void handle_screen_share_ended(const QJsonObject &data);
    void handle_presentation_started(const QJsonObject &data);
    void handle_presentation_ended(const QJsonObject &data);
    void handle_break_started(const QJsonObject &data);
    void handle_break_ended(const QJsonObject &data);
    void handle_recording_requested(const QJsonObject &data);
    void handle_recording_stopped(const QJsonObject &data);
    void handle_streaming_requested(const QJsonObject &data);
    void handle_streaming_stopped(const QJsonObject &data);
    void handle_audio_mute_requested(const QJsonObject &data);
    void handle_audio_unmute_requested(const QJsonObject &data);
    void handle_scene_change_requested(const QJsonObject &data);
}

// Configuration management
namespace MeetingMindConfig {
    bool load_config(meetingmind_config *config);
    bool save_config(const meetingmind_config *config);
    void apply_default_config(meetingmind_config *config);
    bool validate_config(const meetingmind_config *config);
    QString get_config_file_path();
    void migrate_config_if_needed();
}

// Global plugin state
extern meetingmind_config *g_plugin_config;
extern MeetingMindWidget *g_dock_widget;
extern bool g_plugin_initialized;