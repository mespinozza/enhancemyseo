from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..database.models import User, Settings, Article, db
from .article_generator import ArticleGenerator
import uuid

services_bp = Blueprint('services', __name__)

@services_bp.route('/settings', methods=['GET', 'POST'])
@jwt_required()
def manage_settings():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    
    if request.method == 'GET':
        if not user.settings:
            return jsonify({'message': 'No settings found'}), 404
        
        return jsonify({
            'shopify_url': user.settings.shopify_url,
            'brand_name': user.settings.brand_name,
            'business_type': user.settings.business_type,
            'brand_guidelines': user.settings.brand_guidelines,
            'content_type': user.settings.content_type
        }), 200
    
    data = request.get_json()
    
    if not user.settings:
        settings = Settings(
            id=str(uuid.uuid4()),
            user_id=current_user_id,
            **data
        )
        db.session.add(settings)
    else:
        for key, value in data.items():
            setattr(user.settings, key, value)
    
    db.session.commit()
    return jsonify({'message': 'Settings updated successfully'}), 200

@services_bp.route('/generate', methods=['POST'])
@jwt_required()
def generate_article():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    
    if not user.settings:
        return jsonify({'error': 'Please configure your settings first'}), 400
    
    data = request.get_json()
    keyword = data.get('keyword')
    
    if not keyword:
        return jsonify({'error': 'Keyword is required'}), 400
    
    try:
        generator = ArticleGenerator(user.settings)
        result = generator.generate_article(keyword)
        
        article = Article(
            id=str(uuid.uuid4()),
            user_id=current_user_id,
            keyword=keyword,
            content=result['content'],
            html_content=result['html_content']
        )
        
        db.session.add(article)
        db.session.commit()
        
        return jsonify({
            'message': 'Article generated successfully',
            'article': article.to_dict()
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@services_bp.route('/articles', methods=['GET'])
@jwt_required()
def get_articles():
    current_user_id = get_jwt_identity()
    articles = Article.query.filter_by(user_id=current_user_id).order_by(Article.created_at.desc()).all()
    
    return jsonify({
        'articles': [article.to_dict() for article in articles]
    }), 200

@services_bp.route('/articles/<article_id>', methods=['GET'])
@jwt_required()
def get_article(article_id):
    current_user_id = get_jwt_identity()
    article = Article.query.filter_by(id=article_id, user_id=current_user_id).first()
    
    if not article:
        return jsonify({'error': 'Article not found'}), 404
    
    return jsonify(article.to_dict()), 200

@services_bp.route('/articles/<article_id>/publish', methods=['POST'])
@jwt_required()
def publish_article(article_id):
    current_user_id = get_jwt_identity()
    article = Article.query.filter_by(id=article_id, user_id=current_user_id).first()
    
    if not article:
        return jsonify({'error': 'Article not found'}), 404
    
    # Add Shopify publishing logic here
    article.published = True
    article.publish_url = "https://your-shop.myshopify.com/blogs/news/article-url"
    
    db.session.commit()
    
    return jsonify({
        'message': 'Article published successfully',
        'article': article.to_dict()
    }), 200 