'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { FileText, Key, Download, ExternalLink, ArrowLeft, ArrowRight, Send } from 'lucide-react';
import { historyOperations, HistoryItem } from '@/lib/firebase/firestore';
import Link from 'next/link';

interface ArticleItem extends HistoryItem {
  type: 'article';
  content: string;
  keyword: string;
}

interface KeywordItem extends HistoryItem {
  type: 'keywords';
  mainKeyword: string;
  keywords: Array<{
    keyword: string;
    relevance: string;
    searchVolume?: string;
    difficulty?: string;
  }>;
}

export default function HistoryPage() {
  const { user } = useAuth();
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [keywordIndexMap, setKeywordIndexMap] = useState<Record<string, number>>({});

  useEffect(() => {
    async function loadHistory() {
      if (!user) return;
      try {
        setIsLoading(true);
        const items = await historyOperations.getAllHistory(user.uid);
        setHistoryItems(items);
      } catch (error) {
        console.error('Failed to load history:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadHistory();
  }, [user]);

  const handlePrevKeyword = (id: string) => {
    setKeywordIndexMap(prev => ({
      ...prev,
      [id]: Math.max(0, (prev[id] || 0) - 1)
    }));
  };

  const handleNextKeyword = (id: string, maxLength: number) => {
    setKeywordIndexMap(prev => ({
      ...prev,
      [id]: Math.min(maxLength - 1, (prev[id] || 0) + 1)
    }));
  };

  const handleDownloadArticle = async (item: ArticleItem) => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${item.title}</title>
        </head>
        <body>
          <h1>${item.title}</h1>
          ${item.content}
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title.toLowerCase().replace(/\s+/g, '-')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSendToShopify = async (item: ArticleItem) => {
    // TODO: Implement Shopify integration
    console.log('Sending to Shopify:', item);
  };

  const handleUseKeyword = (keyword: string | undefined) => {
    if (!keyword) return;
    localStorage.setItem('selectedKeyword', keyword);
    window.location.href = '/dashboard/articles';
  };

  const isArticle = (item: HistoryItem): item is ArticleItem => {
    return 'type' in item && item.type === 'article';
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Content History</h1>
      <p className="text-gray-600 mb-8">Your generated content from the last 30 days</p>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : historyItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {historyItems.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-300 transition-colors"
            >
              {item.type === 'article' ? (
                // Article Block
                <>
                  <div className="flex items-center mb-4">
                    <FileText className="w-5 h-5 text-blue-600 mr-2" />
                    <h2 className="text-lg font-semibold">{item.title}</h2>
                  </div>
                  <div className="mb-4">
                    <p className="text-sm text-gray-500">Keyword: {item.keyword}</p>
                    <p className="text-sm text-gray-500">Generated: {item.date.toLocaleDateString()}</p>
                  </div>
                  <div className="mb-4 h-32 overflow-y-auto bg-gray-50 rounded p-3 text-sm">
                    {item.content}
                  </div>
                  <div className="flex flex-col space-y-3">
                    <div className="flex space-x-3">
                      <button
                        onClick={() => handleDownloadArticle(item as ArticleItem)}
                        className="flex-1 flex items-center justify-center px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download HTML
                      </button>
                      <button
                        onClick={() => handleSendToShopify(item as ArticleItem)}
                        className="flex-1 flex items-center justify-center px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Send to Shopify
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                // Keywords Block
                <>
                  <div className="flex items-center mb-4">
                    <Key className="w-5 h-5 text-blue-600 mr-2" />
                    <h2 className="text-lg font-semibold">Keyword Research</h2>
                  </div>
                  <div className="mb-4">
                    <p className="text-sm text-gray-500">Main Keyword: {(item as KeywordItem).mainKeyword}</p>
                    <p className="text-sm text-gray-500">Generated: {item.date.toLocaleDateString()}</p>
                  </div>
                  <div className="mb-4">
                    {(() => {
                      const keywordItem = item as KeywordItem;
                      const currentIndex = keywordIndexMap[item.id] || 0;
                      const keywords = keywordItem.keywords;
                      
                      if (!keywords?.length) return null;
                      
                      const currentKeyword = keywords[currentIndex];
                      if (!currentKeyword) return null;

                      return (
                        <div className="bg-gray-50 rounded p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-medium">
                              {currentKeyword.keyword}
                            </h3>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handlePrevKeyword(item.id)}
                                disabled={!keywordIndexMap[item.id]}
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                              >
                                <ArrowLeft className="w-4 h-4" />
                              </button>
                              <span className="text-sm text-gray-500">
                                {currentIndex + 1} of {keywords.length}
                              </span>
                              <button
                                onClick={() => handleNextKeyword(item.id, keywords.length)}
                                disabled={currentIndex === keywords.length - 1}
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                              >
                                <ArrowRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mb-3">
                            {currentKeyword.relevance}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col space-y-3">
                    <button
                      onClick={() => {
                        const keywordItem = item as KeywordItem;
                        const currentIndex = keywordIndexMap[item.id] || 0;
                        const keyword = keywordItem.keywords?.[currentIndex]?.keyword;
                        handleUseKeyword(keyword);
                      }}
                      className="w-full flex items-center justify-center px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Use for Article
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">No content generated yet</p>
        </div>
      )}
    </div>
  );
} 