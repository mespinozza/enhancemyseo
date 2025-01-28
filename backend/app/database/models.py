from .. import db
from datetime import datetime
from passlib.hash import bcrypt

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.String(36), primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    subscription_status = db.Column(db.String(20), default='free')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    settings = db.relationship('Settings', backref='user', uselist=False)
    articles = db.relationship('Article', backref='user', lazy=True)
    
    def set_password(self, password):
        self.password_hash = bcrypt.hash(password)
    
    def check_password(self, password):
        return bcrypt.verify(password, self.password_hash)

class Settings(db.Model):
    __tablename__ = 'settings'
    
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    shopify_url = db.Column(db.String(255))
    shopify_token = db.Column(db.String(255))
    brand_name = db.Column(db.String(100))
    business_type = db.Column(db.String(100))
    brand_guidelines = db.Column(db.Text)
    content_type = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Article(db.Model):
    __tablename__ = 'articles'
    
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    keyword = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    html_content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    published = db.Column(db.Boolean, default=False)
    publish_url = db.Column(db.String(255))
    
    def to_dict(self):
        return {
            'id': self.id,
            'keyword': self.keyword,
            'content': self.content,
            'html_content': self.html_content,
            'created_at': self.created_at.isoformat(),
            'published': self.published,
            'publish_url': self.publish_url
        } 