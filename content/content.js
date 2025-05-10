// Content script for Summora Pro
// This script extracts the main content from web pages for summarization

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractContent') {
    const extractedContent = extractPageContent();
    sendResponse(extractedContent);
  }
  return true; // Keep the message channel open for async response
});

// Extract the main content from the page
function extractPageContent() {
  try {
    // Get page title
    const title = document.title;
    
    // Try to find the main article content
    let content = '';
    let mainElement = null;
    
    // Common article container selectors
    const selectors = [
      'article',
      '[role="article"]',
      '.article',
      '.post-content',
      '.entry-content',
      '.content',
      'main',
      '#main',
      '.main',
      '.post',
      '.story',
      '#content',
      '.blog-post'
    ];
    
    // Try each selector until we find content
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // Find the element with the most text content
        let maxLength = 0;
        let bestElement = null;
        
        elements.forEach(element => {
          const text = element.textContent.trim();
          if (text.length > maxLength) {
            maxLength = text.length;
            bestElement = element;
          }
        });
        
        if (bestElement && maxLength > 1000) {
          mainElement = bestElement;
          break;
        }
      }
    }
    
    // If we couldn't find a good container, use readability algorithm
    if (!mainElement) {
      mainElement = findMainContentUsingHeuristics();
    }
    
    // Extract text from the main element
    if (mainElement) {
      content = extractTextFromElement(mainElement);
    } else {
      // Fallback: get all paragraphs
      const paragraphs = document.querySelectorAll('p');
      const paragraphTexts = [];
      
      paragraphs.forEach(p => {
        const text = p.textContent.trim();
        if (text.length > 50) { // Only include substantial paragraphs
          paragraphTexts.push(text);
        }
      });
      
      content = paragraphTexts.join('\n\n');
    }
    
    // Calculate estimated reading time
    const readingTime = calculateReadingTime(content);
    
    return {
      title,
      content,
      readingTime,
      url: window.location.href
    };
  } catch (error) {
    console.error('Error extracting content:', error);
    return { error: 'Failed to extract content from this page.' };
  }
}

// Extract clean text from an element, preserving some structure
function extractTextFromElement(element) {
  // Clone the element to avoid modifying the original
  const clone = element.cloneNode(true);
  
  // Remove unwanted elements
  const unwantedSelectors = [
    'script', 'style', 'nav', 'header', 'footer', 'aside',
    '.sidebar', '.comments', '.related', '.recommended',
    '.advertisement', '.ad', '.social', '.share', '.newsletter',
    'iframe', 'form', '.popup', '.modal', '.cookie'
  ];
  
  unwantedSelectors.forEach(selector => {
    const elements = clone.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });
  
  // Process the remaining content
  let result = '';
  const paragraphs = [];
  
  // Process headings
  clone.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
    paragraphs.push(heading.textContent.trim());
  });
  
  // Process paragraphs
  clone.querySelectorAll('p').forEach(p => {
    const text = p.textContent.trim();
    if (text.length > 0) {
      paragraphs.push(text);
    }
  });
  
  // Process lists
  clone.querySelectorAll('ul, ol').forEach(list => {
    const items = [];
    list.querySelectorAll('li').forEach(li => {
      const text = li.textContent.trim();
      if (text.length > 0) {
        items.push(`- ${text}`);
      }
    });
    
    if (items.length > 0) {
      paragraphs.push(items.join('\n'));
    }
  });
  
  // Join all paragraphs with double newlines
  result = paragraphs.join('\n\n');
  
  // Clean up extra whitespace
  result = result.replace(/\s+/g, ' ').trim();
  
  return result;
}

// Find the main content using heuristics
function findMainContentUsingHeuristics() {
  // Get all elements with substantial text
  const textNodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent.trim();
    if (text.length > 20) {
      textNodes.push(node);
    }
  }
  
  // Group text nodes by their parent element
  const parentMap = new Map();
  textNodes.forEach(node => {
    let parent = node.parentElement;
    while (parent && parent !== document.body) {
      if (['DIV', 'ARTICLE', 'SECTION', 'MAIN'].includes(parent.tagName)) {
        if (!parentMap.has(parent)) {
          parentMap.set(parent, 0);
        }
        parentMap.set(parent, parentMap.get(parent) + node.textContent.length);
        break;
      }
      parent = parent.parentElement;
    }
  });
  
  // Find the element with the most text
  let maxLength = 0;
  let bestElement = null;
  
  parentMap.forEach((length, element) => {
    if (length > maxLength) {
      maxLength = length;
      bestElement = element;
    }
  });
  
  return bestElement;
}

// Calculate estimated reading time in minutes
function calculateReadingTime(text) {
  const wordsPerMinute = 200;
  const wordCount = text.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / wordsPerMinute);
  return readingTime;
}