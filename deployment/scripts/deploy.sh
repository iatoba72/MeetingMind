#!/bin/bash

# MeetingMind One-Click Deployment Script
# Supports Docker, Docker Compose, and Kubernetes deployments

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOYMENT_DIR="$PROJECT_ROOT/deployment"

# Default values
DEPLOYMENT_TYPE="docker-compose"
ENVIRONMENT="production"
DOMAIN=""
EMAIL=""
SSL_ENABLED=false
MONITORING_ENABLED=false
BACKUP_ENABLED=false
UPDATE_SYSTEM=false
FORCE_RECREATE=false

# Configuration file
CONFIG_FILE="$DEPLOYMENT_DIR/config/deployment.conf"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    cat << EOF
MeetingMind Deployment Script

Usage: $0 [OPTIONS]

OPTIONS:
    -t, --type TYPE         Deployment type: docker-compose, kubernetes, standalone (default: docker-compose)
    -e, --env ENV          Environment: development, staging, production (default: production)
    -d, --domain DOMAIN    Domain name for the application
    -m, --email EMAIL      Email for SSL certificate registration
    -s, --ssl             Enable SSL/HTTPS
    -M, --monitoring      Enable monitoring stack (Prometheus/Grafana)
    -b, --backup          Enable automated backups
    -u, --update-system   Update system packages before deployment
    -f, --force           Force recreate containers/pods
    -c, --config FILE     Custom configuration file
    -h, --help            Show this help message

EXAMPLES:
    # Basic production deployment
    $0 --env production --domain meetingmind.example.com --ssl --email admin@example.com

    # Development deployment
    $0 --env development

    # Production with monitoring
    $0 --env production --domain meetingmind.example.com --ssl --monitoring

    # Kubernetes deployment
    $0 --type kubernetes --env production --domain meetingmind.example.com

EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--type)
                DEPLOYMENT_TYPE="$2"
                shift 2
                ;;
            -e|--env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -d|--domain)
                DOMAIN="$2"
                shift 2
                ;;
            -m|--email)
                EMAIL="$2"
                shift 2
                ;;
            -s|--ssl)
                SSL_ENABLED=true
                shift
                ;;
            -M|--monitoring)
                MONITORING_ENABLED=true
                shift
                ;;
            -b|--backup)
                BACKUP_ENABLED=true
                shift
                ;;
            -u|--update-system)
                UPDATE_SYSTEM=true
                shift
                ;;
            -f|--force)
                FORCE_RECREATE=true
                shift
                ;;
            -c|--config)
                CONFIG_FILE="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if running as root for system updates
    if [[ $UPDATE_SYSTEM == true && $EUID -ne 0 ]]; then
        log_error "System update requires root privileges. Run with sudo or disable --update-system"
        exit 1
    fi

    # Check required tools based on deployment type
    case $DEPLOYMENT_TYPE in
        docker-compose)
            command -v docker >/dev/null 2>&1 || { log_error "Docker is required but not installed. Visit https://docs.docker.com/get-docker/"; exit 1; }
            command -v docker-compose >/dev/null 2>&1 || { log_error "Docker Compose is required but not installed. Visit https://docs.docker.com/compose/install/"; exit 1; }
            ;;
        kubernetes)
            command -v kubectl >/dev/null 2>&1 || { log_error "kubectl is required but not installed"; exit 1; }
            command -v helm >/dev/null 2>&1 || { log_error "Helm is required but not installed"; exit 1; }
            ;;
        standalone)
            command -v node >/dev/null 2>&1 || { log_error "Node.js is required but not installed"; exit 1; }
            command -v python3 >/dev/null 2>&1 || { log_error "Python 3 is required but not installed"; exit 1; }
            ;;
    esac

    # Check for SSL requirements
    if [[ $SSL_ENABLED == true ]]; then
        if [[ -z "$DOMAIN" ]]; then
            log_error "Domain is required for SSL setup"
            exit 1
        fi
        if [[ -z "$EMAIL" ]]; then
            log_error "Email is required for SSL certificate registration"
            exit 1
        fi
        command -v certbot >/dev/null 2>&1 || { log_warning "Certbot not found. Will attempt to install."; }
    fi

    log_success "Prerequisites check completed"
}

update_system() {
    if [[ $UPDATE_SYSTEM == true ]]; then
        log_info "Updating system packages..."
        
        if command -v apt-get >/dev/null 2>&1; then
            apt-get update && apt-get upgrade -y
        elif command -v yum >/dev/null 2>&1; then
            yum update -y
        elif command -v dnf >/dev/null 2>&1; then
            dnf update -y
        elif command -v pacman >/dev/null 2>&1; then
            pacman -Syu --noconfirm
        else
            log_warning "Unknown package manager. Skipping system update."
        fi
        
        log_success "System packages updated"
    fi
}

generate_secrets() {
    log_info "Generating secure secrets..."
    
    local secrets_dir="$DEPLOYMENT_DIR/secrets"
    mkdir -p "$secrets_dir"

    # Generate random secrets if they don't exist
    if [[ ! -f "$secrets_dir/db_password.txt" ]]; then
        openssl rand -base64 32 > "$secrets_dir/db_password.txt"
    fi

    if [[ ! -f "$secrets_dir/redis_password.txt" ]]; then
        openssl rand -base64 32 > "$secrets_dir/redis_password.txt"
    fi

    if [[ ! -f "$secrets_dir/secret_key.txt" ]]; then
        openssl rand -base64 64 > "$secrets_dir/secret_key.txt"
    fi

    if [[ ! -f "$secrets_dir/jwt_secret.txt" ]]; then
        openssl rand -base64 64 > "$secrets_dir/jwt_secret.txt"
    fi

    if [[ ! -f "$secrets_dir/encryption_key.txt" ]]; then
        openssl rand -base64 64 > "$secrets_dir/encryption_key.txt"
    fi

    # Set secure permissions
    chmod 600 "$secrets_dir"/*
    
    log_success "Secrets generated"
}

setup_ssl() {
    if [[ $SSL_ENABLED == true ]]; then
        log_info "Setting up SSL certificates..."
        
        local ssl_dir="$DEPLOYMENT_DIR/ssl"
        mkdir -p "$ssl_dir"

        # Install certbot if not present
        if ! command -v certbot >/dev/null 2>&1; then
            if command -v apt-get >/dev/null 2>&1; then
                apt-get update && apt-get install -y certbot
            elif command -v yum >/dev/null 2>&1; then
                yum install -y certbot
            elif command -v dnf >/dev/null 2>&1; then
                dnf install -y certbot
            else
                log_error "Cannot install certbot automatically. Please install manually."
                exit 1
            fi
        fi

        # Generate SSL certificate
        if [[ ! -f "$ssl_dir/fullchain.pem" ]]; then
            certbot certonly --standalone \
                --email "$EMAIL" \
                --agree-tos \
                --non-interactive \
                --domain "$DOMAIN"
            
            # Copy certificates to deployment directory
            cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$ssl_dir/"
            cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$ssl_dir/"
        fi

        log_success "SSL certificates configured"
    fi
}

create_environment_file() {
    log_info "Creating environment configuration..."
    
    local env_file="$PROJECT_ROOT/.env"
    
    cat > "$env_file" << EOF
# MeetingMind Environment Configuration
# Generated by deployment script on $(date)

# Environment
NODE_ENV=$ENVIRONMENT
DEPLOYMENT_TYPE=$DEPLOYMENT_TYPE

# Database
DB_NAME=meetingmind
DB_USER=meetingmind
DB_PASSWORD=$(cat "$DEPLOYMENT_DIR/secrets/db_password.txt")
DB_PORT=5432

# Redis
REDIS_PASSWORD=$(cat "$DEPLOYMENT_DIR/secrets/redis_password.txt")
REDIS_PORT=6379

# Security
SECRET_KEY=$(cat "$DEPLOYMENT_DIR/secrets/secret_key.txt")
JWT_SECRET=$(cat "$DEPLOYMENT_DIR/secrets/jwt_secret.txt")
ENCRYPTION_KEY=$(cat "$DEPLOYMENT_DIR/secrets/encryption_key.txt")

# Features
ENABLE_ENCRYPTION=true
LOCAL_ONLY_MODE=false
ENABLE_ANALYTICS=true
ENABLE_AUDIT_LOGGING=true

# Network
FRONTEND_PORT=80
FRONTEND_SSL_PORT=443
BACKEND_PORT=8000
WEBSOCKET_PORT=8001

# SSL
SSL_ENABLED=$SSL_ENABLED
DOMAIN=$DOMAIN
EMAIL=$EMAIL

# API URLs
VITE_API_URL=http${SSL_ENABLED:+s}://${DOMAIN:-localhost}${SSL_ENABLED:+:443}${SSL_ENABLED:-:8000}
VITE_WS_URL=ws${SSL_ENABLED:+s}://${DOMAIN:-localhost}${SSL_ENABLED:+:443}${SSL_ENABLED:-:8001}
VITE_ENCRYPTION_ENABLED=true
VITE_LOCAL_ONLY_MODE=false
VITE_ANALYTICS_ENABLED=true

# CORS
CORS_ORIGINS=http${SSL_ENABLED:+s}://${DOMAIN:-localhost}${SSL_ENABLED:+:443}${SSL_ENABLED:-:3000}

# Monitoring
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
GRAFANA_PASSWORD=$(openssl rand -base64 16)

# Logging
LOG_LEVEL=INFO
FLUENTD_PORT=24224
FLUENTD_UDP_PORT=24224

# Load Balancer
LB_HTTP_PORT=80
LB_HTTPS_PORT=443

# File uploads
MAX_UPLOAD_SIZE=100MB
EOF

    log_success "Environment configuration created"
}

deploy_docker_compose() {
    log_info "Deploying with Docker Compose..."
    
    cd "$PROJECT_ROOT"
    
    local compose_file="docker-compose.yml"
    local compose_args=""
    
    # Use development compose for development environment
    if [[ $ENVIRONMENT == "development" ]]; then
        compose_file="docker-compose.dev.yml"
    fi
    
    # Add monitoring profile if enabled
    if [[ $MONITORING_ENABLED == true ]]; then
        compose_args="$compose_args --profile monitoring"
    fi
    
    # Add logging profile if enabled
    if [[ $BACKUP_ENABLED == true ]]; then
        compose_args="$compose_args --profile logging"
    fi
    
    # Force recreate if requested
    if [[ $FORCE_RECREATE == true ]]; then
        compose_args="$compose_args --force-recreate"
    fi
    
    # Pull latest images
    docker-compose -f "$compose_file" pull
    
    # Deploy
    docker-compose -f "$compose_file" up -d $compose_args
    
    log_success "Docker Compose deployment completed"
}

deploy_kubernetes() {
    log_info "Deploying to Kubernetes..."
    
    local k8s_dir="$DEPLOYMENT_DIR/kubernetes"
    
    # Apply namespace
    kubectl apply -f "$k8s_dir/namespace.yaml"
    
    # Apply secrets
    kubectl apply -f "$k8s_dir/secrets.yaml"
    
    # Apply configmaps
    kubectl apply -f "$k8s_dir/configmaps.yaml"
    
    # Apply persistent volumes
    kubectl apply -f "$k8s_dir/volumes.yaml"
    
    # Apply services
    kubectl apply -f "$k8s_dir/services.yaml"
    
    # Apply deployments
    kubectl apply -f "$k8s_dir/deployments.yaml"
    
    # Apply ingress if SSL is enabled
    if [[ $SSL_ENABLED == true ]]; then
        kubectl apply -f "$k8s_dir/ingress-ssl.yaml"
    else
        kubectl apply -f "$k8s_dir/ingress.yaml"
    fi
    
    # Wait for rollout to complete
    kubectl rollout status deployment/meetingmind-backend -n meetingmind
    kubectl rollout status deployment/meetingmind-frontend -n meetingmind
    
    log_success "Kubernetes deployment completed"
}

deploy_standalone() {
    log_info "Deploying standalone..."
    
    # Build frontend
    cd "$PROJECT_ROOT/frontend"
    npm ci --production
    npm run build
    
    # Setup backend
    cd "$PROJECT_ROOT/backend"
    pip3 install -r requirements.txt
    
    # Setup database
    python3 -m alembic upgrade head
    
    # Create systemd services
    "$DEPLOYMENT_DIR/scripts/create-systemd-services.sh"
    
    log_success "Standalone deployment completed"
}

setup_monitoring() {
    if [[ $MONITORING_ENABLED == true ]]; then
        log_info "Setting up monitoring..."
        
        case $DEPLOYMENT_TYPE in
            docker-compose)
                # Monitoring is included in docker-compose profiles
                log_info "Monitoring containers starting with Docker Compose"
                ;;
            kubernetes)
                # Deploy monitoring stack with Helm
                helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
                helm repo add grafana https://grafana.github.io/helm-charts
                helm repo update
                
                helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
                    --namespace monitoring --create-namespace \
                    --values "$DEPLOYMENT_DIR/kubernetes/monitoring/values.yaml"
                ;;
        esac
        
        log_success "Monitoring setup completed"
    fi
}

setup_backups() {
    if [[ $BACKUP_ENABLED == true ]]; then
        log_info "Setting up automated backups..."
        
        # Create backup script
        local backup_script="$DEPLOYMENT_DIR/scripts/backup.sh"
        chmod +x "$backup_script"
        
        # Setup cron job
        (crontab -l 2>/dev/null; echo "0 2 * * * $backup_script") | crontab -
        
        log_success "Automated backups configured"
    fi
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    local max_attempts=30
    local attempt=1
    local url="http${SSL_ENABLED:+s}://${DOMAIN:-localhost}${SSL_ENABLED:+:443}${SSL_ENABLED:-:80}/health"
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s "$url" >/dev/null 2>&1; then
            log_success "Application is responding at $url"
            break
        fi
        
        log_info "Waiting for application to start... (attempt $attempt/$max_attempts)"
        sleep 10
        ((attempt++))
    done
    
    if [[ $attempt -gt $max_attempts ]]; then
        log_error "Application failed to start within expected time"
        exit 1
    fi
}

show_deployment_info() {
    log_success "Deployment completed successfully!"
    echo
    echo "=== Deployment Information ==="
    echo "Environment: $ENVIRONMENT"
    echo "Type: $DEPLOYMENT_TYPE"
    echo "Domain: ${DOMAIN:-localhost}"
    echo "SSL: $SSL_ENABLED"
    echo "Monitoring: $MONITORING_ENABLED"
    echo "Backup: $BACKUP_ENABLED"
    echo
    echo "=== Access URLs ==="
    echo "Application: http${SSL_ENABLED:+s}://${DOMAIN:-localhost}${SSL_ENABLED:+:443}${SSL_ENABLED:-:80}"
    echo "API: http${SSL_ENABLED:+s}://${DOMAIN:-localhost}${SSL_ENABLED:+:443}${SSL_ENABLED:-:8000}/docs"
    
    if [[ $MONITORING_ENABLED == true ]]; then
        echo "Prometheus: http://${DOMAIN:-localhost}:9090"
        echo "Grafana: http://${DOMAIN:-localhost}:3001 (admin/$(grep GRAFANA_PASSWORD "$PROJECT_ROOT/.env" | cut -d= -f2))"
    fi
    
    echo
    echo "=== Next Steps ==="
    echo "1. Test the application by visiting the URL above"
    echo "2. Configure DNS to point to this server if using a custom domain"
    echo "3. Review logs: docker-compose logs -f (for Docker Compose)"
    echo "4. Setup monitoring alerts if monitoring is enabled"
    echo "5. Schedule regular backups if not already automated"
    echo
}

cleanup_on_error() {
    log_error "Deployment failed. Cleaning up..."
    
    case $DEPLOYMENT_TYPE in
        docker-compose)
            docker-compose -f "$PROJECT_ROOT/docker-compose.yml" down
            ;;
        kubernetes)
            kubectl delete namespace meetingmind --ignore-not-found
            ;;
    esac
    
    exit 1
}

# Main execution
main() {
    # Set up error handling
    trap cleanup_on_error ERR
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Load configuration file if it exists
    if [[ -f "$CONFIG_FILE" ]]; then
        log_info "Loading configuration from $CONFIG_FILE"
        source "$CONFIG_FILE"
    fi
    
    # Show deployment summary
    log_info "Starting MeetingMind deployment..."
    log_info "Type: $DEPLOYMENT_TYPE, Environment: $ENVIRONMENT"
    
    # Execute deployment steps
    check_prerequisites
    update_system
    generate_secrets
    setup_ssl
    create_environment_file
    
    # Deploy based on type
    case $DEPLOYMENT_TYPE in
        docker-compose)
            deploy_docker_compose
            ;;
        kubernetes)
            deploy_kubernetes
            ;;
        standalone)
            deploy_standalone
            ;;
        *)
            log_error "Unknown deployment type: $DEPLOYMENT_TYPE"
            exit 1
            ;;
    esac
    
    # Additional setup
    setup_monitoring
    setup_backups
    
    # Verify and show results
    verify_deployment
    show_deployment_info
}

# Execute main function with all arguments
main "$@"