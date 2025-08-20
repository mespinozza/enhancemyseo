'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export default function Pagination({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  isLoading = false 
}: PaginationProps) {
  // Don't show pagination if there's only one page or no pages
  if (totalPages <= 1) return null;

  // Generate page numbers to show
  const getPageNumbers = () => {
    const delta = 2; // Number of pages to show on each side of current page
    const range = [];
    const rangeWithDots = [];

    // Always include first page
    range.push(1);

    // Calculate start and end of middle range
    const start = Math.max(2, currentPage - delta);
    const end = Math.min(totalPages - 1, currentPage + delta);

    // Add dots after first page if needed
    if (start > 2) {
      rangeWithDots.push(1);
      rangeWithDots.push('...');
    } else {
      rangeWithDots.push(1);
    }

    // Add middle range
    for (let i = start; i <= end; i++) {
      if (i !== 1 && i !== totalPages) {
        rangeWithDots.push(i);
      }
    }

    // Add dots before last page if needed
    if (end < totalPages - 1) {
      rangeWithDots.push('...');
      rangeWithDots.push(totalPages);
    } else if (totalPages > 1) {
      rangeWithDots.push(totalPages);
    }

    // Remove duplicates and sort
    return Array.from(new Set(rangeWithDots)).filter((item, index, arr) => {
      // Remove consecutive duplicates
      return index === 0 || arr[index - 1] !== item;
    });
  };

  const pageNumbers = getPageNumbers();
  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <div className="flex items-center justify-center space-x-2 py-8">
      {/* Previous Button */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!hasPrevious || isLoading}
        className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
          hasPrevious && !isLoading
            ? 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 hover:text-blue-600'
            : 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
        }`}
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        Previous
      </button>

      {/* Page Numbers */}
      <div className="flex space-x-1">
        {pageNumbers.map((pageNum, index) => {
          if (pageNum === '...') {
            return (
              <span
                key={`dots-${index}`}
                className="px-3 py-2 text-sm text-gray-500"
              >
                ...
              </span>
            );
          }

          const isCurrentPage = pageNum === currentPage;
          
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum as number)}
              disabled={isLoading}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isCurrentPage
                  ? 'text-white bg-blue-600 border border-blue-600'
                  : isLoading
                  ? 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                  : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 hover:text-blue-600'
              }`}
            >
              {pageNum}
            </button>
          );
        })}
      </div>

      {/* Next Button */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!hasNext || isLoading}
        className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
          hasNext && !isLoading
            ? 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 hover:text-blue-600'
            : 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
        }`}
      >
        Next
        <ChevronRight className="w-4 h-4 ml-1" />
      </button>

      {/* Page Info */}
      <div className="ml-4 text-sm text-gray-600">
        Page {currentPage} of {totalPages}
      </div>
    </div>
  );
}
