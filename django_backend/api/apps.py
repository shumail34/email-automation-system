import os
import sys
import threading
from django.apps import AppConfig

def start_worker():
    from django.core.management import call_command
    try:
        call_command('run_workers')
    except Exception as e:
        print(f"Background worker failed: {e}")

class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        # Ensure it only runs once per process
        if os.environ.get('RUN_MAIN', None) != 'true' and 'runserver' not in sys.argv:
            # We are likely running in gunicorn or similar
            if not os.environ.get('WORKER_STARTED'):
                os.environ['WORKER_STARTED'] = 'true'
                t = threading.Thread(target=start_worker, daemon=True)
                t.start()
        elif 'runserver' in sys.argv and os.environ.get('RUN_MAIN') == 'true':
            # Local development with runserver
            t = threading.Thread(target=start_worker, daemon=True)
            t.start()
