import os
import sys

# Set environment variables directly
os.environ['DATABASE_URL'] = 'sqlite:///app.db'
os.environ['JWT_SECRET_KEY'] = 'dev-secret-key'
os.environ['FLASK_APP'] = 'app'

# Patch Flask's CLI module to disable dotenv loading
import flask.cli
flask.cli.load_dotenv = lambda *args, **kwargs: None

# Now import and run the app
from app import create_app
from flask_migrate import upgrade

app = create_app()

if __name__ == '__main__':
    with app.app_context():
        try:
            upgrade()  # Run any pending migrations
        except Exception as e:
            print(f"Migration error: {e}")
            print("Continuing without migrations...")
    app.run(debug=True, use_reloader=False, port=5001) 