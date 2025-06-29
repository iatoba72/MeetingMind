// EmptyState Component
// Reusable empty state display for when no data is available

import React from 'react';
import { FileText, Search, Users, Calendar, MessageSquare, Database } from 'lucide-react';

interface EmptyStateProps {
  icon?: 'file' | 'search' | 'users' | 'calendar' | 'message' | 'database' | React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  className?: string;
}

const iconComponents = {
  file: FileText,
  search: Search,
  users: Users,
  calendar: Calendar,
  message: MessageSquare,
  database: Database
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'file',
  title,
  description,
  action,
  className = ''
}) => {
  const IconComponent = typeof icon === 'string' ? iconComponents[icon] : null;

  return (
    <div className={`flex flex-col items-center justify-center min-h-[300px] p-8 text-center ${className}`}>
      <div className="mb-4">
        {IconComponent ? (
          <IconComponent className="w-16 h-16 text-gray-300 mx-auto" />
        ) : (
          icon
        )}
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title}
      </h3>
      
      <p className="text-gray-500 max-w-md mb-6">
        {description}
      </p>
      
      {action && (
        <button
          onClick={action.onClick}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            action.variant === 'secondary'
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;