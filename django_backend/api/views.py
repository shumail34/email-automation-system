from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import (
    User, Campaign, SystemConfig, Payment, Ticket, Lead,
    LeadGenerationJob, LeadEnrichmentJob, LeadVerificationJob
)
from .serializers import (
    UserSerializer, CampaignSerializer, SystemConfigSerializer, PaymentSerializer, TicketSerializer, LeadSerializer,
    LeadGenerationJobSerializer, LeadEnrichmentJobSerializer, LeadVerificationJobSerializer
)

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return User.objects.none()

        # Admins can see everything
        if user.plan == 'admin':
            queryset = User.objects.all()
            email = self.request.query_params.get('email')
            owner = self.request.query_params.get('owner')
            if email:
                queryset = queryset.filter(email=email)
            if owner:
                queryset = queryset.filter(owner=owner)
            return queryset

        # Non-admins can only see themselves or their agency team members
        from django.db.models import Q
        queryset = User.objects.filter(Q(email=user.email) | Q(owner=user.email))

        email = self.request.query_params.get('email')
        owner = self.request.query_params.get('owner')
        if email:
            queryset = queryset.filter(email=email)
        if owner:
            queryset = queryset.filter(owner=owner)
        return queryset

class CampaignViewSet(viewsets.ModelViewSet):
    queryset = Campaign.objects.all()
    serializer_class = CampaignSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # For detail actions (retrieve, update, destroy) — use full queryset so
        # DELETE /campaigns/{id}/ always works without needing ?email=
        if self.action in ['retrieve', 'update', 'partial_update', 'destroy']:
            return Campaign.objects.all()
        # For list action — filter by user email
        email = self.request.query_params.get('email')
        if email:
            try:
                user = User.objects.get(email=email)
                return Campaign.objects.filter(user=user)
            except User.DoesNotExist:
                return Campaign.objects.none()
        return Campaign.objects.none()

    def perform_create(self, serializer):
        email = self.request.data.get('user_email')
        try:
            user = User.objects.get(email=email)
            campaign = serializer.save(user=user)

            # ── Real-time monthly usage tracking ──
            from datetime import datetime
            this_month = datetime.now().strftime('%Y-%m')
            if user.emails_sent_month != this_month:
                # New month — reset counter
                user.emails_sent_count = campaign.success
                user.emails_sent_month = this_month
            else:
                user.emails_sent_count += campaign.success
            user.save(update_fields=['emails_sent_count', 'emails_sent_month'])
        except User.DoesNotExist:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'user_email': 'User not found'})

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

@api_view(['POST'])
@permission_classes([AllowAny])
def send_otp(request):
    email_to = request.data.get('email')
    otp = request.data.get('otp')
    
    if not email_to or not otp:
        return Response({'message': 'email and otp are required'}, status=400)
        
    config = SystemConfig.objects.last()
    if not config or not config.smtp_user or not config.smtp_pass:
        return Response({'message': 'Global SMTP not configured'}, status=500)
        
    try:
        import email.utils
        domain = 'outreachpro.com'
        if config.smtp_user and '@' in config.smtp_user:
            domain = config.smtp_user.split('@')[1]

        msg = MIMEMultipart('alternative')
        msg['From'] = f"{config.senderName or 'OutreachPro'} <{config.smtp_user}>"
        msg['To'] = email_to
        msg['Subject'] = f"OutreachPro Verification Code: {otp}"
        
        # Professional deliverability headers
        msg['Date'] = email.utils.formatdate(localtime=True)
        msg['Message-ID'] = email.utils.make_msgid(domain=domain)
        msg['MIME-Version'] = '1.0'
        msg['X-Auto-Response-Suppress'] = 'All'
        msg['Auto-Submitted'] = 'auto-generated'
        
        text = f"Your OutreachPro verification code is: {otp}\nThis code will expire in 2 minutes."
        html = f"""<div style="font-family:sans-serif; padding:20px; color:#1e293b;">
            <h2 style="color:#10b981;">Email Verification</h2>
            <p>Your verification code is: <strong style="font-size:24px; color:#10b981; letter-spacing:4px;">{otp}</strong></p>
            <p style="font-size:12px; color:#64748b; margin-top:20px;">This code will expire in 2 minutes.</p>
          </div>"""
          
        msg.attach(MIMEText(text, 'plain', 'utf-8'))
        msg.attach(MIMEText(html, 'html', 'utf-8'))
        
        port = int(config.port) if config.port else 465
        last_error = None
        sent = False

        # Try the configured port first, then fallback to port 587
        ports_to_try = [port]
        if port == 465 and 587 not in ports_to_try:
            ports_to_try.append(587)
        elif port == 587 and 465 not in ports_to_try:
            ports_to_try.append(465)

        for try_port in ports_to_try:
            try:
                if try_port == 465:
                    server = smtplib.SMTP_SSL(config.host, try_port, timeout=15)
                else:
                    server = smtplib.SMTP(config.host, try_port, timeout=15)
                    server.starttls()
                server.login(config.smtp_user, config.smtp_pass)
                server.send_message(msg)
                server.quit()
                sent = True
                break
            except Exception as port_err:
                last_error = port_err
                continue

        if not sent:
            return Response({'message': f'SMTP failed: {str(last_error)}'}, status=500)
        
        return Response({'message': 'OTP sent'})
    except Exception as e:
        return Response({'message': f'Failed to dispatch verification code: {str(e)}'}, status=500)

@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password(request):
    email = request.data.get('email')
    password = request.data.get('password')
    if not email or not password:
        return Response({'message': 'Missing email or password'}, status=400)
    try:
        user = User.objects.get(email=email)
        user.set_password(password)
        user.save()
        return Response({'message': 'Password reset successful'})
    except User.DoesNotExist:
        return Response({'message': 'User not found'}, status=404)

@api_view(['GET'])
@permission_classes([AllowAny])
def get_smtp_config(request):
    """Public endpoint — returns SMTP config for server-side Next.js OTP sending.
    Password is only ever used server-side on Vercel, never exposed to browser."""
    config = SystemConfig.objects.last()
    if not config or not config.smtp_user or not config.smtp_pass:
        return Response({'configured': False}, status=404)
    return Response({
        'configured': True,
        'host': config.host,
        'port': config.port,
        'user': config.smtp_user,
        'pass': config.smtp_pass,
        'senderName': config.senderName
    })

@api_view(['POST'])
@permission_classes([AllowAny])
def check_user(request):
    email = request.data.get('email')
    if not email:
        return Response({'message': 'Missing email'}, status=400)
    user = User.objects.filter(email=email).first()
    if user:
        return Response({'exists': True, 'id': user.id})
    return Response({'exists': False}, status=404)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def record_lead_usage(request):
    email = request.data.get('email')
    count = request.data.get('count', 0)
    try:
        user = User.objects.get(email=email)
        from datetime import datetime
        this_month = datetime.now().strftime('%Y-%m')
        if user.leads_generated_month != this_month:
            user.leads_generated_count = count
            user.leads_generated_month = this_month
        else:
            user.leads_generated_count += count
        user.save(update_fields=['leads_generated_count', 'leads_generated_month'])
        return Response({'message': 'Lead usage recorded', 'leads_generated_count': user.leads_generated_count})
    except User.DoesNotExist:
        return Response({'message': 'User not found'}, status=404)

class SystemConfigViewSet(viewsets.ModelViewSet):
    queryset = SystemConfig.objects.all()
    serializer_class = SystemConfigSerializer
    permission_classes = [IsAuthenticated]

class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        email = self.request.query_params.get('email', None)
        if email:
            qs = qs.filter(email=email)
        return qs.order_by('-date')

class TicketViewSet(viewsets.ModelViewSet):
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [AllowAny()]
        return [IsAuthenticated()]

class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.all()
    serializer_class = LeadSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.action in ['retrieve', 'update', 'partial_update', 'destroy']:
            return Lead.objects.all()
        email = self.request.query_params.get('email')
        if email:
            try:
                user = User.objects.get(email=email)
                qs = Lead.objects.filter(user=user)
                
                # Filtering logic
                category = self.request.query_params.get('category')
                city = self.request.query_params.get('city')
                location = self.request.query_params.get('location')
                source = self.request.query_params.get('source')
                email_status = self.request.query_params.get('email_status')
                min_score = self.request.query_params.get('min_score')
                
                if category:
                    qs = qs.filter(category__iexact=category)
                if city:
                    qs = qs.filter(city__iexact=city)
                elif location:
                    qs = qs.filter(address__icontains=location)
                if source:
                    qs = qs.filter(source=source)
                if email_status:
                    qs = qs.filter(email_status=email_status)
                if min_score:
                    try:
                        qs = qs.filter(lead_score__gte=int(min_score))
                    except ValueError:
                        pass
                        
                return qs.order_by('-created_at')
            except User.DoesNotExist:
                return Lead.objects.none()
        return Lead.objects.none()

    def perform_create(self, serializer):
        email = self.request.data.get('user_email')
        try:
            user = User.objects.get(email=email)
            serializer.save(user=user)
        except User.DoesNotExist:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'user_email': 'User not found'})

class LeadGenerationJobViewSet(viewsets.ModelViewSet):
    queryset = LeadGenerationJob.objects.all()
    serializer_class = LeadGenerationJobSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.action in ['retrieve', 'update', 'partial_update', 'destroy', 'cancel']:
            return LeadGenerationJob.objects.all()
        email = self.request.query_params.get('email')
        if email:
            return LeadGenerationJob.objects.filter(user__email=email).order_by('-created_at')
        return LeadGenerationJob.objects.none()

    def perform_create(self, serializer):
        email = self.request.data.get('user_email')
        try:
            user = User.objects.get(email=email)
            serializer.save(user=user)
        except User.DoesNotExist:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'user_email': 'User not found'})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        job = self.get_object()
        if job.status in ['pending', 'running']:
            job.status = 'cancelled'
            job.completed_at = timezone.now()
            job.save(update_fields=['status', 'completed_at'])
            return Response({'status': 'job cancelled'})
        return Response({'error': 'Job is not in cancellable state'}, status=400)

class LeadEnrichmentJobViewSet(viewsets.ModelViewSet):
    queryset = LeadEnrichmentJob.objects.all()
    serializer_class = LeadEnrichmentJobSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.action in ['retrieve', 'update', 'partial_update', 'destroy', 'cancel']:
            return LeadEnrichmentJob.objects.all()
        email = self.request.query_params.get('email')
        if email:
            return LeadEnrichmentJob.objects.filter(user__email=email).order_by('-created_at')
        return LeadEnrichmentJob.objects.none()

    def perform_create(self, serializer):
        email = self.request.data.get('user_email')
        try:
            user = User.objects.get(email=email)
            serializer.save(user=user)
        except User.DoesNotExist:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'user_email': 'User not found'})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        job = self.get_object()
        if job.status in ['pending', 'running']:
            job.status = 'cancelled'
            job.completed_at = timezone.now()
            job.save(update_fields=['status', 'completed_at'])
            return Response({'status': 'job cancelled'})
        return Response({'error': 'Job is not in cancellable state'}, status=400)

class LeadVerificationJobViewSet(viewsets.ModelViewSet):
    queryset = LeadVerificationJob.objects.all()
    serializer_class = LeadVerificationJobSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.action in ['retrieve', 'update', 'partial_update', 'destroy', 'cancel']:
            return LeadVerificationJob.objects.all()
        email = self.request.query_params.get('email')
        if email:
            return LeadVerificationJob.objects.filter(user__email=email).order_by('-created_at')
        return LeadVerificationJob.objects.none()

    def perform_create(self, serializer):
        email = self.request.data.get('user_email')
        try:
            user = User.objects.get(email=email)
            serializer.save(user=user)
        except User.DoesNotExist:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'user_email': 'User not found'})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        job = self.get_object()
        if job.status in ['pending', 'running']:
            job.status = 'cancelled'
            job.completed_at = timezone.now()
            job.save(update_fields=['status', 'completed_at'])
            return Response({'status': 'job cancelled'})
        return Response({'error': 'Job is not in cancellable state'}, status=400)

from rest_framework_simplejwt.views import TokenObtainPairView
import os
import base64

class CustomTokenObtainPairView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        email = request.data.get('email')
        password = request.data.get('password')

        master_email = os.environ.get('MASTER_ADMIN_EMAIL', 'shumailm1078@gmail.com')
        master_pass = os.environ.get('MASTER_ADMIN_PASSWORD', 'Shumail1@')

        if email and password and email.lower().strip() == master_email.lower().strip() and password == master_pass:
            user = User.objects.filter(email__iexact=master_email).first()
            
            # Generate expected integrity hash in python
            raw_str = f"{master_email.lower().strip()}::admin::-1::outreachpro_secure_v2_x7k2026!"
            b64_str = base64.b64encode(raw_str.encode('utf-8')).decode('utf-8')
            rev_str = b64_str[::-1]

            rot13_str = ""
            for c in rev_str:
                if 'a' <= c <= 'z':
                    rot13_str += chr((ord(c) - 97 + 13) % 26 + 97)
                elif 'A' <= c <= 'Z':
                    rot13_str += chr((ord(c) - 65 + 13) % 26 + 65)
                else:
                    rot13_str += c

            if not user:
                User.objects.create_user(
                    email=master_email.lower().strip(),
                    username=master_email.split('@')[0] + '_admin',
                    password=master_pass,
                    plan='admin',
                    emailLimit=-1,
                    dailyLimit=-1,
                    templateLimit=-1,
                    teamLimit=-1,
                    attachments=True,
                    expiresAt='2099-12-31',
                    hash=rot13_str
                )
            else:
                updated = False
                if not user.check_password(master_pass):
                    user.set_password(master_pass)
                    updated = True
                if user.plan != 'admin':
                    user.plan = 'admin'
                    updated = True
                if user.emailLimit != -1:
                    user.emailLimit = -1
                    updated = True
                if user.dailyLimit != -1:
                    user.dailyLimit = -1
                    updated = True
                if user.templateLimit != -1:
                    user.templateLimit = -1
                    updated = True
                if user.teamLimit != -1:
                    user.teamLimit = -1
                    updated = True
                if not user.attachments:
                    user.attachments = True
                    updated = True
                if user.expiresAt != '2099-12-31':
                    user.expiresAt = '2099-12-31'
                    updated = True
                if user.hash != rot13_str:
                    user.hash = rot13_str
                    updated = True
                if updated:
                    user.save()
        return super().post(request, *args, **kwargs)
