// Meeting Statistics Component
// Dashboard showing meeting metrics and analytics

import React from 'react';

interface Meeting {
  id: string;
  title: string;
  description: string;
  meeting_number: string;
  status: 'not_started' | 'active' | 'paused' | 'ended' | 'cancelled';
  scheduled_start: string;
  scheduled_end: string;
  participant_count: number;
  created_by: string;
  created_at: string;
}

interface MeetingStatisticsProps {
  totalMeetings: number;
  meetings: Meeting[];
}

export const MeetingStatistics: React.FC<MeetingStatisticsProps> = ({ 
  totalMeetings, 
  meetings 
}) => {
  // Calculate statistics from the meetings data
  const calculateStats = () => {
    const stats = {
      total: totalMeetings,
      active: 0,
      upcoming: 0,
      ended: 0,
      cancelled: 0,
      totalParticipants: 0,
      upcomingToday: 0,
      averageParticipants: 0
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    meetings.forEach(meeting => {
      const scheduledStart = new Date(meeting.scheduled_start);
      
      // Count by status
      switch (meeting.status) {
        case 'active':
        case 'paused':
          stats.active++;
          break;
        case 'not_started':
          stats.upcoming++;
          break;
        case 'ended':
          stats.ended++;
          break;
        case 'cancelled':
          stats.cancelled++;
          break;
      }

      // Count participants
      stats.totalParticipants += meeting.participant_count;

      // Count meetings scheduled for today
      if (scheduledStart >= today && scheduledStart < tomorrow) {
        stats.upcomingToday++;
      }
    });

    // Calculate average participants
    stats.averageParticipants = meetings.length > 0 
      ? Math.round(stats.totalParticipants / meetings.length) 
      : 0;

    return stats;
  };

  const stats = calculateStats();

  // Get status color classes
  const getStatusColor = (type: string) => {
    switch (type) {
      case 'active':
        return 'bg-green-500';
      case 'upcoming':
        return 'bg-blue-500';
      case 'ended':
        return 'bg-gray-500';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Create stat cards data
  const statCards = [
    {
      title: 'Total Meetings',
      value: stats.total,
      icon: '📊',
      color: 'bg-indigo-500',
      textColor: 'text-indigo-600',
      bgColor: 'bg-indigo-50'
    },
    {
      title: 'Active Now',
      value: stats.active,
      icon: '🟢',
      color: 'bg-green-500',
      textColor: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: 'Upcoming',
      value: stats.upcoming,
      icon: '⏳',
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: 'Completed',
      value: stats.ended,
      icon: '✅',
      color: 'bg-gray-500',
      textColor: 'text-gray-600',
      bgColor: 'bg-gray-50'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Main Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => (
          <div
            key={index}
            className={`${card.bgColor} rounded-lg p-6 border border-gray-200`}
          >
            <div className="flex items-center">
              <div className={`flex-shrink-0 ${card.color} rounded-md p-3`}>
                <span className="text-white text-xl">{card.icon}</span>
              </div>
              <div className="ml-4 flex-1">
                <div className="text-sm font-medium text-gray-600">
                  {card.title}
                </div>
                <div className={`text-2xl font-bold ${card.textColor}`}>
                  {card.value}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Today's Meetings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Today's Meetings</h3>
              <div className="text-3xl font-bold text-orange-600 mt-2">
                {stats.upcomingToday}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Scheduled for today
              </p>
            </div>
            <div className="text-4xl">📅</div>
          </div>
        </div>

        {/* Total Participants */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Total Participants</h3>
              <div className="text-3xl font-bold text-purple-600 mt-2">
                {stats.totalParticipants}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Across all meetings
              </p>
            </div>
            <div className="text-4xl">👥</div>
          </div>
        </div>

        {/* Average Participants */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Avg. Participants</h3>
              <div className="text-3xl font-bold text-teal-600 mt-2">
                {stats.averageParticipants}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Per meeting
              </p>
            </div>
            <div className="text-4xl">📈</div>
          </div>
        </div>
      </div>

      {/* Status Distribution Chart */}
      {meetings.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Meeting Status Distribution</h3>
          
          <div className="space-y-3">
            {[
              { label: 'Active/Paused', count: stats.active, total: stats.total, color: 'bg-green-500' },
              { label: 'Upcoming', count: stats.upcoming, total: stats.total, color: 'bg-blue-500' },
              { label: 'Completed', count: stats.ended, total: stats.total, color: 'bg-gray-500' },
              { label: 'Cancelled', count: stats.cancelled, total: stats.total, color: 'bg-red-500' }
            ].map((item, index) => {
              const percentage = stats.total > 0 ? (item.count / stats.total) * 100 : 0;
              
              return (
                <div key={index} className="flex items-center">
                  <div className="w-24 text-sm text-gray-600">{item.label}</div>
                  <div className="flex-1 mx-4">
                    <div className="bg-gray-200 rounded-full h-2">
                      <div
                        className={`${item.color} h-2 rounded-full transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="w-16 text-right text-sm">
                    <span className="font-medium text-gray-900">{item.count}</span>
                    <span className="text-gray-500 ml-1">({percentage.toFixed(0)}%)</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {stats.total === 0 && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">📊</div>
              <p>No meetings data to display</p>
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Insights</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Meetings this week:</span>
              <span className="font-medium">
                {meetings.filter(m => {
                  const meetingDate = new Date(m.scheduled_start);
                  const now = new Date();
                  const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
                  const weekEnd = new Date(weekStart);
                  weekEnd.setDate(weekEnd.getDate() + 7);
                  return meetingDate >= weekStart && meetingDate < weekEnd;
                }).length}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Completion rate:</span>
              <span className="font-medium">
                {stats.total > 0 
                  ? `${((stats.ended / (stats.total - stats.upcoming)) * 100 || 0).toFixed(0)}%`
                  : 'N/A'
                }
              </span>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Busiest status:</span>
              <span className="font-medium">
                {Math.max(stats.active, stats.upcoming, stats.ended) === stats.active && 'Active'}
                {Math.max(stats.active, stats.upcoming, stats.ended) === stats.upcoming && 'Upcoming'}
                {Math.max(stats.active, stats.upcoming, stats.ended) === stats.ended && 'Completed'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Success rate:</span>
              <span className="font-medium">
                {stats.total > 0 
                  ? `${((stats.ended / (stats.total - stats.cancelled)) * 100 || 0).toFixed(0)}%`
                  : 'N/A'
                }
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};