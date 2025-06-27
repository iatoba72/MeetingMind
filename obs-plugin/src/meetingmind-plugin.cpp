/*
MeetingMind OBS Plugin
Enhanced integration between OBS Studio and MeetingMind
Provides automatic scene switching, audio management, and meeting-aware features
*/

#include <obs-module.h>
#include <obs-frontend-api.h>
#include <obs.hpp>
#include <util/config-file.h>
#include <util/platform.h>
#include <QApplication>
#include <QMainWindow>
#include <QWidget>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QPushButton>
#include <QLineEdit>
#include <QSpinBox>
#include <QCheckBox>
#include <QComboBox>
#include <QGroupBox>
#include <QTextEdit>
#include <QTimer>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkRequest>
#include <QNetworkReply>
#include <QWebSocket>
#include <QUrl>
#include <memory>

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("meetingmind-plugin", "en-US")

MODULE_EXPORT const char *obs_module_description(void)
{
    return "MeetingMind Integration Plugin";
}

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

// Global plugin instance
static meetingmind_config *plugin_config = nullptr;
static QWebSocket *websocket = nullptr;
static QNetworkAccessManager *network_manager = nullptr;
static QTimer *status_timer = nullptr;

// Scene mapping for different meeting states
static const char *SCENE_WELCOME = "Meeting - Welcome";
static const char *SCENE_PRESENTATION = "Meeting - Presentation";
static const char *SCENE_DISCUSSION = "Meeting - Discussion";
static const char *SCENE_SCREEN_SHARE = "Meeting - Screen Share";
static const char *SCENE_BREAK = "Meeting - Break";
static const char *SCENE_ENDING = "Meeting - Ending";

// Audio source names
static const char *AUDIO_MICROPHONE = "Microphone";
static const char *AUDIO_DESKTOP = "Desktop Audio";
static const char *AUDIO_MEETING = "Meeting Audio";

// Forward declarations
class MeetingMindWidget;
static void load_config();
static void save_config();
static void connect_to_server();
static void disconnect_from_server();
static void handle_meeting_event(const QString &event_type, const QJsonObject &data);
static void switch_to_scene(const char *scene_name);
static void set_source_visibility(const char *source_name, bool visible);
static void set_source_mute(const char *source_name, bool muted);
static void start_recording();
static void stop_recording();

// Main plugin widget class
class MeetingMindWidget : public QWidget
{
    Q_OBJECT

public:
    explicit MeetingMindWidget(QWidget *parent = nullptr);
    ~MeetingMindWidget();

private slots:
    void on_connect_clicked();
    void on_disconnect_clicked();
    void on_config_changed();
    void on_test_connection_clicked();
    void on_websocket_connected();
    void on_websocket_disconnected();
    void on_websocket_message(const QString &message);
    void on_status_update();

private:
    void setup_ui();
    void update_connection_status();
    void log_message(const QString &message);

    // UI Elements
    QVBoxLayout *main_layout;
    QGroupBox *connection_group;
    QGroupBox *settings_group;
    QGroupBox *status_group;
    QGroupBox *logs_group;

    QLineEdit *server_url_edit;
    QSpinBox *server_port_spin;
    QLineEdit *api_key_edit;
    QLineEdit *meeting_id_edit;

    QCheckBox *auto_scene_switching_check;
    QCheckBox *auto_recording_check;
    QCheckBox *audio_management_check;
    QCheckBox *meeting_notifications_check;

    QPushButton *connect_button;
    QPushButton *disconnect_button;
    QPushButton *test_button;

    QLabel *connection_status_label;
    QLabel *meeting_status_label;
    QLabel *recording_status_label;

    QTextEdit *log_text;
};

MeetingMindWidget::MeetingMindWidget(QWidget *parent)
    : QWidget(parent)
{
    setWindowTitle("MeetingMind Integration");
    setMinimumSize(500, 600);
    
    setup_ui();
    
    // Load configuration
    load_config();
    
    // Update UI with loaded config
    if (plugin_config) {
        server_url_edit->setText(plugin_config->server_url ? plugin_config->server_url : "localhost");
        server_port_spin->setValue(plugin_config->server_port);
        api_key_edit->setText(plugin_config->api_key ? plugin_config->api_key : "");
        meeting_id_edit->setText(plugin_config->meeting_id ? plugin_config->meeting_id : "");
        
        auto_scene_switching_check->setChecked(plugin_config->auto_scene_switching);
        auto_recording_check->setChecked(plugin_config->auto_recording);
        audio_management_check->setChecked(plugin_config->audio_management);
        meeting_notifications_check->setChecked(plugin_config->meeting_notifications);
    }
    
    // Setup status timer
    status_timer = new QTimer(this);
    connect(status_timer, &QTimer::timeout, this, &MeetingMindWidget::on_status_update);
    status_timer->start(5000); // Update every 5 seconds
    
    update_connection_status();
}

MeetingMindWidget::~MeetingMindWidget()
{
    if (websocket) {
        websocket->close();
        delete websocket;
        websocket = nullptr;
    }
}

void MeetingMindWidget::setup_ui()
{
    main_layout = new QVBoxLayout(this);
    
    // Connection settings group
    connection_group = new QGroupBox("Connection Settings");
    QGridLayout *conn_layout = new QGridLayout(connection_group);
    
    conn_layout->addWidget(new QLabel("Server URL:"), 0, 0);
    server_url_edit = new QLineEdit();
    conn_layout->addWidget(server_url_edit, 0, 1);
    
    conn_layout->addWidget(new QLabel("Port:"), 1, 0);
    server_port_spin = new QSpinBox();
    server_port_spin->setRange(1, 65535);
    server_port_spin->setValue(8080);
    conn_layout->addWidget(server_port_spin, 1, 1);
    
    conn_layout->addWidget(new QLabel("API Key:"), 2, 0);
    api_key_edit = new QLineEdit();
    api_key_edit->setEchoMode(QLineEdit::Password);
    conn_layout->addWidget(api_key_edit, 2, 1);
    
    conn_layout->addWidget(new QLabel("Meeting ID:"), 3, 0);
    meeting_id_edit = new QLineEdit();
    conn_layout->addWidget(meeting_id_edit, 3, 1);
    
    QHBoxLayout *button_layout = new QHBoxLayout();
    connect_button = new QPushButton("Connect");
    disconnect_button = new QPushButton("Disconnect");
    test_button = new QPushButton("Test Connection");
    
    button_layout->addWidget(connect_button);
    button_layout->addWidget(disconnect_button);
    button_layout->addWidget(test_button);
    
    conn_layout->addLayout(button_layout, 4, 0, 1, 2);
    
    // Feature settings group
    settings_group = new QGroupBox("Feature Settings");
    QVBoxLayout *settings_layout = new QVBoxLayout(settings_group);
    
    auto_scene_switching_check = new QCheckBox("Automatic Scene Switching");
    auto_recording_check = new QCheckBox("Automatic Recording Control");
    audio_management_check = new QCheckBox("Audio Source Management");
    meeting_notifications_check = new QCheckBox("Meeting Status Notifications");
    
    settings_layout->addWidget(auto_scene_switching_check);
    settings_layout->addWidget(auto_recording_check);
    settings_layout->addWidget(audio_management_check);
    settings_layout->addWidget(meeting_notifications_check);
    
    // Status group
    status_group = new QGroupBox("Status");
    QGridLayout *status_layout = new QGridLayout(status_group);
    
    status_layout->addWidget(new QLabel("Connection:"), 0, 0);
    connection_status_label = new QLabel("Disconnected");
    status_layout->addWidget(connection_status_label, 0, 1);
    
    status_layout->addWidget(new QLabel("Meeting:"), 1, 0);
    meeting_status_label = new QLabel("No active meeting");
    status_layout->addWidget(meeting_status_label, 1, 1);
    
    status_layout->addWidget(new QLabel("Recording:"), 2, 0);
    recording_status_label = new QLabel("Not recording");
    status_layout->addWidget(recording_status_label, 2, 1);
    
    // Logs group
    logs_group = new QGroupBox("Activity Log");
    QVBoxLayout *logs_layout = new QVBoxLayout(logs_group);
    
    log_text = new QTextEdit();
    log_text->setMaximumHeight(150);
    log_text->setReadOnly(true);
    logs_layout->addWidget(log_text);
    
    // Add all groups to main layout
    main_layout->addWidget(connection_group);
    main_layout->addWidget(settings_group);
    main_layout->addWidget(status_group);
    main_layout->addWidget(logs_group);
    
    // Connect signals
    connect(connect_button, &QPushButton::clicked, this, &MeetingMindWidget::on_connect_clicked);
    connect(disconnect_button, &QPushButton::clicked, this, &MeetingMindWidget::on_disconnect_clicked);
    connect(test_button, &QPushButton::clicked, this, &MeetingMindWidget::on_test_connection_clicked);
    
    connect(server_url_edit, &QLineEdit::textChanged, this, &MeetingMindWidget::on_config_changed);
    connect(server_port_spin, QOverload<int>::of(&QSpinBox::valueChanged), this, &MeetingMindWidget::on_config_changed);
    connect(api_key_edit, &QLineEdit::textChanged, this, &MeetingMindWidget::on_config_changed);
    connect(meeting_id_edit, &QLineEdit::textChanged, this, &MeetingMindWidget::on_config_changed);
    
    connect(auto_scene_switching_check, &QCheckBox::toggled, this, &MeetingMindWidget::on_config_changed);
    connect(auto_recording_check, &QCheckBox::toggled, this, &MeetingMindWidget::on_config_changed);
    connect(audio_management_check, &QCheckBox::toggled, this, &MeetingMindWidget::on_config_changed);
    connect(meeting_notifications_check, &QCheckBox::toggled, this, &MeetingMindWidget::on_config_changed);
}

void MeetingMindWidget::on_connect_clicked()
{
    connect_to_server();
}

void MeetingMindWidget::on_disconnect_clicked()
{
    disconnect_from_server();
}

void MeetingMindWidget::on_config_changed()
{
    if (!plugin_config) return;
    
    // Update configuration
    if (plugin_config->server_url) bfree(plugin_config->server_url);
    plugin_config->server_url = bstrdup(server_url_edit->text().toUtf8().constData());
    
    plugin_config->server_port = server_port_spin->value();
    
    if (plugin_config->api_key) bfree(plugin_config->api_key);
    plugin_config->api_key = bstrdup(api_key_edit->text().toUtf8().constData());
    
    if (plugin_config->meeting_id) bfree(plugin_config->meeting_id);
    plugin_config->meeting_id = bstrdup(meeting_id_edit->text().toUtf8().constData());
    
    plugin_config->auto_scene_switching = auto_scene_switching_check->isChecked();
    plugin_config->auto_recording = auto_recording_check->isChecked();
    plugin_config->audio_management = audio_management_check->isChecked();
    plugin_config->meeting_notifications = meeting_notifications_check->isChecked();
    
    save_config();
}

void MeetingMindWidget::on_test_connection_clicked()
{
    log_message("Testing connection to MeetingMind server...");
    
    if (!network_manager) {
        network_manager = new QNetworkAccessManager(this);
    }
    
    QString url = QString("http://%1:%2/api/health")
                  .arg(server_url_edit->text())
                  .arg(server_port_spin->value());
    
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    
    if (!api_key_edit->text().isEmpty()) {
        request.setRawHeader("Authorization", QString("Bearer %1").arg(api_key_edit->text()).toUtf8());
    }
    
    QNetworkReply *reply = network_manager->get(request);
    
    connect(reply, &QNetworkReply::finished, [this, reply]() {
        if (reply->error() == QNetworkReply::NoError) {
            QJsonDocument doc = QJsonDocument::fromJson(reply->readAll());
            QJsonObject obj = doc.object();
            
            if (obj["status"].toString() == "healthy") {
                log_message("✓ Connection test successful!");
            } else {
                log_message("⚠ Server responded but reported unhealthy status");
            }
        } else {
            log_message(QString("✗ Connection test failed: %1").arg(reply->errorString()));
        }
        reply->deleteLater();
    });
}

void MeetingMindWidget::on_websocket_connected()
{
    if (plugin_config) {
        plugin_config->connected = true;
    }
    
    log_message("✓ Connected to MeetingMind WebSocket");
    update_connection_status();
    
    // Subscribe to meeting events
    if (!meeting_id_edit->text().isEmpty()) {
        QJsonObject subscribe_msg;
        subscribe_msg["type"] = "subscribe";
        subscribe_msg["meeting_id"] = meeting_id_edit->text();
        
        QJsonDocument doc(subscribe_msg);
        websocket->sendTextMessage(doc.toJson());
        
        log_message(QString("Subscribed to meeting: %1").arg(meeting_id_edit->text()));
    }
}

void MeetingMindWidget::on_websocket_disconnected()
{
    if (plugin_config) {
        plugin_config->connected = false;
    }
    
    log_message("✗ Disconnected from MeetingMind WebSocket");
    update_connection_status();
}

void MeetingMindWidget::on_websocket_message(const QString &message)
{
    QJsonDocument doc = QJsonDocument::fromJson(message.toUtf8());
    QJsonObject obj = doc.object();
    
    QString event_type = obj["type"].toString();
    QJsonObject event_data = obj["data"].toObject();
    
    log_message(QString("Received event: %1").arg(event_type));
    
    handle_meeting_event(event_type, event_data);
}

void MeetingMindWidget::on_status_update()
{
    // Update recording status
    bool recording = obs_frontend_recording_active();
    recording_status_label->setText(recording ? "Recording" : "Not recording");
    
    // Update meeting status (placeholder)
    if (plugin_config && plugin_config->connected) {
        meeting_status_label->setText("Connected to meeting");
    } else {
        meeting_status_label->setText("No active meeting");
    }
}

void MeetingMindWidget::update_connection_status()
{
    if (plugin_config && plugin_config->connected) {
        connection_status_label->setText("Connected");
        connection_status_label->setStyleSheet("color: green;");
        connect_button->setEnabled(false);
        disconnect_button->setEnabled(true);
    } else {
        connection_status_label->setText("Disconnected");
        connection_status_label->setStyleSheet("color: red;");
        connect_button->setEnabled(true);
        disconnect_button->setEnabled(false);
    }
}

void MeetingMindWidget::log_message(const QString &message)
{
    QString timestamp = QDateTime::currentDateTime().toString("hh:mm:ss");
    QString log_entry = QString("[%1] %2").arg(timestamp, message);
    
    log_text->append(log_entry);
    
    // Keep only last 100 lines
    QTextDocument *doc = log_text->document();
    if (doc->blockCount() > 100) {
        QTextCursor cursor(doc);
        cursor.movePosition(QTextCursor::Start);
        cursor.movePosition(QTextCursor::Down, QTextCursor::KeepAnchor, doc->blockCount() - 100);
        cursor.removeSelectedText();
    }
    
    // Scroll to bottom
    QTextCursor cursor = log_text->textCursor();
    cursor.movePosition(QTextCursor::End);
    log_text->setTextCursor(cursor);
}

// Plugin implementation functions

static void load_config()
{
    if (!plugin_config) {
        plugin_config = (meetingmind_config*)bzalloc(sizeof(meetingmind_config));
    }
    
    char *config_path = obs_module_config_path("meetingmind.ini");
    config_t *config = config_create(config_path);
    bfree(config_path);
    
    if (config_open(config, CONFIG_OPEN_EXISTING) == CONFIG_SUCCESS) {
        plugin_config->server_url = bstrdup(config_get_string(config, "connection", "server_url"));
        plugin_config->server_port = (int)config_get_int(config, "connection", "server_port");
        plugin_config->api_key = bstrdup(config_get_string(config, "connection", "api_key"));
        plugin_config->meeting_id = bstrdup(config_get_string(config, "connection", "meeting_id"));
        
        plugin_config->auto_scene_switching = config_get_bool(config, "features", "auto_scene_switching");
        plugin_config->auto_recording = config_get_bool(config, "features", "auto_recording");
        plugin_config->audio_management = config_get_bool(config, "features", "audio_management");
        plugin_config->meeting_notifications = config_get_bool(config, "features", "meeting_notifications");
        
        plugin_config->connection_timeout = (int)config_get_int(config, "advanced", "connection_timeout");
    } else {
        // Set defaults
        plugin_config->server_url = bstrdup("localhost");
        plugin_config->server_port = 8080;
        plugin_config->api_key = bstrdup("");
        plugin_config->meeting_id = bstrdup("");
        plugin_config->auto_scene_switching = true;
        plugin_config->auto_recording = true;
        plugin_config->audio_management = true;
        plugin_config->meeting_notifications = true;
        plugin_config->connection_timeout = 10;
    }
    
    plugin_config->connected = false;
    
    config_close(config);
}

static void save_config()
{
    if (!plugin_config) return;
    
    char *config_path = obs_module_config_path("meetingmind.ini");
    config_t *config = config_create(config_path);
    bfree(config_path);
    
    config_set_string(config, "connection", "server_url", plugin_config->server_url);
    config_set_int(config, "connection", "server_port", plugin_config->server_port);
    config_set_string(config, "connection", "api_key", plugin_config->api_key);
    config_set_string(config, "connection", "meeting_id", plugin_config->meeting_id);
    
    config_set_bool(config, "features", "auto_scene_switching", plugin_config->auto_scene_switching);
    config_set_bool(config, "features", "auto_recording", plugin_config->auto_recording);
    config_set_bool(config, "features", "audio_management", plugin_config->audio_management);
    config_set_bool(config, "features", "meeting_notifications", plugin_config->meeting_notifications);
    
    config_set_int(config, "advanced", "connection_timeout", plugin_config->connection_timeout);
    
    config_save(config);
    config_close(config);
}

static void connect_to_server()
{
    if (!plugin_config) return;
    
    if (websocket) {
        websocket->close();
        delete websocket;
    }
    
    QString url = QString("ws://%1:%2/ws")
                  .arg(plugin_config->server_url)
                  .arg(plugin_config->server_port);
    
    websocket = new QWebSocket();
    
    // Set headers
    QNetworkRequest request(url);
    if (plugin_config->api_key && strlen(plugin_config->api_key) > 0) {
        request.setRawHeader("Authorization", QString("Bearer %1").arg(plugin_config->api_key).toUtf8());
    }
    
    websocket->open(request);
}

static void disconnect_from_server()
{
    if (websocket) {
        websocket->close();
    }
}

static void handle_meeting_event(const QString &event_type, const QJsonObject &data)
{
    if (!plugin_config) return;
    
    if (event_type == "meeting_started") {
        if (plugin_config->auto_scene_switching) {
            switch_to_scene(SCENE_WELCOME);
        }
        if (plugin_config->auto_recording) {
            start_recording();
        }
        if (plugin_config->audio_management) {
            set_source_mute(AUDIO_MICROPHONE, false);
        }
    }
    else if (event_type == "meeting_ended") {
        if (plugin_config->auto_scene_switching) {
            switch_to_scene(SCENE_ENDING);
        }
        if (plugin_config->auto_recording) {
            stop_recording();
        }
    }
    else if (event_type == "presentation_started") {
        if (plugin_config->auto_scene_switching) {
            switch_to_scene(SCENE_PRESENTATION);
        }
    }
    else if (event_type == "screen_share_started") {
        if (plugin_config->auto_scene_switching) {
            switch_to_scene(SCENE_SCREEN_SHARE);
        }
        if (plugin_config->audio_management) {
            set_source_mute(AUDIO_DESKTOP, false);
        }
    }
    else if (event_type == "screen_share_ended") {
        if (plugin_config->auto_scene_switching) {
            switch_to_scene(SCENE_DISCUSSION);
        }
    }
    else if (event_type == "break_started") {
        if (plugin_config->auto_scene_switching) {
            switch_to_scene(SCENE_BREAK);
        }
        if (plugin_config->audio_management) {
            set_source_mute(AUDIO_MICROPHONE, true);
        }
    }
    else if (event_type == "break_ended") {
        if (plugin_config->auto_scene_switching) {
            switch_to_scene(SCENE_DISCUSSION);
        }
        if (plugin_config->audio_management) {
            set_source_mute(AUDIO_MICROPHONE, false);
        }
    }
}

static void switch_to_scene(const char *scene_name)
{
    obs_source_t *scene = obs_get_source_by_name(scene_name);
    if (scene) {
        obs_frontend_set_current_scene(scene);
        obs_source_release(scene);
        
        blog(LOG_INFO, "MeetingMind: Switched to scene '%s'", scene_name);
    } else {
        blog(LOG_WARNING, "MeetingMind: Scene '%s' not found", scene_name);
    }
}

static void set_source_visibility(const char *source_name, bool visible)
{
    obs_source_t *source = obs_get_source_by_name(source_name);
    if (source) {
        obs_source_set_enabled(source, visible);
        obs_source_release(source);
        
        blog(LOG_INFO, "MeetingMind: Set source '%s' visibility to %s", 
             source_name, visible ? "visible" : "hidden");
    }
}

static void set_source_mute(const char *source_name, bool muted)
{
    obs_source_t *source = obs_get_source_by_name(source_name);
    if (source) {
        obs_source_set_muted(source, muted);
        obs_source_release(source);
        
        blog(LOG_INFO, "MeetingMind: Set source '%s' mute to %s", 
             source_name, muted ? "muted" : "unmuted");
    }
}

static void start_recording()
{
    if (!obs_frontend_recording_active()) {
        obs_frontend_recording_start();
        blog(LOG_INFO, "MeetingMind: Started recording");
    }
}

static void stop_recording()
{
    if (obs_frontend_recording_active()) {
        obs_frontend_recording_stop();
        blog(LOG_INFO, "MeetingMind: Stopped recording");
    }
}

// Plugin dock registration
static MeetingMindWidget *dock_widget = nullptr;

static void register_dock()
{
    dock_widget = new MeetingMindWidget();
    
    obs_frontend_add_dock_by_id("meetingmind_dock", "MeetingMind", dock_widget);
}

static void unregister_dock()
{
    if (dock_widget) {
        obs_frontend_remove_dock("meetingmind_dock");
        delete dock_widget;
        dock_widget = nullptr;
    }
}

// Module lifecycle functions
bool obs_module_load(void)
{
    blog(LOG_INFO, "MeetingMind plugin loaded (version 1.0.0)");
    
    load_config();
    register_dock();
    
    return true;
}

void obs_module_unload(void)
{
    blog(LOG_INFO, "MeetingMind plugin unloaded");
    
    disconnect_from_server();
    unregister_dock();
    
    if (plugin_config) {
        if (plugin_config->server_url) bfree(plugin_config->server_url);
        if (plugin_config->api_key) bfree(plugin_config->api_key);
        if (plugin_config->meeting_id) bfree(plugin_config->meeting_id);
        bfree(plugin_config);
        plugin_config = nullptr;
    }
    
    if (websocket) {
        delete websocket;
        websocket = nullptr;
    }
    
    if (network_manager) {
        delete network_manager;
        network_manager = nullptr;
    }
}

#include "meetingmind-plugin.moc"