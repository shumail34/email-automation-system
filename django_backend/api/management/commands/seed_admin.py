from django.core.management.base import BaseCommand
from api.models import User
import os
import base64

class Command(BaseCommand):
    help = 'Seeds the master admin account into the database'

    def handle(self, *args, **kwargs):
        master_email = os.environ.get('MASTER_ADMIN_EMAIL', 'shumailm1078@gmail.com').strip()
        master_pass  = os.environ.get('MASTER_ADMIN_PASSWORD', 'Shumail1@').strip()

        user = User.objects.filter(email__iexact=master_email).first()
        if user:
            user.set_password(master_pass)
            user.save()
            self.stdout.write(self.style.SUCCESS(f'OK Master admin {master_email} password updated/synchronized successfully!'))
        else:
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

            user = User.objects.create_superuser(
                username=master_email.split('@')[0] + '_admin',
                email=master_email.lower().strip(),
                password=master_pass,
            )
            user.plan          = 'admin'
            user.emailLimit    = -1
            user.dailyLimit    = -1
            user.templateLimit = -1
            user.teamLimit     = -1
            user.attachments   = True
            user.expiresAt     = '2099-12-31'
            user.hash          = rot13_str
            user.save()
            self.stdout.write(self.style.SUCCESS(f'OK Master admin {master_email} created successfully!'))
