import os
import sys

# Manually set environment variables
os.environ['DATABASE_URL'] = 'sqlite:///app.db'
os.environ['JWT_SECRET_KEY'] = 'dev-secret-key'

# Import and run the Flask app
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
    app.run(debug=True) 