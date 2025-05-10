// Background script for Summora Pro
// Handles API calls to OpenAI and Anthropic for summarization

// Listen for messages from the popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    summarizeContent(request)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep the message channel open for async response
  }
});

// Main function to summarize content
async function summarizeContent(data) {
  try {
    // Get settings from storage
    const settings = await chrome.storage.sync.get([
      'apiProvider',
      'openaiApiKey',
      'openaiModel',
      'anthropicApiKey',
      'anthropicModel',
      'summaryLength',
      'summaryType'
    ]);
    
    const provider = settings.apiProvider || 'openai';
    const summaryLength = settings.summaryLength || 'medium';
    const summaryType = settings.summaryType || 'full'; // Default to full summary if not specified
    
    // Validate API key
    const apiKey = provider === 'openai' ? settings.openaiApiKey : settings.anthropicApiKey;
    if (!apiKey) {
      throw new Error('API key not found. Please set it in the settings.');
    }
    
    // Prepare content for summarization
    const { title, content, url, readingTime } = data;
    
    // Generate summary based on provider
    let summary;
    if (provider === 'openai') {
      summary = await summarizeWithOpenAI(
        title,
        content,
        apiKey,
        settings.openaiModel || 'gpt-4.1',
        summaryLength,
        summaryType
      );
    } else {
      summary = await summarizeWithAnthropic(
        title,
        content,
        apiKey,
        settings.anthropicModel || 'claude-3-7-sonnet-20250219',
        summaryLength,
        summaryType
      );
    }
    
    // Calculate time saved (reading time minus ~2 minutes to read the summary)
    const timeSaved = Math.max(1, readingTime - 2);
    
    return {
      title,
      summary,
      url,
      timeSaved,
      provider,
      summaryType,
      model: provider === 'openai' ? 
        (settings.openaiModel || 'gpt-4.1') : 
        (settings.anthropicModel || 'claude-3-7-sonnet-20250219')
    };
  } catch (error) {
    console.error('Summarization error:', error);
    throw error;
  }
}

// Summarize content using OpenAI API
async function summarizeWithOpenAI(title, content, apiKey, model, summaryLength, summaryType) {
  const lengthMap = {
    short: 'Provide a concise summary with 5-7 key takeaways (around 150 words total).',
    medium: 'Provide a comprehensive summary with 8-10 key takeaways (around 250 words total).',
    long: 'Provide a detailed summary with 12-15 key takeaways (around 400 words total).'
  };
  
  const lengthInstruction = lengthMap[summaryLength] || lengthMap.medium;
  
  let promptTemplate;
  
  if (summaryType === 'takeaways') {
    promptTemplate = `
      You are Summora Pro, an AI assistant specialized in creating high-quality, actionable key takeaways from web articles.
      
      Please extract the most important key takeaways from the following article titled "${title}".
      
      ${lengthInstruction}
      
      Format your response as follows:
      - Present ONLY a list of bullet points (•) with the most important, actionable insights
      - Each bullet point should be concise (1-2 sentences) but informative
      - Focus on actionable insights, key statistics, main conclusions, and practical information
      - Use bold text for any critical numbers, names, or terms within each bullet point
      - Ensure each bullet point can stand alone as a valuable piece of information
      
      Important formatting requirements:
      - Use the bullet point symbol (•) not dashes (-)
      - Make the bullet points visually distinct with proper spacing
      - Bold important terms using **term** format
      - Do NOT include any title, introductory text or paragraphs - ONLY bullet points
      - Do NOT use markdown headers (like # or ##) - use bold text (**text**) instead
      
      Focus on information that a busy professional would find most valuable - insights they can immediately understand and potentially act upon.
      
      Here's the article content:
      
      ${content}
    `;
  } else {
    promptTemplate = `
      You are Summora Pro, an AI assistant specialized in creating high-quality summaries of web articles.
      
      Please summarize the following article titled "${title}".
      
      ${lengthInstruction}
      
      Format the summary with:
      - Do NOT include the article title at the beginning
      - Use bold text for section titles (not markdown headers with #)
      - Bullet points (•) for key takeaways (not dashes)
      - Well-structured paragraphs with appropriate spacing
      
      Important: 
      - Do NOT include the article title in your summary
      - Do NOT use markdown headers (like # or ##) in your response. Instead, use bold text (**text**) for headings and section titles.
      - Strictly adhere to the length requirements specified above. This is critical.
      - Ensure the summary is visually appealing with good spacing between sections.
      - Use the bullet point symbol (•) not dashes (-)
      
      Focus on the most important information, main arguments, key points, and conclusions.
      Maintain a neutral tone and ensure the summary is self-contained and understandable without the original article.
      
      Here's the article content:
      
      ${content}
    `;
  }
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are Summora Pro, an AI assistant specialized in creating high-quality summaries and key takeaways from web articles.'
        },
        {
          role: 'user',
          content: promptTemplate
        }
      ],
      temperature: 0.3,
      max_tokens: 1500
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// Summarize content using Anthropic API
async function summarizeWithAnthropic(title, content, apiKey, model, summaryLength, summaryType) {
  const lengthMap = {
    short: 'Provide a concise summary with 5-7 key takeaways (around 150 words total).',
    medium: 'Provide a comprehensive summary with 8-10 key takeaways (around 250 words total).',
    long: 'Provide a detailed summary with 12-15 key takeaways (around 400 words total).'
  };
  
  const lengthInstruction = lengthMap[summaryLength] || lengthMap.medium;
  
  let promptTemplate;
  
  if (summaryType === 'takeaways') {
    promptTemplate = `
      You are Summora Pro, an AI assistant specialized in creating high-quality, actionable key takeaways from web articles.
      
      Please extract the most important key takeaways from the following article titled "${title}".
      
      ${lengthInstruction}
      
      Format your response as follows:
      - Present ONLY a list of bullet points (•) with the most important, actionable insights
      - Each bullet point should be concise (1-2 sentences) but informative
      - Focus on actionable insights, key statistics, main conclusions, and practical information
      - Use bold text for any critical numbers, names, or terms within each bullet point
      - Ensure each bullet point can stand alone as a valuable piece of information
      
      Important formatting requirements:
      - Use the bullet point symbol (•) not dashes (-)
      - Make the bullet points visually distinct with proper spacing
      - Bold important terms using **term** format
      - Do NOT include any title, introductory text or paragraphs - ONLY bullet points
      - Do NOT use markdown headers (like # or ##) - use bold text (**text**) instead
      
      Focus on information that a busy professional would find most valuable - insights they can immediately understand and potentially act upon.
      
      Here's the article content:
      
      ${content}
    `;
  } else {
    promptTemplate = `
      You are Summora Pro, an AI assistant specialized in creating high-quality summaries of web articles.
      
      Please summarize the following article titled "${title}".
      
      ${lengthInstruction}
      
      Format the summary with:
      - Do NOT include the article title at the beginning
      - Use bold text for section titles (not markdown headers with #)
      - Bullet points (•) for key takeaways (not dashes)
      - Well-structured paragraphs with appropriate spacing
      
      Important: 
      - Do NOT include the article title in your summary
      - Do NOT use markdown headers (like # or ##) in your response. Instead, use bold text (**text**) for headings and section titles.
      - Strictly adhere to the length requirements specified above. This is critical.
      - Ensure the summary is visually appealing with good spacing between sections.
      - Use the bullet point symbol (•) not dashes (-)
      
      Focus on the most important information, main arguments, key points, and conclusions.
      Maintain a neutral tone and ensure the summary is self-contained and understandable without the original article.
      
      Here's the article content:
      
      ${content}
    `;
  }
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'user',
          content: promptTemplate
        }
      ],
      max_tokens: 1500,
      temperature: 0.3
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Anthropic API error: ${errorData.error?.message || response.statusText}`);
  }
  
  const data = await response.json();
  return data.content[0].text.trim();
}