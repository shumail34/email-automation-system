from rest_framework import serializers
from .models import (
    User, Campaign, SystemConfig, Payment, Ticket, Lead, 
    LeadGenerationJob, LeadEnrichmentJob, LeadVerificationJob, UsageLog, EmailVerification
)

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'plan', 'emailLimit', 'dailyLimit', 'monthlyLimit', 'templateLimit', 'teamLimit', 'attachments', 'expiresAt', 'isMember', 'owner', 'hash', 'password', 'date_joined', 'emails_sent_count', 'emails_sent_month', 'leads_generated_count', 'leads_generated_month']
        extra_kwargs = {'password': {'write_only': True}}

    def validate(self, attrs):
        request = self.context.get('request')
        is_admin_request = request and request.user and request.user.is_authenticated and request.user.plan == 'admin'

        # Get values (for patch update, fallback to instance values)
        email = attrs.get('email', self.instance.email if self.instance else '')
        if email:
            email = email.lower().strip()
        plan = attrs.get('plan', self.instance.plan if self.instance else 'free').lower().strip()
        email_limit = attrs.get('emailLimit', self.instance.emailLimit if self.instance else 50)
        submitted_hash = attrs.get('hash', self.instance.hash if self.instance else '')

        # Enforce that non-admins can only sign up/change to premium plans if a valid hash is provided
        if not is_admin_request:
            if plan != 'free' or email_limit != 50:
                if not submitted_hash:
                    raise serializers.ValidationError({"hash": "Integrity hash is required for premium plans."})
                
                import base64
                salt = "outreachpro_secure_v2_x7k2026!"
                raw_str = f"{email}::{plan}::{email_limit}::{salt}"
                b64_str = base64.b64encode(raw_str.encode('utf-8')).decode('utf-8')
                rev_str = b64_str[::-1]
                
                expected_hash = ""
                for c in rev_str:
                    if 'a' <= c <= 'z':
                        expected_hash += chr((ord(c) - 97 + 13) % 26 + 97)
                    elif 'A' <= c <= 'Z':
                        expected_hash += chr((ord(c) - 65 + 13) % 26 + 65)
                    else:
                        expected_hash += c
                
                if expected_hash != submitted_hash:
                    raise serializers.ValidationError({"plan": "Invalid integrity hash. Plan upgrade rejected."})
        return attrs

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        if password:
            instance.set_password(password)
        return super().update(instance, validated_data)

class CampaignSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Campaign
        fields = '__all__'

class SystemConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemConfig
        fields = '__all__'
        extra_kwargs = {'smtp_pass': {'write_only': True}}

class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = '__all__'

class TicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = '__all__'

class LeadSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Lead
        fields = '__all__'

class LeadGenerationJobSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = LeadGenerationJob
        fields = '__all__'

class LeadEnrichmentJobSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = LeadEnrichmentJob
        fields = '__all__'

class LeadVerificationJobSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = LeadVerificationJob
        fields = '__all__'

class UsageLogSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = UsageLog
        fields = '__all__'

class EmailVerificationSerializer(serializers.ModelSerializer):
    lead = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = EmailVerification
        fields = '__all__'

