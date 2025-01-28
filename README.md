# EnhanceMySEO Web Application

A powerful web application for generating SEO-optimized articles using AI. Built with Flask (backend) and Next.js (frontend).

## Project Structure

```
/
├── backend/              # Flask backend
│   ├── app/             # Application code
│   │   ├── auth/        # Authentication routes
│   │   ├── services/    # Business logic
│   │   └── database/    # Database models
│   ├── requirements.txt # Python dependencies
│   └── .env            # Environment variables
│
└── frontend/           # Next.js frontend
    ├── src/           # Source code
    │   ├── app/       # Next.js pages
    │   ├── components/# React components
    │   ├── contexts/  # React contexts
    │   └── lib/       # Utilities
    └── package.json   # Node.js dependencies
```

## Features

- User Authentication
- AI-Powered Article Generation
- Shopify Integration
- SEO Optimization
- Content Management
- Real-time Preview
- Brand Settings Management

## Prerequisites

- Python 3.8+
- Node.js 18+
- PostgreSQL
- Anthropic API Key (Claude)
- Perplexity API Key
- Shopify Partner Account (for integration)

## Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. Initialize the database:
```bash
flask db upgrade
```

6. Run the development server:
```bash
python run.py
```

## Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

4. Run the development server:
```bash
npm run dev
```

## Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://localhost/enhancemyseo
JWT_SECRET_KEY=your-secret-key
ANTHROPIC_API_KEY=your-anthropic-api-key
PERPLEXITY_API_KEY=your-perplexity-api-key
USE_PERPLEXITY=true
FLASK_APP=run.py
FLASK_ENV=development
FLASK_DEBUG=1
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

## Development Workflow

1. Start the backend server
2. Start the frontend development server
3. Access the application at http://localhost:3000

## API Endpoints

### Authentication
- POST /api/auth/register - Register a new user
- POST /api/auth/login - Login
- GET /api/auth/me - Get user profile
- POST /api/auth/logout - Logout

### Settings
- GET /api/settings - Get user settings
- POST /api/settings - Update user settings

### Articles
- POST /api/generate - Generate new article
- GET /api/articles - Get article history
- GET /api/articles/:id - Get specific article
- POST /api/articles/:id/publish - Publish article

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 