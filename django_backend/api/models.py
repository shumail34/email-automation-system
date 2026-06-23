from django.db import models
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    email = models.EmailField(unique=True)
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    plan = models.CharField(max_length=50, default='free')
    emailLimit = models.IntegerField(default=50)
    dailyLimit = models.IntegerField(default=50)
    monthlyLimit = models.IntegerField(default=1500)
    templateLimit = models.IntegerField(default=1)
    teamLimit = models.IntegerField(default=0)
    attachments = models.BooleanField(default=False)
    expiresAt = models.CharField(max_length=50, default='2099-12-31')
    isMember = models.BooleanField(default=False)
    owner = models.EmailField(blank=True, null=True)
    hash = models.CharField(max_length=255, blank=True, null=True)
    emails_sent_count = models.IntegerField(default=0)
    emails_sent_month = models.CharField(max_length=7, default='')  # e.g. '2026-06'
    leads_generated_count = models.IntegerField(default=0)
    leads_generated_month = models.CharField(max_length=7, default='')  # e.g. '2026-06'

    def save(self, *args, **kwargs):
        p = self.plan.lower()
        if p == 'starter':
            self.emailLimit = 500
            self.dailyLimit = 2000
            self.monthlyLimit = 60000
            self.templateLimit = 5
            self.attachments = True
        elif p == 'pro':
            self.emailLimit = -1
            self.dailyLimit = -1
            self.monthlyLimit = -1
            self.templateLimit = -1
            self.attachments = True
        elif p == 'agency':
            self.emailLimit = -1
            self.dailyLimit = -1
            self.monthlyLimit = -1
            self.templateLimit = -1
            self.teamLimit = -1
            self.attachments = True
        elif p == 'admin':
            self.emailLimit = -1
            self.dailyLimit = -1
            self.monthlyLimit = -1
            self.templateLimit = -1
            self.teamLimit = -1
            self.attachments = True
        else: # free
            self.emailLimit = 50
            self.dailyLimit = 50
            self.monthlyLimit = 1500
            self.templateLimit = 1
            self.attachments = False

        super().save(*args, **kwargs)

class Campaign(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='campaigns')
    date = models.DateTimeField(auto_now_add=True)
    leads = models.IntegerField()
    success = models.IntegerField()
    failed = models.IntegerField()
    subject = models.CharField(max_length=255)

class SystemConfig(models.Model):
    host = models.CharField(max_length=255)
    port = models.CharField(max_length=50)
    smtp_user = models.CharField(max_length=255)
    smtp_pass = models.CharField(max_length=255)
    senderName = models.CharField(max_length=255)
    updatedAt = models.DateTimeField(auto_now=True)

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

class Payment(models.Model):
    email = models.EmailField()
    plan = models.CharField(max_length=50)
    amount = models.CharField(max_length=50)
    date = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, default='pending')
    proof = models.TextField(blank=True, null=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._original_status = self.status

    def save(self, *args, **kwargs):
        if self.pk and self._original_status == 'pending' and self.status in ['accepted', 'rejected']:
            config = SystemConfig.objects.last()
            if config and config.smtp_user and config.smtp_pass:
                try:
                    import email.utils
                    domain = 'outreachpro.com'
                    if config.smtp_user and '@' in config.smtp_user:
                        domain = config.smtp_user.split('@')[1]

                    msg = MIMEMultipart('alternative')
                    msg['From'] = f"{config.senderName or 'OutreachPro'} <{config.smtp_user}>"
                    msg['To'] = self.email
                    
                    # Professional deliverability headers
                    msg['Date'] = email.utils.formatdate(localtime=True)
                    msg['Message-ID'] = email.utils.make_msgid(domain=domain)
                    msg['MIME-Version'] = '1.0'
                    msg['X-Auto-Response-Suppress'] = 'All'
                    msg['Auto-Submitted'] = 'auto-generated'
                    
                    if self.status == 'accepted':
                        msg['Subject'] = "OutreachPro - Payment Approved & Plan Upgraded"
                        text = f"Your payment has been successfully verified!\nYou have been upgraded to the {self.plan.upper()} plan.\nLog in to your dashboard to enjoy your new features."
                        html = f"""<div style="font-family:sans-serif; padding:20px; color:#1e293b;">
                            <h2 style="color:#10b981;">Payment Verified!</h2>
                            <p>Your payment has been successfully verified.</p>
                            <p>You have been upgraded to the <strong>{self.plan.upper()}</strong> plan!</p>
                            <p>Log in to your dashboard to enjoy your new features.</p>
                          </div>"""
                        # Auto-upgrade logic
                        user = User.objects.filter(email__iexact=self.email).first()
                        if user:
                            user.plan = self.plan.lower()
                            user.save() # trigger the overridden save to update limits
                    elif self.status == 'rejected':
                        msg['Subject'] = "OutreachPro - Payment Rejected"
                        text = f"We could not verify your payment proof for the {self.plan.upper()} plan.\nPlease double check your transaction ID and resubmit, or contact our support team."
                        html = f"""<div style="font-family:sans-serif; padding:20px; color:#1e293b;">
                            <h2 style="color:#ef4444;">Payment Rejected</h2>
                            <p>We could not verify your payment proof for the <strong>{self.plan.upper()}</strong> plan.</p>
                            <p>Please double check your transaction ID and resubmit, or contact our support team.</p>
                          </div>"""
                    
                    msg.attach(MIMEText(text, 'plain', 'utf-8'))
                    msg.attach(MIMEText(html, 'html', 'utf-8'))
                    
                    port = int(config.port) if config.port else 465
                    if port == 465:
                        server = smtplib.SMTP_SSL(config.host, port, timeout=15)
                    else:
                        server = smtplib.SMTP(config.host, port, timeout=15)
                        server.starttls()
                        
                    server.login(config.smtp_user, config.smtp_pass)
                    server.send_message(msg)
                    server.quit()
                except Exception as e:
                    print("Failed to send payment notification email:", e)

        super().save(*args, **kwargs)
        self._original_status = self.status

class Ticket(models.Model):
    name = models.CharField(max_length=255, blank=True, null=True)
    email = models.EmailField()
    subject = models.CharField(max_length=255)
    message = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, default='open')
    date = models.DateTimeField(auto_now_add=True)

class Lead(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='leads')
    business_name = models.CharField(max_length=255)
    owner_name = models.CharField(max_length=255, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=50, blank=True, null=True)
    website = models.URLField(blank=True, null=True, max_length=500)
    address = models.TextField(blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    country = models.CharField(max_length=100, blank=True, null=True)
    category = models.CharField(max_length=100, blank=True, null=True)
    rating = models.CharField(max_length=10, blank=True, null=True)
    source = models.CharField(max_length=50, default='google_places')
    source_id = models.CharField(max_length=255, blank=True, null=True)
    latitude = models.FloatField(blank=True, null=True)
    longitude = models.FloatField(blank=True, null=True)
    
    # Statuses & Scoring
    email_status = models.CharField(max_length=20, default='unknown') # verified, risky, unknown, invalid, inferred
    email_confidence = models.IntegerField(default=0)
    lead_score = models.IntegerField(default=0)
    enrichment_status = models.CharField(max_length=20, default='pending') # pending, running, completed, failed
    verification_status = models.CharField(max_length=20, default='pending') # pending, running, completed, failed
    
    duplicate_key = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    raw_data = models.JSONField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class LeadGenerationJob(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='generation_jobs')
    category = models.CharField(max_length=255)
    location = models.CharField(max_length=255)
    requested_limit = models.IntegerField(default=20)
    source_mode = models.CharField(max_length=20, default='auto') # auto, google, osm
    
    status = models.CharField(max_length=20, default='pending') # pending, running, completed, failed, cancelled
    total_items = models.IntegerField(default=0)
    processed_items = models.IntegerField(default=0)
    failed_items = models.IntegerField(default=0)
    progress_percentage = models.IntegerField(default=0)
    error_message = models.TextField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)

class LeadEnrichmentJob(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='enrichment_jobs')
    lead_ids = models.JSONField() # List of lead IDs to enrich
    
    status = models.CharField(max_length=20, default='pending') # pending, running, completed, failed, cancelled
    total_items = models.IntegerField(default=0)
    processed_items = models.IntegerField(default=0)
    failed_items = models.IntegerField(default=0)
    progress_percentage = models.IntegerField(default=0)
    error_message = models.TextField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)

class LeadVerificationJob(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='verification_jobs')
    lead_ids = models.JSONField() # List of lead IDs to verify
    
    status = models.CharField(max_length=20, default='pending') # pending, running, completed, failed, cancelled
    total_items = models.IntegerField(default=0)
    processed_items = models.IntegerField(default=0)
    failed_items = models.IntegerField(default=0)
    progress_percentage = models.IntegerField(default=0)
    error_message = models.TextField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)

class UsageLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='usage_logs')
    month = models.CharField(max_length=7) # e.g. '2026-06'
    action_type = models.CharField(max_length=50) # generate, enrich, verify, export
    count = models.IntegerField(default=0)
    plan_name = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)

class SourceCache(models.Model):
    cache_key = models.CharField(max_length=255, unique=True)
    source = models.CharField(max_length=50) # Nominatim, Overpass, Google
    query = models.TextField()
    location = models.CharField(max_length=255, blank=True, null=True)
    result_json = models.JSONField()
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

class EmailVerification(models.Model):
    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name='verifications')
    email = models.EmailField()
    syntax_valid = models.BooleanField(default=False)
    mx_valid = models.BooleanField(default=False)
    smtp_status = models.CharField(max_length=50, blank=True, null=True)
    disposable = models.BooleanField(default=False)
    role_based = models.BooleanField(default=False)
    status = models.CharField(max_length=20, default='unknown') # verified, risky, unknown, invalid, inferred
    confidence = models.IntegerField(default=0)
    checked_at = models.DateTimeField(auto_now=True)

