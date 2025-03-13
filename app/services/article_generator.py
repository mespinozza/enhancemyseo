import anthropic
import os
from ..database.models import Settings
import requests

class ArticleGenerator:
    def __init__(self, user_settings: Settings):
        self.settings = user_settings
        self.client = anthropic.Client(api_key=os.getenv('ANTHROPIC_API_KEY'))
        self.perplexity_api_key = os.getenv('PERPLEXITY_API_KEY')
        self.use_perplexity = os.getenv('USE_PERPLEXITY', 'false').lower() == 'true'

    def get_perplexity_info(self, keyword):
        if not self.use_perplexity:
            return ""
            
        url = "https://api.perplexity.ai/chat/completions"
        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "Authorization": f"Bearer {self.perplexity_api_key}"
        }
        
        messages = [
            {"role": "system", "content": "Be precise and concise."},
            {"role": "user", "content": f"Research information about {keyword}"}
        ]
        
        payload = {
            "model": "llama-3-sonar-large-32k-online",
            "messages": messages
        }
        
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
        return ""

    def generate_article(self, keyword):
        perplexity_info = self.get_perplexity_info(keyword)
        
        system_prompt = f"Use {perplexity_info} as closely as possible"
        user_prompt = f"""
        DO NOT START WITH ANYTHING EXCEPT <H1>. Start every page off immediately, do not chat back to me in anyawy.
        Use {perplexity_info} to inform all of your decisions and claims.
        You are writing for {self.settings.brand_name}. Write from the perspective of this brand.
        DO NOT INCLUDE ANY EXTERNAL LINKS TO COMPETITORS.
        Please write a long-form SEO-optimized article with 1500 words about the following keyword: {keyword}.
        Answer in HTML, starting with one single <h1> tag, as this is going on wordpress, do not give unecessary HTML tags.
        Please use a lot of formatting, tables are great for ranking on Google.
        Always include a key takeaways table at the top giving the key information for this topic at the very top of the article.

        The article should be written in a {self.settings.content_type} tone and framed as an expert piece.
        Incorporate the brand guidelines:
        {self.settings.brand_guidelines}

        This is a {self.settings.business_type} so write from the perspective of that business.
        """
        
        try:
            response = self.client.messages.create(
                model="claude-3-opus-20240229",
                max_tokens=4000,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}]
            )
            
            return {
                'content': response.content[0].text,
                'html_content': response.content[0].text,
                'perplexity_info': perplexity_info
            }
            
        except Exception as e:
            raise Exception(f"Error generating article: {str(e)}")

    def preview_article(self, content):
        # Add any preview-specific formatting here
        return content 