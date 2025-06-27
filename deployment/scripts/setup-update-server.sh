#!/bin/bash

# MeetingMind Update Server Setup Script
# Deploys and configures the auto-update infrastructure

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
UPDATE_SERVER_DIR="$PROJECT_ROOT/deployment/update-server"

# Default values
DOMAIN=""
EMAIL=""
GITHUB_TOKEN=""
WEBHOOK_SECRET=""
DEPLOYMENT_TYPE="docker"
SSL_ENABLED=true
MONITORING_ENABLED=false

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
MeetingMind Update Server Setup Script

Usage: $0 [OPTIONS]

OPTIONS:
    -d, --domain DOMAIN    Domain name for the update server (required)
    -e, --email EMAIL      Email for SSL certificate registration (required)
    -t, --token TOKEN      GitHub personal access token for releases
    -w, --webhook SECRET   GitHub webhook secret for security
    -m, --monitoring       Enable monitoring stack
    --no-ssl              Disable SSL/HTTPS
    --type TYPE           Deployment type: docker, kubernetes (default: docker)
    -h, --help            Show this help message

EXAMPLES:
    # Basic setup with SSL
    $0 --domain updates.meetingmind.com --email admin@meetingmind.com

    # With GitHub integration
    $0 --domain updates.meetingmind.com --email admin@meetingmind.com --token ghp_xxx --webhook secret123

    # With monitoring
    $0 --domain updates.meetingmind.com --email admin@meetingmind.com --monitoring

EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--domain)
                DOMAIN="$2"
                shift 2
                ;;
            -e|--email)
                EMAIL="$2"
                shift 2
                ;;
            -t|--token)
                GITHUB_TOKEN="$2"
                shift 2
                ;;
            -w|--webhook)
                WEBHOOK_SECRET="$2"
                shift 2
                ;;
            -m|--monitoring)
                MONITORING_ENABLED=true
                shift
                ;;
            --no-ssl)
                SSL_ENABLED=false
                shift
                ;;
            --type)
                DEPLOYMENT_TYPE="$2"
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

    # Check required parameters
    if [[ -z "$DOMAIN" ]]; then
        log_error "Domain is required. Use --domain flag."
        exit 1
    fi

    if [[ $SSL_ENABLED == true && -z "$EMAIL" ]]; then
        log_error "Email is required for SSL setup. Use --email flag."
        exit 1
    fi

    # Check tools based on deployment type
    case $DEPLOYMENT_TYPE in
        docker)
            command -v docker >/dev/null 2>&1 || { log_error "Docker is required but not installed"; exit 1; }
            command -v docker-compose >/dev/null 2>&1 || { log_error "Docker Compose is required but not installed"; exit 1; }
            ;;
        kubernetes)
            command -v kubectl >/dev/null 2>&1 || { log_error "kubectl is required but not installed"; exit 1; }
            command -v helm >/dev/null 2>&1 || { log_error "Helm is required but not installed"; exit 1; }
            ;;
    esac

    # Check for SSL tools
    if [[ $SSL_ENABLED == true ]]; then
        command -v certbot >/dev/null 2>&1 || { log_warning "Certbot not found. Will attempt to install."; }
    fi

    log_success "Prerequisites check completed"
}

generate_secrets() {
    log_info "Generating secure secrets..."
    
    local secrets_dir="$UPDATE_SERVER_DIR/.secrets"
    mkdir -p "$secrets_dir"

    # Generate secrets if they don't exist
    if [[ ! -f "$secrets_dir/redis_password.txt" ]]; then
        openssl rand -base64 32 > "$secrets_dir/redis_password.txt"
    fi

    if [[ ! -f "$secrets_dir/update_server_token.txt" ]]; then
        openssl rand -base64 64 > "$secrets_dir/update_server_token.txt"
    fi

    if [[ -z "$WEBHOOK_SECRET" && ! -f "$secrets_dir/webhook_secret.txt" ]]; then
        openssl rand -base64 32 > "$secrets_dir/webhook_secret.txt"
        WEBHOOK_SECRET=$(cat "$secrets_dir/webhook_secret.txt")
    elif [[ -n "$WEBHOOK_SECRET" ]]; then
        echo "$WEBHOOK_SECRET" > "$secrets_dir/webhook_secret.txt"
    fi

    # Set secure permissions
    chmod 600 "$secrets_dir"/*
    
    log_success "Secrets generated"
}

setup_ssl() {
    if [[ $SSL_ENABLED == true ]]; then
        log_info "Setting up SSL certificates..."
        
        local ssl_dir="$UPDATE_SERVER_DIR/ssl"
        mkdir -p "$ssl_dir"

        # Install certbot if not present
        if ! command -v certbot >/dev/null 2>&1; then
            if command -v apt-get >/dev/null 2>&1; then
                sudo apt-get update && sudo apt-get install -y certbot
            elif command -v yum >/dev/null 2>&1; then
                sudo yum install -y certbot
            elif command -v dnf >/dev/null 2>&1; then
                sudo dnf install -y certbot
            else
                log_error "Cannot install certbot automatically. Please install manually."
                exit 1
            fi
        fi

        # Generate SSL certificate
        if [[ ! -f "$ssl_dir/fullchain.pem" ]]; then
            sudo certbot certonly --standalone \
                --email "$EMAIL" \
                --agree-tos \
                --non-interactive \
                --domain "$DOMAIN"
            
            # Copy certificates to deployment directory
            sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$ssl_dir/"
            sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$ssl_dir/"
            sudo chown $USER:$USER "$ssl_dir"/*
        fi

        log_success "SSL certificates configured"
    fi
}

create_environment_file() {
    log_info "Creating environment configuration..."
    
    local env_file="$UPDATE_SERVER_DIR/.env"
    
    cat > "$env_file" << EOF
# MeetingMind Update Server Environment Configuration
# Generated on $(date)

# Server Configuration
NODE_ENV=production
PORT=3000
BASE_URL=https://${DOMAIN}
RELEASES_PATH=/app/releases
GITHUB_REPO=meetingmind/desktop

# Security
ALLOWED_ORIGINS=https://meetingmind.com,https://app.meetingmind.com
UPDATE_SERVER_TOKEN=$(cat "$UPDATE_SERVER_DIR/.secrets/update_server_token.txt")
GITHUB_WEBHOOK_SECRET=$(cat "$UPDATE_SERVER_DIR/.secrets/webhook_secret.txt")

# GitHub Integration
GITHUB_TOKEN=${GITHUB_TOKEN}

# Redis Configuration
REDIS_PASSWORD=$(cat "$UPDATE_SERVER_DIR/.secrets/redis_password.txt")

# SSL Configuration
SSL_ENABLED=${SSL_ENABLED}
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}

# Monitoring
MONITORING_ENABLED=${MONITORING_ENABLED}
EOF

    chmod 600 "$env_file"
    log_success "Environment configuration created"
}

deploy_docker() {
    log_info "Deploying update server with Docker..."
    
    cd "$UPDATE_SERVER_DIR"
    
    local compose_args=""
    
    # Add monitoring profile if enabled
    if [[ $MONITORING_ENABLED == true ]]; then
        compose_args="$compose_args --profile monitoring"
    fi
    
    # Pull latest images
    docker-compose pull
    
    # Deploy
    docker-compose up -d $compose_args
    
    log_success "Docker deployment completed"
}

deploy_kubernetes() {
    log_info "Deploying update server to Kubernetes..."
    
    local k8s_dir="$UPDATE_SERVER_DIR/k8s"
    mkdir -p "$k8s_dir"
    
    # Create Kubernetes manifests
    create_kubernetes_manifests
    
    # Apply manifests
    kubectl apply -f "$k8s_dir/"
    
    # Wait for rollout
    kubectl rollout status deployment/update-server -n meetingmind-updates
    
    log_success "Kubernetes deployment completed"
}

create_kubernetes_manifests() {
    local k8s_dir="$UPDATE_SERVER_DIR/k8s"
    
    # Namespace
    cat > "$k8s_dir/namespace.yaml" << EOF
apiVersion: v1
kind: Namespace
metadata:
  name: meetingmind-updates
EOF

    # ConfigMap
    cat > "$k8s_dir/configmap.yaml" << EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: update-server-config
  namespace: meetingmind-updates
data:
  NODE_ENV: "production"
  PORT: "3000"
  BASE_URL: "https://${DOMAIN}"
  RELEASES_PATH: "/app/releases"
  GITHUB_REPO: "meetingmind/desktop"
  ALLOWED_ORIGINS: "https://meetingmind.com,https://app.meetingmind.com"
EOF

    # Secret
    cat > "$k8s_dir/secret.yaml" << EOF
apiVersion: v1
kind: Secret
metadata:
  name: update-server-secret
  namespace: meetingmind-updates
type: Opaque
data:
  UPDATE_SERVER_TOKEN: $(base64 -w 0 < "$UPDATE_SERVER_DIR/.secrets/update_server_token.txt")
  GITHUB_WEBHOOK_SECRET: $(base64 -w 0 < "$UPDATE_SERVER_DIR/.secrets/webhook_secret.txt")
  REDIS_PASSWORD: $(base64 -w 0 < "$UPDATE_SERVER_DIR/.secrets/redis_password.txt")
EOF

    # Deployment
    cat > "$k8s_dir/deployment.yaml" << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: update-server
  namespace: meetingmind-updates
spec:
  replicas: 2
  selector:
    matchLabels:
      app: update-server
  template:
    metadata:
      labels:
        app: update-server
    spec:
      containers:
      - name: update-server
        image: meetingmind/update-server:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: update-server-config
        - secretRef:
            name: update-server-secret
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
EOF

    # Service
    cat > "$k8s_dir/service.yaml" << EOF
apiVersion: v1
kind: Service
metadata:
  name: update-server-service
  namespace: meetingmind-updates
spec:
  selector:
    app: update-server
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
EOF

    # Ingress
    cat > "$k8s_dir/ingress.yaml" << EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: update-server-ingress
  namespace: meetingmind-updates
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  tls:
  - hosts:
    - ${DOMAIN}
    secretName: update-server-tls
  rules:
  - host: ${DOMAIN}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: update-server-service
            port:
              number: 80
EOF
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    local max_attempts=30
    local attempt=1
    local url="http${SSL_ENABLED:+s}://${DOMAIN}/health"
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s "$url" >/dev/null 2>&1; then
            log_success "Update server is responding at $url"
            break
        fi
        
        log_info "Waiting for update server to start... (attempt $attempt/$max_attempts)"
        sleep 10
        ((attempt++))
    done
    
    if [[ $attempt -gt $max_attempts ]]; then
        log_error "Update server failed to start within expected time"
        exit 1
    fi
}

show_deployment_info() {
    log_success "Update server deployment completed successfully!"
    echo
    echo "=== Update Server Information ==="
    echo "Domain: $DOMAIN"
    echo "SSL: $SSL_ENABLED"
    echo "Monitoring: $MONITORING_ENABLED"
    echo "Type: $DEPLOYMENT_TYPE"
    echo
    echo "=== Access URLs ==="
    echo "Health Check: http${SSL_ENABLED:+s}://${DOMAIN}/health"
    echo "API Documentation: http${SSL_ENABLED:+s}://${DOMAIN}/releases"
    echo "Statistics: http${SSL_ENABLED:+s}://${DOMAIN}/stats"
    
    if [[ $MONITORING_ENABLED == true ]]; then
        echo "Prometheus: http://${DOMAIN}:9090"
    fi
    
    echo
    echo "=== GitHub Configuration ==="
    echo "Add this webhook URL to your GitHub repository:"
    echo "URL: http${SSL_ENABLED:+s}://${DOMAIN}/webhook/github"
    echo "Secret: $(cat "$UPDATE_SERVER_DIR/.secrets/webhook_secret.txt")"
    echo
    echo "=== Next Steps ==="
    echo "1. Configure DNS to point $DOMAIN to this server"
    echo "2. Add the webhook URL to your GitHub repository settings"
    echo "3. Update your Electron app configuration to use this update server"
    echo "4. Test the update process by creating a new release"
    echo
}

# Main execution
main() {
    # Parse command line arguments
    parse_arguments "$@"
    
    # Show deployment summary
    log_info "Starting update server setup..."
    log_info "Domain: $DOMAIN, SSL: $SSL_ENABLED, Type: $DEPLOYMENT_TYPE"
    
    # Execute setup steps
    check_prerequisites
    generate_secrets
    setup_ssl
    create_environment_file
    
    # Deploy based on type
    case $DEPLOYMENT_TYPE in
        docker)
            deploy_docker
            ;;
        kubernetes)
            deploy_kubernetes
            ;;
        *)
            log_error "Unknown deployment type: $DEPLOYMENT_TYPE"
            exit 1
            ;;
    esac
    
    # Verify and show results
    verify_deployment
    show_deployment_info
}

# Execute main function with all arguments
main "$@"