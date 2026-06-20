# django_backend/api/management/commands/run_workers.py
import time
from django.core.management.base import BaseCommand
from django.utils import timezone
from api.models import User, Lead, LeadGenerationJob, LeadEnrichmentJob, LeadVerificationJob, UsageLog
from api.services.lead_sources import GooglePlacesSource, OSMOverpassSource
from api.services.enrichment import crawl_and_enrich_lead
from api.services.verification import verify_lead_email
from api.services.deduplication import check_duplicate_exists, generate_duplicate_key
from api.services.scoring import calculate_lead_score

class Command(BaseCommand):
    help = 'Runs background worker processes to handle generation, enrichment, and verification jobs.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Background workers successfully spawned and polling...'))
        
        while True:
            try:
                # 1. Process Generation Jobs
                self.process_generation_jobs()
                
                # 2. Process Enrichment Jobs
                self.process_enrichment_jobs()
                
                # 3. Process Verification Jobs
                self.process_verification_jobs()
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Worker iteration loop error: {e}"))
                
            time.sleep(2)

    def process_generation_jobs(self):
        jobs = LeadGenerationJob.objects.filter(status__in=['pending', 'running']).order_by('created_at')
        for job in jobs:
            if job.status == 'pending':
                job.status = 'running'
                job.started_at = timezone.now()
                job.save(update_fields=['status', 'started_at'])
                
            self.stdout.write(f"Processing Generation Job #{job.id} for user {job.user.email}...")
            
            try:
                # Determine limit & source
                limit = job.requested_limit
                source_mode = job.source_mode
                plan_name = job.user.plan.lower()
                
                # Check plans & quotas
                from datetime import datetime
                this_month = datetime.now().strftime('%Y-%m')
                
                # Dynamic plan leadGen limit checks
                plan_limits = {
                    'free': 10,
                    'starter': 500,
                    'pro': 2500,
                    'agency': 10000,
                    'admin': -1
                }
                
                max_leads_allowed = plan_limits.get(plan_name, 25)
                
                # Sync month count
                if job.user.leads_generated_month != this_month:
                    job.user.leads_generated_count = 0
                    job.user.leads_generated_month = this_month
                    job.user.save(update_fields=['leads_generated_count', 'leads_generated_month'])
                    
                current_usage = job.user.leads_generated_count
                
                if max_leads_allowed != -1 and current_usage >= max_leads_allowed:
                    raise Exception(f"Monthly quota limit reached. Your plan allows max {max_leads_allowed} leads per month.")
                
                if max_leads_allowed != -1 and current_usage + limit > max_leads_allowed:
                    limit = max_leads_allowed - current_usage
                    
                # Initialize source engine
                google_key = getattr(job.user, 'google_places_api_key', None) or getattr(job.user, 'hash', None)
                # Fallback to general system env key
                import os
                google_key = google_key or os.environ.get('GOOGLE_PLACES_API_KEY')
                
                # Rules:
                # - Free plan: OSM only
                # - Other plans: OSM default, Google Places premium only if requested or fallback
                engine = OSMOverpassSource()
                
                if plan_name != 'free':
                    if source_mode == 'google' and google_key:
                        engine = GooglePlacesSource(google_key)
                    elif source_mode == 'auto' and google_key:
                        # Auto mode: try Google Places first, fall back to OSM
                        engine = GooglePlacesSource(google_key)
                
                # Fetch raw lead objects
                raw_leads = engine.fetch_leads(job.category, job.location, limit)
                
                # Fallback to OSM if Google Places returns 0 or fails
                if not raw_leads and plan_name != 'free' and source_mode != 'osm':
                    self.stdout.write("Premium source returned 0 results. Falling back to OSM Overpass.")
                    engine = OSMOverpassSource()
                    raw_leads = engine.fetch_leads(job.category, job.location, limit)
                
                job.total_items = len(raw_leads)
                job.save(update_fields=['total_items'])
                
                if job.total_items == 0:
                    job.status = 'completed'
                    job.progress_percentage = 100
                    job.completed_at = timezone.now()
                    job.save(update_fields=['status', 'progress_percentage', 'completed_at'])
                    continue
                
                inserted_count = 0
                failed_count = 0
                
                for idx, item in enumerate(raw_leads):
                    try:
                        # Check cancellation status mid-job
                        job.refresh_from_db()
                        if job.status == 'cancelled':
                            self.stdout.write(f"Generation Job #{job.id} was cancelled by user.")
                            return

                        # Deduplicate lead
                        is_dup = check_duplicate_exists(
                            user=job.user,
                            business_name=item['businessName'],
                            phone=item['phone'],
                            website=item['website'],
                            city=item['city'],
                            email=item['email'],
                            source_id=item['sourceId']
                        )
                        
                        dup_key = generate_duplicate_key(
                            item['businessName'],
                            item['phone'],
                            item['website'],
                            item['city']
                        )
                        
                        # Populate Lead Model
                        lead = Lead(
                            user=job.user,
                            business_name=item['businessName'],
                            owner_name=item['ownerName'],
                            email=item['email'],
                            phone=item['phone'],
                            website=item['website'],
                            address=item['address'],
                            city=item['city'],
                            country=item['country'],
                            category=item['category'],
                            rating=str(item['rating']) if item['rating'] is not None else '',
                            source=item['source'],
                            source_id=item['sourceId'],
                            latitude=item['latitude'],
                            longitude=item['longitude'],
                            duplicate_key=dup_key,
                            raw_data=item['rawData']
                        )
                        
                        # Apply score
                        lead.lead_score = calculate_lead_score(lead, has_duplicate=is_dup)
                        
                        # Default email statuses
                        if lead.email:
                            lead.email_status = 'unknown'
                            lead.email_confidence = item.get('confidenceScore', 30)
                        else:
                            lead.email_status = 'unknown'
                            lead.email_confidence = 0
                            
                        lead.save()
                        inserted_count += 1
                        
                    except Exception as e:
                        print("Failed to save single lead:", e)
                        failed_count += 1
                        
                    # Update progress
                    job.processed_items = idx + 1
                    job.failed_items = failed_count
                    job.progress_percentage = int(((idx + 1) / job.total_items) * 100)
                    job.save(update_fields=['processed_items', 'failed_items', 'progress_percentage'])
                
                # Lock usage count in DB
                if inserted_count > 0:
                    job.user.leads_generated_count += inserted_count
                    job.user.save(update_fields=['leads_generated_count'])
                    
                    # Log Usage
                    UsageLog.objects.create(
                        user=job.user,
                        month=this_month,
                        action_type='generate',
                        count=inserted_count,
                        plan_name=plan_name
                    )
                
                job.status = 'completed'
                job.completed_at = timezone.now()
                job.save(update_fields=['status', 'completed_at'])
                self.stdout.write(self.style.SUCCESS(f"Finished Generation Job #{job.id}. Saved {inserted_count} leads."))
                
            except Exception as ex:
                job.status = 'failed'
                job.error_message = str(ex)
                job.completed_at = timezone.now()
                job.save(update_fields=['status', 'error_message', 'completed_at'])
                self.stdout.write(self.style.ERROR(f"Generation Job #{job.id} failed: {ex}"))

    def process_enrichment_jobs(self):
        jobs = LeadEnrichmentJob.objects.filter(status__in=['pending', 'running']).order_by('created_at')
        for job in jobs:
            if job.status == 'pending':
                job.status = 'running'
                job.started_at = timezone.now()
                job.save(update_fields=['status', 'started_at'])
                
            self.stdout.write(f"Processing Enrichment Job #{job.id}...")
            
            try:
                lead_ids = job.lead_ids
                job.total_items = len(lead_ids)
                job.save(update_fields=['total_items'])
                
                if job.total_items == 0:
                    job.status = 'completed'
                    job.progress_percentage = 100
                    job.completed_at = timezone.now()
                    job.save(update_fields=['status', 'progress_percentage', 'completed_at'])
                    continue

                processed = 0
                failed = 0
                
                for idx, lead_id in enumerate(lead_ids):
                    try:
                        # Check cancellation mid-job
                        job.refresh_from_db()
                        if job.status == 'cancelled':
                            self.stdout.write(f"Enrichment Job #{job.id} was cancelled by user.")
                            return

                        lead = Lead.objects.filter(id=lead_id, user=job.user).first()
                        if lead:
                            # Skip if no website URL
                            if not lead.website:
                                lead.enrichment_status = 'failed'
                                lead.save(update_fields=['enrichment_status'])
                                failed += 1
                            else:
                                crawl_and_enrich_lead(lead)
                                processed += 1
                        else:
                            failed += 1
                    except Exception:
                        failed += 1
                        
                    job.processed_items = idx + 1
                    job.failed_items = failed
                    job.progress_percentage = int(((idx + 1) / job.total_items) * 100)
                    job.save(update_fields=['processed_items', 'failed_items', 'progress_percentage'])
                
                # Log usage
                if processed > 0:
                    this_month = timezone.now().strftime('%Y-%m')
                    UsageLog.objects.create(
                        user=job.user,
                        month=this_month,
                        action_type='enrich',
                        count=processed,
                        plan_name=job.user.plan
                    )

                job.status = 'completed'
                job.completed_at = timezone.now()
                job.save(update_fields=['status', 'completed_at'])
                self.stdout.write(self.style.SUCCESS(f"Finished Enrichment Job #{job.id}."))
                
            except Exception as ex:
                job.status = 'failed'
                job.error_message = str(ex)
                job.completed_at = timezone.now()
                job.save(update_fields=['status', 'error_message', 'completed_at'])

    def process_verification_jobs(self):
        jobs = LeadVerificationJob.objects.filter(status__in=['pending', 'running']).order_by('created_at')
        for job in jobs:
            if job.status == 'pending':
                job.status = 'running'
                job.started_at = timezone.now()
                job.save(update_fields=['status', 'started_at'])
                
            self.stdout.write(f"Processing Verification Job #{job.id}...")
            
            try:
                lead_ids = job.lead_ids
                job.total_items = len(lead_ids)
                job.save(update_fields=['total_items'])
                
                if job.total_items == 0:
                    job.status = 'completed'
                    job.progress_percentage = 100
                    job.completed_at = timezone.now()
                    job.save(update_fields=['status', 'progress_percentage', 'completed_at'])
                    continue

                processed = 0
                failed = 0
                
                for idx, lead_id in enumerate(lead_ids):
                    try:
                        # Check cancellation mid-job
                        job.refresh_from_db()
                        if job.status == 'cancelled':
                            self.stdout.write(f"Verification Job #{job.id} was cancelled by user.")
                            return

                        lead = Lead.objects.filter(id=lead_id, user=job.user).first()
                        if lead:
                            if not lead.email:
                                lead.verification_status = 'failed'
                                lead.save(update_fields=['verification_status'])
                                failed += 1
                            else:
                                verify_lead_email(lead)
                                processed += 1
                        else:
                            failed += 1
                    except Exception:
                        failed += 1
                        
                    job.processed_items = idx + 1
                    job.failed_items = failed
                    job.progress_percentage = int(((idx + 1) / job.total_items) * 100)
                    job.save(update_fields=['processed_items', 'failed_items', 'progress_percentage'])
                
                # Log usage
                if processed > 0:
                    this_month = timezone.now().strftime('%Y-%m')
                    UsageLog.objects.create(
                        user=job.user,
                        month=this_month,
                        action_type='verify',
                        count=processed,
                        plan_name=job.user.plan
                    )

                job.status = 'completed'
                job.completed_at = timezone.now()
                job.save(update_fields=['status', 'completed_at'])
                self.stdout.write(self.style.SUCCESS(f"Finished Verification Job #{job.id}."))
                
            except Exception as ex:
                job.status = 'failed'
                job.error_message = str(ex)
                job.completed_at = timezone.now()
                job.save(update_fields=['status', 'error_message', 'completed_at'])
