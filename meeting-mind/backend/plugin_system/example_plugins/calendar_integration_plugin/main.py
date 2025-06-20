# Calendar Integration Plugin
# Integrate meetings with popular calendar systems

import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import pytz
from dataclasses import dataclass
import base64
import hashlib

from plugin_system.plugin_api import (
    BasePlugin, PluginManifest, PluginEvent, PluginResult, PluginEventType,
    PluginCapability, PluginPriority, plugin_hook, requires_capability
)

@dataclass
class CalendarEvent:
    """Calendar event representation"""
    event_id: str
    title: str
    description: str
    start_time: datetime
    end_time: datetime
    location: Optional[str] = None
    attendees: List[Dict[str, str]] = None
    meeting_id: Optional[str] = None
    calendar_provider: Optional[str] = None
    provider_event_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'event_id': self.event_id,
            'title': self.title,
            'description': self.description,
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat(),
            'location': self.location,
            'attendees': self.attendees or [],
            'meeting_id': self.meeting_id,
            'calendar_provider': self.calendar_provider,
            'provider_event_id': self.provider_event_id
        }

class CalendarProvider:
    """Base class for calendar providers"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.credentials = None
    
    async def authenticate(self) -> bool:
        """Authenticate with calendar provider"""
        raise NotImplementedError
    
    async def create_event(self, event: CalendarEvent) -> str:
        """Create calendar event, return provider event ID"""
        raise NotImplementedError
    
    async def update_event(self, provider_event_id: str, event: CalendarEvent) -> bool:
        """Update existing calendar event"""
        raise NotImplementedError
    
    async def delete_event(self, provider_event_id: str) -> bool:
        """Delete calendar event"""
        raise NotImplementedError
    
    async def get_events(self, start_date: datetime, end_date: datetime) -> List[CalendarEvent]:
        """Get calendar events in date range"""
        raise NotImplementedError
    
    async def get_event(self, provider_event_id: str) -> Optional[CalendarEvent]:
        """Get specific calendar event"""
        raise NotImplementedError

class GoogleCalendarProvider(CalendarProvider):
    """Google Calendar provider implementation"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.service = None
        self.calendar_id = config.get('calendar_id', 'primary')
    
    async def authenticate(self) -> bool:
        """Authenticate with Google Calendar"""
        try:
            # In a real implementation, this would handle OAuth2 flow
            # For demo purposes, assume credentials are configured
            api_key = self.config.get('api_key')
            service_account_file = self.config.get('service_account_file')
            
            if api_key or service_account_file:
                # Initialize Google Calendar service
                # This is a simplified version - real implementation would use google-api-python-client
                self.service = "google_calendar_service"  # Mock service
                return True
            
            return False
        except Exception:
            return False
    
    async def create_event(self, event: CalendarEvent) -> str:
        """Create Google Calendar event"""
        if not self.service:
            await self.authenticate()
        
        # Convert to Google Calendar format
        google_event = {
            'summary': event.title,
            'description': event.description,
            'location': event.location,
            'start': {
                'dateTime': event.start_time.isoformat(),
                'timeZone': self.config.get('timezone', 'UTC')
            },
            'end': {
                'dateTime': event.end_time.isoformat(),
                'timeZone': self.config.get('timezone', 'UTC')
            },
            'attendees': [
                {'email': attendee.get('email')} 
                for attendee in (event.attendees or [])
                if attendee.get('email')
            ],
            'reminders': {
                'useDefault': False,
                'overrides': [
                    {'method': 'email', 'minutes': self.config.get('reminder_minutes', 15)},
                    {'method': 'popup', 'minutes': 10}
                ]
            }
        }
        
        # In real implementation: result = self.service.events().insert(calendarId=self.calendar_id, body=google_event).execute()
        # For demo, return mock event ID
        mock_event_id = f"google_{hashlib.md5(event.title.encode()).hexdigest()}"
        return mock_event_id
    
    async def update_event(self, provider_event_id: str, event: CalendarEvent) -> bool:
        """Update Google Calendar event"""
        try:
            google_event = {
                'summary': event.title,
                'description': event.description,
                'location': event.location,
                'start': {
                    'dateTime': event.start_time.isoformat(),
                    'timeZone': self.config.get('timezone', 'UTC')
                },
                'end': {
                    'dateTime': event.end_time.isoformat(),
                    'timeZone': self.config.get('timezone', 'UTC')
                }
            }
            
            # In real implementation: self.service.events().update(calendarId=self.calendar_id, eventId=provider_event_id, body=google_event).execute()
            return True
        except Exception:
            return False
    
    async def delete_event(self, provider_event_id: str) -> bool:
        """Delete Google Calendar event"""
        try:
            # In real implementation: self.service.events().delete(calendarId=self.calendar_id, eventId=provider_event_id).execute()
            return True
        except Exception:
            return False
    
    async def get_events(self, start_date: datetime, end_date: datetime) -> List[CalendarEvent]:
        """Get Google Calendar events"""
        events = []
        
        try:
            # In real implementation: events_result = self.service.events().list(...).execute()
            # For demo, return empty list
            pass
        except Exception:
            pass
        
        return events

class OutlookCalendarProvider(CalendarProvider):
    """Microsoft Outlook/Office 365 Calendar provider"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.graph_client = None
    
    async def authenticate(self) -> bool:
        """Authenticate with Microsoft Graph"""
        try:
            # In real implementation, use Microsoft Graph SDK
            client_id = self.config.get('client_id')
            client_secret = self.config.get('client_secret')
            tenant_id = self.config.get('tenant_id')
            
            if client_id and client_secret and tenant_id:
                # Initialize Graph client
                self.graph_client = "graph_client"  # Mock client
                return True
            
            return False
        except Exception:
            return False
    
    async def create_event(self, event: CalendarEvent) -> str:
        """Create Outlook calendar event"""
        if not self.graph_client:
            await self.authenticate()
        
        outlook_event = {
            'subject': event.title,
            'body': {
                'contentType': 'HTML',
                'content': event.description
            },
            'start': {
                'dateTime': event.start_time.isoformat(),
                'timeZone': self.config.get('timezone', 'UTC')
            },
            'end': {
                'dateTime': event.end_time.isoformat(),
                'timeZone': self.config.get('timezone', 'UTC')
            },
            'location': {
                'displayName': event.location or ''
            },
            'attendees': [
                {
                    'emailAddress': {
                        'address': attendee.get('email'),
                        'name': attendee.get('name', attendee.get('email'))
                    },
                    'type': 'required'
                }
                for attendee in (event.attendees or [])
                if attendee.get('email')
            ]
        }
        
        # In real implementation: result = self.graph_client.me.events.post(outlook_event)
        mock_event_id = f"outlook_{hashlib.md5(event.title.encode()).hexdigest()}"
        return mock_event_id
    
    async def update_event(self, provider_event_id: str, event: CalendarEvent) -> bool:
        """Update Outlook calendar event"""
        try:
            # Implementation similar to create_event but using PATCH
            return True
        except Exception:
            return False
    
    async def delete_event(self, provider_event_id: str) -> bool:
        """Delete Outlook calendar event"""
        try:
            # In real implementation: self.graph_client.me.events[provider_event_id].delete()
            return True
        except Exception:
            return False
    
    async def get_events(self, start_date: datetime, end_date: datetime) -> List[CalendarEvent]:
        """Get Outlook calendar events"""
        return []

class ICalProvider(CalendarProvider):
    """iCalendar (.ics) file provider for Apple Calendar and others"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.ical_url = config.get('ical_url')
        self.calendar_file_path = config.get('calendar_file_path')
    
    async def authenticate(self) -> bool:
        """Validate iCal configuration"""
        return bool(self.ical_url or self.calendar_file_path)
    
    async def create_event(self, event: CalendarEvent) -> str:
        """Create iCal event (append to file or calendar)"""
        try:
            # In real implementation, would use icalendar library
            # to create VEVENT and append to .ics file
            return f"ical_{event.event_id}"
        except Exception:
            return ""
    
    async def update_event(self, provider_event_id: str, event: CalendarEvent) -> bool:
        """Update iCal event"""
        # iCal typically doesn't support direct updates
        # Would need to delete and recreate
        return False
    
    async def delete_event(self, provider_event_id: str) -> bool:
        """Delete iCal event"""
        try:
            # Remove VEVENT from .ics file
            return True
        except Exception:
            return False
    
    async def get_events(self, start_date: datetime, end_date: datetime) -> List[CalendarEvent]:
        """Parse iCal events"""
        return []

class CalendarIntegrationPlugin(BasePlugin):
    """Main calendar integration plugin"""
    
    def __init__(self, context):
        super().__init__(context)
        self.calendar_provider = None
        self.sync_task = None
        self.event_cache = {}
        self.sync_queue = asyncio.Queue()
    
    def get_manifest(self) -> PluginManifest:
        """Return plugin manifest"""
        import os
        
        manifest_path = os.path.join(os.path.dirname(__file__), 'manifest.json')
        with open(manifest_path, 'r') as f:
            manifest_data = json.load(f)
        
        from plugin_system.plugin_api import create_plugin_manifest
        return create_plugin_manifest(**manifest_data)
    
    async def initialize(self) -> bool:
        """Initialize the plugin"""
        try:
            # Setup calendar provider
            await self._setup_calendar_provider()
            
            # Start background sync task
            self.sync_task = asyncio.create_task(self._background_sync_worker())
            
            self.context.log('info', 'Calendar Integration plugin initialized successfully')
            return True
        except Exception as e:
            self.context.log('error', f'Failed to initialize Calendar Integration plugin: {e}')
            return False
    
    async def cleanup(self):
        """Cleanup plugin resources"""
        if self.sync_task:
            self.sync_task.cancel()
            try:
                await self.sync_task
            except asyncio.CancelledError:
                pass
        
        self.context.log('info', 'Calendar Integration plugin cleaned up')
    
    async def _setup_calendar_provider(self):
        """Setup calendar provider based on configuration"""
        provider_type = self.context.get_config('calendar_provider')
        
        if provider_type == 'google':
            self.calendar_provider = GoogleCalendarProvider(self.context.get_config())
        elif provider_type == 'outlook':
            self.calendar_provider = OutlookCalendarProvider(self.context.get_config())
        elif provider_type in ['apple', 'ical']:
            self.calendar_provider = ICalProvider(self.context.get_config())
        else:
            raise ValueError(f"Unsupported calendar provider: {provider_type}")
        
        # Test authentication
        if not await self.calendar_provider.authenticate():
            raise Exception("Failed to authenticate with calendar provider")
    
    @plugin_hook(PluginEventType.MEETING_CREATED, PluginPriority.NORMAL)
    @requires_capability(PluginCapability.READ_MEETINGS)
    async def on_meeting_created(self, event: PluginEvent) -> PluginResult:
        """Handle meeting created event"""
        try:
            meeting_data = event.data
            meeting_id = meeting_data.get('id')
            
            self.context.log('info', f'Processing meeting creation for calendar sync: {meeting_id}')
            
            # Check if auto-create is enabled
            if self.context.get_config('auto_create_events', True):
                # Queue for background processing
                await self.sync_queue.put({
                    'type': 'meeting_created',
                    'meeting_id': meeting_id,
                    'meeting_data': meeting_data
                })
            
            return PluginResult.success_result({
                'message': 'Meeting queued for calendar sync'
            })
        except Exception as e:
            self.context.log('error', f'Error handling meeting created event: {e}')
            return PluginResult.error_result(str(e))
    
    @plugin_hook(PluginEventType.MEETING_UPDATED, PluginPriority.NORMAL)
    @requires_capability(PluginCapability.READ_MEETINGS)
    async def on_meeting_updated(self, event: PluginEvent) -> PluginResult:
        """Handle meeting updated event"""
        try:
            meeting_data = event.data
            meeting_id = meeting_data.get('id')
            
            # Queue for calendar update
            await self.sync_queue.put({
                'type': 'meeting_updated',
                'meeting_id': meeting_id,
                'meeting_data': meeting_data
            })
            
            return PluginResult.success_result()
        except Exception as e:
            return PluginResult.error_result(str(e))
    
    @plugin_hook(PluginEventType.MEETING_ENDED, PluginPriority.LOW)
    async def on_meeting_ended(self, event: PluginEvent) -> PluginResult:
        """Handle meeting ended event"""
        try:
            meeting_data = event.data
            meeting_id = meeting_data.get('id')
            
            # Update calendar event with actual end time and summary
            await self.sync_queue.put({
                'type': 'meeting_ended',
                'meeting_id': meeting_id,
                'meeting_data': meeting_data
            })
            
            return PluginResult.success_result()
        except Exception as e:
            return PluginResult.error_result(str(e))
    
    async def _background_sync_worker(self):
        """Background worker for processing calendar sync queue"""
        while True:
            try:
                # Get next item from queue
                sync_item = await self.sync_queue.get()
                
                # Process based on type
                if sync_item['type'] == 'meeting_created':
                    await self._sync_meeting_to_calendar(sync_item)
                elif sync_item['type'] == 'meeting_updated':
                    await self._update_calendar_event(sync_item)
                elif sync_item['type'] == 'meeting_ended':
                    await self._finalize_calendar_event(sync_item)
                elif sync_item['type'] == 'periodic_sync':
                    await self._perform_periodic_sync()
                
                # Mark task as done
                self.sync_queue.task_done()
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.context.log('error', f'Error in calendar sync worker: {e}')
    
    async def _sync_meeting_to_calendar(self, sync_item: Dict[str, Any]):
        """Sync new meeting to calendar"""
        meeting_data = sync_item['meeting_data']
        meeting_id = sync_item['meeting_id']
        
        try:
            # Create calendar event from meeting data
            calendar_event = self._create_calendar_event_from_meeting(meeting_data)
            
            # Create event in calendar
            provider_event_id = await self.calendar_provider.create_event(calendar_event)
            
            if provider_event_id:
                # Cache the mapping
                self.event_cache[meeting_id] = {
                    'provider_event_id': provider_event_id,
                    'calendar_event': calendar_event
                }
                
                self.context.log('info', f'Created calendar event for meeting {meeting_id}')
                
                # Emit custom event
                self.context.emit_event('calendar.event_created', {
                    'meeting_id': meeting_id,
                    'provider_event_id': provider_event_id,
                    'calendar_provider': self.context.get_config('calendar_provider')
                })
            else:
                self.context.log('error', f'Failed to create calendar event for meeting {meeting_id}')
                
        except Exception as e:
            self.context.log('error', f'Failed to sync meeting {meeting_id} to calendar: {e}')
    
    async def _update_calendar_event(self, sync_item: Dict[str, Any]):
        """Update existing calendar event"""
        meeting_data = sync_item['meeting_data']
        meeting_id = sync_item['meeting_id']
        
        try:
            # Check if we have a calendar event for this meeting
            if meeting_id not in self.event_cache:
                # Create new event if it doesn't exist
                await self._sync_meeting_to_calendar(sync_item)
                return
            
            # Update existing event
            cached_event = self.event_cache[meeting_id]
            provider_event_id = cached_event['provider_event_id']
            
            # Create updated calendar event
            updated_event = self._create_calendar_event_from_meeting(meeting_data)
            
            # Update in calendar
            success = await self.calendar_provider.update_event(provider_event_id, updated_event)
            
            if success:
                # Update cache
                self.event_cache[meeting_id]['calendar_event'] = updated_event
                self.context.log('info', f'Updated calendar event for meeting {meeting_id}')
                
                # Emit custom event
                self.context.emit_event('calendar.event_updated', {
                    'meeting_id': meeting_id,
                    'provider_event_id': provider_event_id
                })
            else:
                self.context.log('error', f'Failed to update calendar event for meeting {meeting_id}')
                
        except Exception as e:
            self.context.log('error', f'Failed to update calendar event for meeting {meeting_id}: {e}')
    
    async def _finalize_calendar_event(self, sync_item: Dict[str, Any]):
        """Finalize calendar event with meeting results"""
        meeting_data = sync_item['meeting_data']
        meeting_id = sync_item['meeting_id']
        
        try:
            if meeting_id in self.event_cache:
                cached_event = self.event_cache[meeting_id]
                provider_event_id = cached_event['provider_event_id']
                calendar_event = cached_event['calendar_event']
                
                # Update description with meeting summary
                meeting_summary = self._generate_meeting_summary(meeting_data)
                calendar_event.description = f"{calendar_event.description}\n\n--- Meeting Summary ---\n{meeting_summary}"
                
                # Update actual end time
                if meeting_data.get('ended_at'):
                    calendar_event.end_time = datetime.fromisoformat(meeting_data['ended_at'])
                
                # Update in calendar
                await self.calendar_provider.update_event(provider_event_id, calendar_event)
                
                self.context.log('info', f'Finalized calendar event for meeting {meeting_id}')
                
        except Exception as e:
            self.context.log('error', f'Failed to finalize calendar event for meeting {meeting_id}: {e}')
    
    def _create_calendar_event_from_meeting(self, meeting_data: Dict[str, Any]) -> CalendarEvent:
        """Create calendar event from meeting data"""
        meeting_id = meeting_data.get('id')
        title = meeting_data.get('title', 'MeetingMind Meeting')
        description = meeting_data.get('description', '')
        
        # Parse times
        start_time = datetime.fromisoformat(meeting_data.get('start_time', datetime.utcnow().isoformat()))
        
        # Calculate end time
        if meeting_data.get('end_time'):
            end_time = datetime.fromisoformat(meeting_data['end_time'])
        elif meeting_data.get('duration_minutes'):
            end_time = start_time + timedelta(minutes=meeting_data['duration_minutes'])
        else:
            end_time = start_time + timedelta(hours=1)  # Default 1 hour
        
        # Convert to configured timezone
        timezone = pytz.timezone(self.context.get_config('timezone', 'UTC'))
        if start_time.tzinfo is None:
            start_time = timezone.localize(start_time)
        if end_time.tzinfo is None:
            end_time = timezone.localize(end_time)
        
        # Get attendees
        attendees = []
        participants = meeting_data.get('participants', [])
        for participant in participants:
            if participant.get('email'):
                attendees.append({
                    'email': participant['email'],
                    'name': participant.get('name', participant['email'])
                })
        
        # Add meeting link to description
        meeting_link = meeting_data.get('meeting_link')
        if meeting_link:
            description += f"\n\nJoin Meeting: {meeting_link}"
        
        return CalendarEvent(
            event_id=f"meetingmind_{meeting_id}",
            title=title,
            description=description,
            start_time=start_time,
            end_time=end_time,
            location=meeting_data.get('location'),
            attendees=attendees,
            meeting_id=meeting_id,
            calendar_provider=self.context.get_config('calendar_provider')
        )
    
    def _generate_meeting_summary(self, meeting_data: Dict[str, Any]) -> str:
        """Generate meeting summary for calendar event"""
        summary_parts = []
        
        # Basic info
        duration = meeting_data.get('duration_minutes', 0)
        summary_parts.append(f"Duration: {duration} minutes")
        
        # Participants
        participants = meeting_data.get('participants', [])
        if participants:
            participant_names = [p.get('name', 'Unknown') for p in participants]
            summary_parts.append(f"Participants: {', '.join(participant_names)}")
        
        # Key insights
        insights = meeting_data.get('insights', [])
        if insights:
            summary_parts.append("\nKey Insights:")
            for insight in insights[:3]:  # Top 3 insights
                summary_parts.append(f"• {insight.get('title', 'Insight')}")
        
        # Action items
        action_items = meeting_data.get('action_items', [])
        if action_items:
            summary_parts.append("\nAction Items:")
            for item in action_items[:5]:  # Top 5 action items
                summary_parts.append(f"• {item.get('description', 'Action item')}")
        
        return "\n".join(summary_parts)
    
    async def _perform_periodic_sync(self):
        """Perform periodic bidirectional sync"""
        try:
            sync_mode = self.context.get_config('sync_mode', 'bidirectional')
            
            if sync_mode in ['bidirectional', 'calendar_to_meetingmind']:
                # Sync calendar events to MeetingMind
                await self._sync_calendar_to_meetingmind()
            
            self.context.emit_event('calendar.sync_completed', {
                'sync_mode': sync_mode,
                'timestamp': datetime.utcnow().isoformat()
            })
            
        except Exception as e:
            self.context.log('error', f'Periodic sync failed: {e}')
    
    async def _sync_calendar_to_meetingmind(self):
        """Sync calendar events to MeetingMind (if supported)"""
        try:
            # Get calendar events for next 7 days
            start_date = datetime.utcnow()
            end_date = start_date + timedelta(days=7)
            
            calendar_events = await self.calendar_provider.get_events(start_date, end_date)
            
            # Process each calendar event
            for cal_event in calendar_events:
                # Check if this is a MeetingMind-originated event
                if cal_event.meeting_id:
                    continue  # Skip our own events
                
                # Create or update MeetingMind meeting from calendar event
                # This would require WRITE_MEETINGS capability and integration with meeting service
                pass
                
        except Exception as e:
            self.context.log('error', f'Failed to sync calendar to MeetingMind: {e}')
    
    def get_api_routes(self) -> List[Dict[str, Any]]:
        """Get API routes provided by this plugin"""
        return [
            {
                'path': '/calendar/sync',
                'method': 'POST',
                'handler': self.manual_sync,
                'description': 'Manually trigger calendar sync'
            },
            {
                'path': '/calendar/auth',
                'method': 'POST',
                'handler': self.authorize_calendar,
                'description': 'Authorize calendar provider'
            },
            {
                'path': '/calendar/events',
                'method': 'GET',
                'handler': self.get_calendar_events,
                'description': 'Get synchronized calendar events'
            }
        ]
    
    async def manual_sync(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Manually trigger calendar sync"""
        meeting_id = request_data.get('meeting_id')
        sync_type = request_data.get('sync_type', 'bidirectional')
        
        try:
            if meeting_id:
                # Sync specific meeting
                await self.sync_queue.put({
                    'type': 'manual_sync',
                    'meeting_id': meeting_id,
                    'sync_type': sync_type
                })
            else:
                # Periodic sync
                await self.sync_queue.put({
                    'type': 'periodic_sync'
                })
            
            return {'success': True, 'message': 'Sync queued'}
        except Exception as e:
            return {'error': str(e)}
    
    async def authorize_calendar(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle calendar authorization"""
        provider = request_data.get('provider')
        auth_code = request_data.get('auth_code')
        
        try:
            # In real implementation, would handle OAuth flow
            # Store credentials securely
            return {
                'success': True,
                'message': f'Successfully authorized {provider} calendar'
            }
        except Exception as e:
            return {'error': str(e)}
    
    async def get_calendar_events(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Get calendar events"""
        try:
            # Parse date range from request
            start_date = datetime.fromisoformat(request_data.get('start_date', datetime.utcnow().isoformat()))
            end_date = datetime.fromisoformat(request_data.get('end_date', (datetime.utcnow() + timedelta(days=7)).isoformat()))
            
            # Get events from calendar provider
            events = await self.calendar_provider.get_events(start_date, end_date)
            
            return {
                'success': True,
                'events': [event.to_dict() for event in events],
                'count': len(events)
            }
        except Exception as e:
            return {'error': str(e)}

# Plugin entry point
Plugin = CalendarIntegrationPlugin