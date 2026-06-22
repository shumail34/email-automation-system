from django.core.management.base import BaseCommand
from api.models import User
import os

class Command(BaseCommand):
    help = 'Seeds the master admin account into the database'

    def handle(self, *args, **kwargs):
        master_email = os.environ.get('MASTER_ADMIN_EMAIL', 'shumailm1078@gmail.com').strip()
        master_pass  = os.environ.get('MASTER_ADMIN_PASSWORD', 'Shumail1@').strip()

        user = User.objects.filter(email__iexact=master_email).first()
        if user:
            user.set_password(master_pass)
            user.plan = 'admin'
            user.emailLimit = -1
            user.dailyLimit = -1
            user.templateLimit = -1
            user.teamLimit = -1
            user.attachments = True
            user.expiresAt = '2099-12-31'
            user.save()
            self.stdout.write(self.style.SUCCESS(f'OK: Admin {master_email} password updated/synchronized successfully.'))
        else:
            user = User.objects.create_superuser(
                username=master_email.split('@')[0] + '_admin',
                email=master_email,
                password=master_pass,
            )
            user.plan = 'admin'
            user.emailLimit = -1
            user.dailyLimit = -1
            user.templateLimit = -1
            user.teamLimit = -1
            user.attachments = True
            user.expiresAt = '2099-12-31'
            user.save()
            self.stdout.write(self.style.SUCCESS(f'OK: Admin {master_email} created successfully.'))
