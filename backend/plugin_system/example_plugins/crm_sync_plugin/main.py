# CRM Sync Plugin
# Synchronize meeting data with popular CRM systems

import asyncio
import json
from datetime import datetime
from typing import Dict, List, Any, Optional
import requests
from dataclasses import dataclass

from plugin_system.plugin_api import (
    BasePlugin, PluginManifest, PluginEvent, PluginResult, PluginEventType,
    PluginCapability, PluginPriority, plugin_hook, requires_capability
)

@dataclass
class CRMContact:
    """CRM contact representation"""
    crm_id: str
    email: str
    name: str
    company: Optional[str] = None
    phone: Optional[str] = None
    title: Optional[str] = None
    last_sync: Optional[datetime] = None

@dataclass
class CRMOpportunity:
    """CRM opportunity representation"""
    crm_id: str
    name: str
    stage: str
    value: Optional[float] = None
    close_date: Optional[datetime] = None
    contact_ids: List[str] = None
    meeting_id: Optional[str] = None

class CRMProvider:
    """Base class for CRM providers"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.api_key = config.get('api_key')
        self.api_url = config.get('api_url')
    
    async def authenticate(self) -> bool:
        """Authenticate with CRM"""
        raise NotImplementedError
    
    async def get_contact_by_email(self, email: str) -> Optional[CRMContact]:
        """Get contact by email"""
        raise NotImplementedError
    
    async def create_contact(self, contact_data: Dict[str, Any]) -> CRMContact:
        """Create new contact"""
        raise NotImplementedError
    
    async def update_contact(self, crm_id: str, contact_data: Dict[str, Any]) -> CRMContact:
        """Update existing contact"""
        raise NotImplementedError
    
    async def create_opportunity(self, opportunity_data: Dict[str, Any]) -> CRMOpportunity:
        """Create new opportunity"""
        raise NotImplementedError
    
    async def add_activity(self, contact_id: str, activity_data: Dict[str, Any]) -> bool:
        """Add activity to contact"""
        raise NotImplementedError

class SalesforceProvider(CRMProvider):
    """Salesforce CRM provider"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.instance_url = config.get('instance_url')
        self.access_token = None
    
    async def authenticate(self) -> bool:
        """Authenticate with Salesforce"""
        auth_url = f"{self.instance_url}/services/oauth2/token"
        
        data = {
            'grant_type': 'client_credentials',
            'client_id': self.config.get('client_id'),
            'client_secret': self.config.get('client_secret')
        }
        
        try:
            response = requests.post(auth_url, data=data)
            response.raise_for_status()
            
            auth_data = response.json()
            self.access_token = auth_data.get('access_token')
            return True
        except Exception:
            return False
    
    async def get_contact_by_email(self, email: str) -> Optional[CRMContact]:
        """Get Salesforce contact by email"""
        if not self.access_token:
            await self.authenticate()
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        # Query Salesforce for contact
        query = f"SELECT Id, Email, Name, Company, Phone, Title FROM Contact WHERE Email = '{email}'"
        url = f"{self.instance_url}/services/data/v52.0/query"
        
        try:
            response = requests.get(url, headers=headers, params={'q': query})
            response.raise_for_status()
            
            data = response.json()
            records = data.get('records', [])
            
            if records:
                record = records[0]
                return CRMContact(
                    crm_id=record['Id'],
                    email=record['Email'],
                    name=record['Name'],
                    company=record.get('Company'),
                    phone=record.get('Phone'),
                    title=record.get('Title')
                )
        except Exception:
            pass
        
        return None
    
    async def create_contact(self, contact_data: Dict[str, Any]) -> CRMContact:
        """Create Salesforce contact"""
        if not self.access_token:
            await self.authenticate()
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.instance_url}/services/data/v52.0/sobjects/Contact"
        
        # Map meeting participant data to Salesforce fields
        sf_data = {
            'Email': contact_data.get('email'),
            'FirstName': contact_data.get('first_name', ''),
            'LastName': contact_data.get('last_name', 'Unknown'),
            'Company': contact_data.get('company'),
            'Phone': contact_data.get('phone'),
            'Title': contact_data.get('title')
        }
        
        response = requests.post(url, headers=headers, json=sf_data)
        response.raise_for_status()
        
        result = response.json()
        return CRMContact(
            crm_id=result['id'],
            email=contact_data['email'],
            name=f"{contact_data.get('first_name', '')} {contact_data.get('last_name', 'Unknown')}".strip(),
            company=contact_data.get('company'),
            phone=contact_data.get('phone'),
            title=contact_data.get('title')
        )
    
    async def add_activity(self, contact_id: str, activity_data: Dict[str, Any]) -> bool:
        """Add activity to Salesforce contact"""
        if not self.access_token:
            await self.authenticate()
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.instance_url}/services/data/v52.0/sobjects/Task"
        
        task_data = {
            'WhoId': contact_id,
            'Subject': activity_data.get('subject', 'Meeting Activity'),
            'Description': activity_data.get('description'),
            'ActivityDate': activity_data.get('date', datetime.now().date().isoformat()),
            'Status': 'Completed',
            'Type': 'Meeting'
        }
        
        try:
            response = requests.post(url, headers=headers, json=task_data)
            response.raise_for_status()
            return True
        except Exception:
            return False

class HubSpotProvider(CRMProvider):
    """HubSpot CRM provider"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.base_url = "https://api.hubapi.com"
    
    async def authenticate(self) -> bool:
        """HubSpot uses API key authentication"""
        return bool(self.api_key)
    
    async def get_contact_by_email(self, email: str) -> Optional[CRMContact]:
        """Get HubSpot contact by email"""
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.base_url}/crm/v3/objects/contacts/search"
        
        search_data = {
            'filterGroups': [{
                'filters': [{
                    'propertyName': 'email',
                    'operator': 'EQ',
                    'value': email
                }]
            }],
            'properties': ['email', 'firstname', 'lastname', 'company', 'phone', 'jobtitle']
        }
        
        try:
            response = requests.post(url, headers=headers, json=search_data)
            response.raise_for_status()
            
            data = response.json()
            results = data.get('results', [])
            
            if results:
                contact = results[0]
                props = contact.get('properties', {})
                
                return CRMContact(
                    crm_id=contact['id'],
                    email=props.get('email'),
                    name=f"{props.get('firstname', '')} {props.get('lastname', '')}".strip(),
                    company=props.get('company'),
                    phone=props.get('phone'),
                    title=props.get('jobtitle')
                )
        except Exception:
            pass
        
        return None
    
    async def create_contact(self, contact_data: Dict[str, Any]) -> CRMContact:
        """Create HubSpot contact"""
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.base_url}/crm/v3/objects/contacts"
        
        hubspot_data = {
            'properties': {
                'email': contact_data.get('email'),
                'firstname': contact_data.get('first_name'),
                'lastname': contact_data.get('last_name'),
                'company': contact_data.get('company'),
                'phone': contact_data.get('phone'),
                'jobtitle': contact_data.get('title')
            }
        }
        
        response = requests.post(url, headers=headers, json=hubspot_data)
        response.raise_for_status()
        
        result = response.json()
        return CRMContact(
            crm_id=result['id'],
            email=contact_data['email'],
            name=f"{contact_data.get('first_name', '')} {contact_data.get('last_name', '')}".strip(),
            company=contact_data.get('company'),
            phone=contact_data.get('phone'),
            title=contact_data.get('title')
        )

class CRMSyncPlugin(BasePlugin):
    """Main CRM synchronization plugin"""
    
    def __init__(self, context):
        super().__init__(context)
        self.crm_provider = None
        self.sync_queue = asyncio.Queue()
        self.contact_cache = {}
        self.sync_task = None
    
    def get_manifest(self) -> PluginManifest:
        """Return plugin manifest"""
        # Load from manifest.json file
        import json
        import os
        
        manifest_path = os.path.join(os.path.dirname(__file__), 'manifest.json')
        with open(manifest_path, 'r') as f:
            manifest_data = json.load(f)
        
        from plugin_system.plugin_api import create_plugin_manifest
        return create_plugin_manifest(**manifest_data)
    
    async def initialize(self) -> bool:
        """Initialize the plugin"""
        try:
            # Setup CRM provider
            await self._setup_crm_provider()
            
            # Start background sync task
            self.sync_task = asyncio.create_task(self._background_sync_worker())
            
            self.context.log('info', 'CRM Sync plugin initialized successfully')
            return True
        except Exception as e:
            self.context.log('error', f'Failed to initialize CRM Sync plugin: {e}')
            return False
    
    async def cleanup(self):
        """Cleanup plugin resources"""
        if self.sync_task:
            self.sync_task.cancel()
            try:
                await self.sync_task
            except asyncio.CancelledError:
                pass
        
        self.context.log('info', 'CRM Sync plugin cleaned up')
    
    async def _setup_crm_provider(self):
        """Setup CRM provider based on configuration"""
        crm_type = self.context.get_config('crm_provider')
        
        if crm_type == 'salesforce':
            self.crm_provider = SalesforceProvider(self.context.get_config())
        elif crm_type == 'hubspot':
            self.crm_provider = HubSpotProvider(self.context.get_config())
        else:
            raise ValueError(f"Unsupported CRM provider: {crm_type}")
        
        # Test authentication
        if not await self.crm_provider.authenticate():
            raise Exception("Failed to authenticate with CRM provider")
    
    @plugin_hook(PluginEventType.MEETING_ENDED, PluginPriority.NORMAL)
    @requires_capability(PluginCapability.READ_MEETINGS)
    async def on_meeting_ended(self, event: PluginEvent) -> PluginResult:
        """Handle meeting ended event"""
        try:
            meeting_data = event.data
            meeting_id = meeting_data.get('id')
            
            self.context.log('info', f'Processing meeting end for CRM sync: {meeting_id}')
            
            # Queue for background processing
            await self.sync_queue.put({
                'type': 'meeting_ended',
                'meeting_id': meeting_id,
                'meeting_data': meeting_data
            })
            
            return PluginResult.success_result({
                'message': 'Meeting queued for CRM sync'
            })
        except Exception as e:
            self.context.log('error', f'Error handling meeting ended event: {e}')
            return PluginResult.error_result(str(e))
    
    @plugin_hook(PluginEventType.INSIGHTS_GENERATED, PluginPriority.LOW)
    @requires_capability(PluginCapability.READ_INSIGHTS)
    async def on_insights_generated(self, event: PluginEvent) -> PluginResult:
        """Handle insights generated event"""
        try:
            insights_data = event.data
            meeting_id = event.meeting_id
            
            # Queue insights for CRM sync
            await self.sync_queue.put({
                'type': 'insights_generated',
                'meeting_id': meeting_id,
                'insights_data': insights_data
            })
            
            return PluginResult.success_result()
        except Exception as e:
            return PluginResult.error_result(str(e))
    
    @plugin_hook(PluginEventType.ACTION_ITEM_CREATED, PluginPriority.LOW)
    async def on_action_item_created(self, event: PluginEvent) -> PluginResult:
        """Handle action item created event"""
        try:
            action_item_data = event.data
            
            # Queue action item for CRM sync
            await self.sync_queue.put({
                'type': 'action_item_created',
                'action_item_data': action_item_data
            })
            
            return PluginResult.success_result()
        except Exception as e:
            return PluginResult.error_result(str(e))
    
    async def _background_sync_worker(self):
        """Background worker for processing CRM sync queue"""
        while True:
            try:
                # Get next item from queue
                sync_item = await self.sync_queue.get()
                
                # Process based on type
                if sync_item['type'] == 'meeting_ended':
                    await self._sync_meeting_to_crm(sync_item)
                elif sync_item['type'] == 'insights_generated':
                    await self._sync_insights_to_crm(sync_item)
                elif sync_item['type'] == 'action_item_created':
                    await self._sync_action_item_to_crm(sync_item)
                
                # Mark task as done
                self.sync_queue.task_done()
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.context.log('error', f'Error in background sync worker: {e}')
                # Continue processing
    
    async def _sync_meeting_to_crm(self, sync_item: Dict[str, Any]):
        """Sync meeting data to CRM"""
        meeting_data = sync_item['meeting_data']
        meeting_id = sync_item['meeting_id']
        
        try:
            # Get meeting participants
            participants = meeting_data.get('participants', [])
            
            # Process each participant
            for participant in participants:
                email = participant.get('email')
                if not email:
                    continue
                
                # Check if contact exists in CRM
                contact = await self.crm_provider.get_contact_by_email(email)
                
                if not contact:
                    # Create new contact
                    contact_data = {
                        'email': email,
                        'first_name': participant.get('first_name', ''),
                        'last_name': participant.get('last_name', 'Unknown'),
                        'company': participant.get('company'),
                        'phone': participant.get('phone')
                    }
                    
                    contact = await self.crm_provider.create_contact(contact_data)
                    self.context.log('info', f'Created new CRM contact: {contact.email}')
                    
                    # Emit custom event
                    self.context.emit_event('crm.contact_created', {
                        'contact_id': contact.crm_id,
                        'email': contact.email,
                        'meeting_id': meeting_id
                    })
                
                # Add meeting activity to contact
                activity_data = {
                    'subject': f"Meeting: {meeting_data.get('title', 'MeetingMind Meeting')}",
                    'description': self._generate_meeting_summary(meeting_data),
                    'date': meeting_data.get('ended_at', datetime.now().isoformat())
                }
                
                await self.crm_provider.add_activity(contact.crm_id, activity_data)
                
                # Cache contact
                self.contact_cache[email] = contact
            
            # Create opportunity if configured
            if self.context.get_config('opportunity_creation', False):
                await self._create_opportunity_from_meeting(meeting_data)
            
            self.context.log('info', f'Successfully synced meeting {meeting_id} to CRM')
            
        except Exception as e:
            self.context.log('error', f'Failed to sync meeting {meeting_id} to CRM: {e}')
    
    def _generate_meeting_summary(self, meeting_data: Dict[str, Any]) -> str:
        """Generate meeting summary for CRM activity"""
        summary_parts = []
        
        # Basic meeting info
        title = meeting_data.get('title', 'MeetingMind Meeting')
        duration = meeting_data.get('duration_minutes', 0)
        summary_parts.append(f"Meeting: {title}")
        summary_parts.append(f"Duration: {duration} minutes")
        
        # Participants
        participants = meeting_data.get('participants', [])
        if participants:
            participant_names = [p.get('name', 'Unknown') for p in participants]
            summary_parts.append(f"Participants: {', '.join(participant_names)}")
        
        # Key topics or insights
        insights = meeting_data.get('insights', [])
        if insights:
            summary_parts.append("\nKey Insights:")
            for insight in insights[:3]:  # Top 3 insights
                summary_parts.append(f"- {insight.get('title', 'Insight')}")
        
        return "\n".join(summary_parts)
    
    async def _sync_insights_to_crm(self, sync_item: Dict[str, Any]):
        """Sync insights to CRM as notes or activities"""
        try:
            meeting_id = sync_item.get('meeting_id')
            insights_data = sync_item.get('insights_data', [])
            
            if not self.crm_provider:
                self.context.log('warning', 'No CRM provider configured')
                return
            
            # Get meeting participants to find CRM contacts
            meeting_data = await self.context.get_meeting_data(meeting_id)
            participants = meeting_data.get('participants', [])
            
            # For each insight, create activities in CRM
            for insight in insights_data:
                insight_text = f"Meeting Insight: {insight.get('title', 'Untitled')}\n"
                insight_text += f"Description: {insight.get('description', '')}\n"
                insight_text += f"Confidence: {insight.get('confidence', 0)}%\n"
                insight_text += f"Generated: {insight.get('timestamp', '')}"
                
                # Find CRM contacts for participants
                for participant in participants:
                    email = participant.get('email')
                    if email:
                        contact = await self.crm_provider.get_contact_by_email(email)
                        if contact:
                            # Add insight as activity to the contact
                            activity_data = {
                                'subject': f"Meeting Insight: {insight.get('title', 'Untitled')}",
                                'description': insight_text,
                                'activity_type': 'Note',
                                'meeting_id': meeting_id,
                                'insight_id': insight.get('id'),
                                'created_date': datetime.now().isoformat()
                            }
                            
                            await self.crm_provider.add_activity(contact.crm_id, activity_data)
                            self.context.log('info', f'Synced insight to CRM contact: {email}')
                        
        except Exception as e:
            self.context.log('error', f'Error syncing insights to CRM: {e}')
    
    async def _sync_action_item_to_crm(self, sync_item: Dict[str, Any]):
        """Sync action items to CRM as tasks"""
        try:
            action_item_data = sync_item.get('action_item_data', {})
            meeting_id = sync_item.get('meeting_id')
            
            if not self.crm_provider:
                self.context.log('warning', 'No CRM provider configured')
                return
            
            # Extract action item details
            title = action_item_data.get('title', 'Action Item')
            description = action_item_data.get('description', '')
            assignee_email = action_item_data.get('assignee_email')
            due_date = action_item_data.get('due_date')
            priority = action_item_data.get('priority', 'medium')
            
            # Find assignee contact in CRM
            assignee_contact = None
            if assignee_email:
                assignee_contact = await self.crm_provider.get_contact_by_email(assignee_email)
            
            if assignee_contact:
                # Create task/activity in CRM
                task_data = {
                    'subject': f"Action Item: {title}",
                    'description': f"{description}\n\nFrom meeting: {meeting_id}",
                    'activity_type': 'Task',
                    'status': 'Open',
                    'priority': priority.capitalize(),
                    'due_date': due_date,
                    'meeting_id': meeting_id,
                    'action_item_id': action_item_data.get('id'),
                    'created_date': datetime.now().isoformat()
                }
                
                await self.crm_provider.add_activity(assignee_contact.crm_id, task_data)
                self.context.log('info', f'Synced action item to CRM contact: {assignee_email}')
            else:
                # If no assignee contact found, log warning
                self.context.log('warning', f'No CRM contact found for assignee: {assignee_email}')
                
                # Optionally sync to all meeting participants
                meeting_data = await self.context.get_meeting_data(meeting_id)
                participants = meeting_data.get('participants', [])
                
                for participant in participants[:1]:  # Just first participant as fallback
                    email = participant.get('email')
                    if email:
                        contact = await self.crm_provider.get_contact_by_email(email)
                        if contact:
                            task_data = {
                                'subject': f"Action Item (Unassigned): {title}",
                                'description': f"{description}\n\nOriginal assignee: {assignee_email}\nFrom meeting: {meeting_id}",
                                'activity_type': 'Task',
                                'status': 'Open',
                                'priority': priority.capitalize(),
                                'due_date': due_date,
                                'meeting_id': meeting_id,
                                'action_item_id': action_item_data.get('id'),
                                'created_date': datetime.now().isoformat()
                            }
                            
                            await self.crm_provider.add_activity(contact.crm_id, task_data)
                            self.context.log('info', f'Synced unassigned action item to participant: {email}')
                            break
                        
        except Exception as e:
            self.context.log('error', f'Error syncing action item to CRM: {e}')
    
    async def _create_opportunity_from_meeting(self, meeting_data: Dict[str, Any]):
        """Create CRM opportunity from meeting data"""
        try:
            if not self.crm_provider:
                self.context.log('warning', 'No CRM provider configured')
                return
            
            meeting_id = meeting_data.get('id')
            meeting_title = meeting_data.get('title', 'Untitled Meeting')
            participants = meeting_data.get('participants', [])
            
            # Check if meeting has indicators for sales opportunity
            # Look for keywords in meeting content that suggest sales opportunity
            meeting_summary = meeting_data.get('summary', '')
            insights = meeting_data.get('insights', [])
            
            # Keywords that suggest this might be a sales opportunity
            opportunity_keywords = [
                'proposal', 'quote', 'pricing', 'budget', 'purchase', 'buy', 'sell',
                'contract', 'deal', 'negotiation', 'decision', 'timeline', 'next steps',
                'investment', 'cost', 'value', 'solution', 'requirements'
            ]
            
            # Check if meeting content suggests an opportunity
            content_text = f"{meeting_title} {meeting_summary}".lower()
            has_opportunity_indicators = any(keyword in content_text for keyword in opportunity_keywords)
            
            # Also check insights for sales-related content
            for insight in insights:
                insight_text = f"{insight.get('title', '')} {insight.get('description', '')}".lower()
                if any(keyword in insight_text for keyword in opportunity_keywords):
                    has_opportunity_indicators = True
                    break
            
            if not has_opportunity_indicators:
                self.context.log('info', f'Meeting {meeting_id} does not appear to be sales-related')
                return
            
            # Find primary contact (first external participant)
            primary_contact = None
            contact_ids = []
            
            for participant in participants:
                email = participant.get('email')
                if email:
                    contact = await self.crm_provider.get_contact_by_email(email)
                    if contact:
                        contact_ids.append(contact.crm_id)
                        if not primary_contact:
                            primary_contact = contact
            
            if not primary_contact:
                self.context.log('warning', f'No CRM contacts found for meeting participants')
                return
            
            # Extract opportunity details from meeting
            opportunity_name = f"{meeting_title} - {primary_contact.company or primary_contact.name}"
            
            # Estimate opportunity value based on meeting content (simplified logic)
            estimated_value = None
            if 'enterprise' in content_text or 'large' in content_text:
                estimated_value = 50000
            elif 'small' in content_text or 'startup' in content_text:
                estimated_value = 10000
            else:
                estimated_value = 25000  # Default estimate
            
            # Determine stage based on meeting content
            stage = 'Qualification'
            if 'proposal' in content_text or 'quote' in content_text:
                stage = 'Proposal'
            elif 'negotiation' in content_text or 'contract' in content_text:
                stage = 'Negotiation'
            elif 'decision' in content_text or 'close' in content_text:
                stage = 'Closing'
            
            # Set close date (30-90 days from now based on stage)
            from datetime import timedelta
            days_to_close = {'Qualification': 90, 'Proposal': 60, 'Negotiation': 30, 'Closing': 14}
            close_date = datetime.now() + timedelta(days=days_to_close.get(stage, 60))
            
            # Create opportunity
            opportunity_data = {
                'name': opportunity_name,
                'stage': stage,
                'value': estimated_value,
                'close_date': close_date.isoformat(),
                'contact_ids': contact_ids,
                'meeting_id': meeting_id,
                'description': f"Opportunity created from meeting: {meeting_title}\n\nSummary: {meeting_summary}",
                'source': 'Meeting',
                'created_date': datetime.now().isoformat()
            }
            
            opportunity = await self.crm_provider.create_opportunity(opportunity_data)
            self.context.log('info', f'Created CRM opportunity: {opportunity.name} (ID: {opportunity.crm_id})')
            
            # Add meeting summary as activity to the opportunity
            activity_data = {
                'subject': f"Meeting Notes: {meeting_title}",
                'description': f"Meeting Summary:\n{meeting_summary}\n\nParticipants: {', '.join([p.get('name', p.get('email', 'Unknown')) for p in participants])}",
                'activity_type': 'Meeting',
                'meeting_id': meeting_id,
                'created_date': datetime.now().isoformat()
            }
            
            # Add activity to primary contact
            await self.crm_provider.add_activity(primary_contact.crm_id, activity_data)
            
        except Exception as e:
            self.context.log('error', f'Error creating opportunity from meeting: {e}')
    
    def get_api_routes(self) -> List[Dict[str, Any]]:
        """Get API routes provided by this plugin"""
        return [
            {
                'path': '/crm/sync',
                'method': 'POST',
                'handler': self.manual_sync,
                'description': 'Manually trigger CRM sync'
            },
            {
                'path': '/crm/status',
                'method': 'GET',
                'handler': self.get_sync_status,
                'description': 'Get CRM sync status'
            }
        ]
    
    async def manual_sync(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Manually trigger CRM sync"""
        meeting_id = request_data.get('meeting_id')
        if not meeting_id:
            return {'error': 'meeting_id required'}
        
        # Queue meeting for sync
        await self.sync_queue.put({
            'type': 'manual_sync',
            'meeting_id': meeting_id
        })
        
        return {'success': True, 'message': 'Sync queued'}
    
    async def get_sync_status(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Get CRM sync status"""
        return {
            'provider': self.context.get_config('crm_provider'),
            'queue_size': self.sync_queue.qsize(),
            'cached_contacts': len(self.contact_cache),
            'last_sync': datetime.now().isoformat()
        }

# Plugin entry point
Plugin = CRMSyncPlugin