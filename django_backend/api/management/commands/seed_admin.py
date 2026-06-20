from django.core.management.base import BaseCommand
from api.models import User

MASTER_EMAIL = "shumailm1078@gmail.com"
MASTER_PASS  = "Shumail1@"

class Command(BaseCommand):
    help = 'Seeds the master admin account into the database'

    def handle(self, *args, **kwargs):
        if User.objects.filter(email=MASTER_EMAIL).exists():
            self.stdout.write(self.style.WARNING(f'Admin {MASTER_EMAIL} already exists.'))
            return

        user = User.objects.create_superuser(
            username='master_admin',
            email=MASTER_EMAIL,
            password=MASTER_PASS,
        )
        user.plan          = 'admin'
        user.emailLimit    = -1
        user.dailyLimit    = -1
        user.templateLimit = -1
        user.teamLimit     = -1
        user.attachments   = True
        user.expiresAt     = '2099-12-31'
        user.save()

        self.stdout.write(self.style.SUCCESS(f'OK Master admin {MASTER_EMAIL} created successfully!'))
