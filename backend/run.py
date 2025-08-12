import os

# Set environment variables directly
os.environ['DATABASE_URL'] = 'sqlite:///app.db'
os.environ['JWT_SECRET_KEY'] = 'dev-secret-key'

# Import app after setting environment variables
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
    
    # Use Railway PORT environment variable or default to 5000
    port = int(os.getenv('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port) 