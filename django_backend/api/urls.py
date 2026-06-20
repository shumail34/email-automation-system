from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet, CampaignViewSet, SystemConfigViewSet, PaymentViewSet, TicketViewSet, LeadViewSet, 
    LeadGenerationJobViewSet, LeadEnrichmentJobViewSet, LeadVerificationJobViewSet,
    send_otp, reset_password, check_user, record_lead_usage, CustomTokenObtainPairView
)
from rest_framework_simplejwt.views import TokenRefreshView

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'campaigns', CampaignViewSet)
router.register(r'config', SystemConfigViewSet)
router.register(r'payments', PaymentViewSet)
router.register(r'tickets', TicketViewSet)
router.register(r'leads', LeadViewSet)
router.register(r'jobs/generate', LeadGenerationJobViewSet, basename='job_generate')
router.register(r'jobs/enrich', LeadEnrichmentJobViewSet, basename='job_enrich')
router.register(r'jobs/verify', LeadVerificationJobViewSet, basename='job_verify')

urlpatterns = [
    path('', include(router.urls)),
    path('token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('send-otp/', send_otp, name='send_otp'),
    path('reset-password/', reset_password, name='reset_password'),
    path('check-user/', check_user, name='check_user'),
    path('record-lead-usage/', record_lead_usage, name='record_lead_usage'),
]
