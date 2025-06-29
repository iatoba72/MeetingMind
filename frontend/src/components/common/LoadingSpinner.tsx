// LoadingSpinner Component
// Reusable loading spinner with various styles and sizes

import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'secondary' | 'muted' | 'accent';
  text?: string;
  className?: string;
  centered?: boolean;
  overlay?: boolean;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6', 
  lg: 'w-8 h-8',
  xl: 'w-12 h-12'
};

const variantClasses = {
  primary: 'text-blue-600',
  secondary: 'text-gray-600',
  muted: 'text-gray-400',
  accent: 'text-purple-600'
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  variant = 'primary',
  text,
  className = '',
  centered = false,
  overlay = false
}) => {
  const spinnerContent = (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <Loader2 
        className={`animate-spin ${sizeClasses[size]} ${variantClasses[variant]}`}
      />
      {text && (
        <span className={`text-sm ${variantClasses[variant]} font-medium`}>
          {text}
        </span>
      )}
    </div>
  );

  if (overlay) {
    return (
      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
        {spinnerContent}
      </div>
    );
  }

  if (centered) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        {spinnerContent}
      </div>
    );
  }

  return spinnerContent;
};

export default LoadingSpinner;