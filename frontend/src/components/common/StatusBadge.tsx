// StatusBadge Component
// Reusable status indicator with consistent styling

import React from 'react';
import { Check, X, Clock, AlertTriangle, Zap, Pause } from 'lucide-react';

interface StatusBadgeProps {
  status: 'success' | 'error' | 'warning' | 'pending' | 'active' | 'paused' | 'inactive';
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const statusConfig = {
  success: {
    icon: Check,
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    iconColor: 'text-green-600',
    defaultText: 'Success'
  },
  error: {
    icon: X,
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
    iconColor: 'text-red-600',
    defaultText: 'Error'
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
    iconColor: 'text-yellow-600',
    defaultText: 'Warning'
  },
  pending: {
    icon: Clock,
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
    iconColor: 'text-blue-600',
    defaultText: 'Pending'
  },
  active: {
    icon: Zap,
    bgColor: 'bg-emerald-100',
    textColor: 'text-emerald-800',
    iconColor: 'text-emerald-600',
    defaultText: 'Active'
  },
  paused: {
    icon: Pause,
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-800',
    iconColor: 'text-orange-600',
    defaultText: 'Paused'
  },
  inactive: {
    icon: X,
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
    iconColor: 'text-gray-600',
    defaultText: 'Inactive'
  }
};

const sizeClasses = {
  sm: {
    container: 'px-2 py-1 text-xs',
    icon: 'w-3 h-3'
  },
  md: {
    container: 'px-3 py-1.5 text-sm',
    icon: 'w-4 h-4'
  },
  lg: {
    container: 'px-4 py-2 text-base',
    icon: 'w-5 h-5'
  }
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  text,
  size = 'md',
  showIcon = true,
  className = ''
}) => {
  const config = statusConfig[status];
  const sizeConfig = sizeClasses[size];
  const IconComponent = config.icon;
  const displayText = text || config.defaultText;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${config.bgColor} ${config.textColor} ${sizeConfig.container}
        ${className}
      `}
    >
      {showIcon && (
        <IconComponent className={`${sizeConfig.icon} ${config.iconColor}`} />
      )}
      {displayText}
    </span>
  );
};

export default StatusBadge;