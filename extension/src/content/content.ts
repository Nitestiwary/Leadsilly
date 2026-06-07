// Content Script: Leadsilly Lead Extractor Scraping Engine

interface ExtractedLead {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  linkedinUrl: string;
  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceType: string;
}

// 1. Regular Expressions for fallback matches
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d{1,4}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/g;

// 2. Main Scraping Function
function scrapePageData(): ExtractedLead {
  const pageHtml = document.documentElement.outerHTML;

  // Initialize Lead properties
  let name = '';
  let businessName = '';
  let email = '';
  let phone = '';
  let address = '';
  let linkedinUrl = '';
  let facebookUrl = '';
  let instagramUrl = '';
  let twitterUrl = '';

  // Source values
  const sourceUrl = window.location.href;
  const sourceDomain = window.location.hostname;
  const sourceType = determineSourceType(sourceUrl);

  // A. Schema.org / JSON-LD parsing
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  jsonLdScripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent || '{}');
      
      // Look for Organization, LocalBusiness, Person, etc.
      const inspectSchema = (obj: any) => {
        if (!obj) return;
        
        if (obj['@type'] === 'LocalBusiness' || obj['@type'] === 'Organization') {
          businessName = obj.name || businessName;
          phone = obj.telephone || phone;
          email = obj.email || email;
          
          if (obj.address) {
            address = typeof obj.address === 'string' 
              ? obj.address 
              : `${obj.address.streetAddress || ''}, ${obj.address.addressLocality || ''}, ${obj.address.addressRegion || ''} ${obj.address.postalCode || ''}`;
          }
        }

        if (obj['@type'] === 'Person') {
          name = obj.name || name;
          email = obj.email || email;
          phone = obj.telephone || phone;
        }

        // Handle nested lists or sub-objects
        if (Array.isArray(obj)) {
          obj.forEach(inspectSchema);
        } else if (typeof obj === 'object') {
          Object.values(obj).forEach(val => {
            if (typeof val === 'object') inspectSchema(val);
          });
        }
      };

      inspectSchema(data);
    } catch (e) {
      // JSON syntax error in LD-JSON
    }
  });

  // B. Fallback meta tags & Open Graph
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
  const description = document.querySelector('meta[name="description"]')?.getAttribute('content');

  // Assign page title / business name from Open Graph if empty
  if (!businessName) businessName = ogSiteName || ogTitle || document.title || '';
  if (!name) {
    // Attempt name extraction from page headers
    const h1 = document.querySelector('h1')?.textContent?.trim();
    if (h1 && h1.length < 50) name = h1;
  }

  // C. Social profiles matcher from href values
  const links = Array.from(document.querySelectorAll('a[href]'));
  links.forEach((link: any) => {
    const href = link.href.toLowerCase();
    if (href.includes('linkedin.com/in/') || href.includes('linkedin.com/company/')) {
      linkedinUrl = link.href;
    } else if (href.includes('facebook.com/') && !href.includes('sharer')) {
      facebookUrl = link.href;
    } else if (href.includes('instagram.com/')) {
      instagramUrl = link.href;
    } else if (href.includes('twitter.com/') || href.includes('x.com/')) {
      twitterUrl = link.href;
    }
  });

  // D. Google Search Result lists specific overrides for business name
  if (sourceDomain.includes('google.com')) {
    // Try to find the title of the first local result card
    const firstTitleEl = document.querySelector('[data-attrid="title"], .OSrXXb, div[role="heading"] span, a.C7rsq');
    businessName = firstTitleEl && firstTitleEl.textContent ? firstTitleEl.textContent.trim() : 'N/A';
    name = 'N/A';
  }

  // E. Extracted Website strategy (Find listed website rather than google.com)
  let website = 'N/A';
  for (const link of links) {
    const text = (link.textContent || '').trim().toLowerCase();
    const aria = (link.getAttribute('aria-label') || '').toLowerCase();
    const href = link.getAttribute('href') || '';
    
    if (href && (text === 'website' || aria.includes('website') || aria.includes('visit website'))) {
      if (href.includes('google.com/url?')) {
        const urlParam = new URL(href, window.location.href).searchParams.get('url');
        if (urlParam) {
          website = urlParam;
          break;
        }
      } else if (!href.startsWith('/') && !href.includes('google.com') && !href.includes('google.co.in')) {
        website = href;
        break;
      }
    }
  }

  // Fallback to origin if not on search page
  if (website === 'N/A' && !sourceDomain.includes('google.com')) {
    website = window.location.origin;
  }

  // F. RegEx scanning of DOM text content
  const textContent = document.body.innerText;
  
  // Find Emails
  const matchedEmails = textContent.match(EMAIL_REGEX);
  if (matchedEmails && matchedEmails.length > 0) {
    email = matchedEmails[0];
  }

  // Find Phones
  const matchedPhones = textContent.match(PHONE_REGEX);
  if (matchedPhones && matchedPhones.length > 0) {
    const cleanPhones = matchedPhones.filter(p => p.replace(/\D/g, '').length >= 8);
    if (cleanPhones.length > 0) {
      phone = cleanPhones[0].trim();
    }
  }

  // Helper to standardise empty/meta fields to N/A
  const clean = (val: string) => {
    const cleanVal = (val || '').trim();
    if (!cleanVal || cleanVal.toLowerCase() === 'undefined' || cleanVal.toLowerCase() === 'search results' || cleanVal.includes('Google Search')) {
      return 'N/A';
    }
    return cleanVal;
  };

  return {
    name: clean(name),
    businessName: clean(businessName),
    email: clean(email),
    phone: clean(phone),
    website: clean(website),
    address: clean(address || extractAddressFromText(textContent)),
    linkedinUrl: clean(linkedinUrl),
    facebookUrl: clean(facebookUrl),
    instagramUrl: clean(instagramUrl),
    twitterUrl: clean(twitterUrl),
    sourceUrl,
    sourceDomain,
    sourceType
  };
}

// Categorize URLs into directories or directories types
function determineSourceType(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('yelp.com') || lowerUrl.includes('yellowpages') || lowerUrl.includes('tripadvisor')) {
    return 'Business Directory';
  }
  if (lowerUrl.includes('linkedin.com') || lowerUrl.includes('facebook.com') || lowerUrl.includes('twitter.com')) {
    return 'Social Media Profile';
  }
  if (lowerUrl.includes('google.com/search') || lowerUrl.includes('bing.com/search')) {
    return 'Search Result Page';
  }
  return 'Company Website';
}

// Basic text heuristic for address extraction
function extractAddressFromText(text: string): string {
  // Simple heuristic searching for zip patterns or address keywords
  const addressKeywords = ['street', 'st.', 'avenue', 'ave.', 'road', 'rd.', 'lane', 'ln.', 'suite', 'ste.'];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 10 && l.length < 150);
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const hasKeyword = addressKeywords.some(keyword => lowerLine.includes(keyword));
    const hasZip = /\b\d{5}(-\d{4})?\b/.test(line); // US zip pattern matches
    
    if (hasKeyword && hasZip) {
      return line;
    }
  }
  return '';
}

// 3. Listener to communicate with Extension background/popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extract_leads') {
    const extractedData = scrapePageData();
    sendResponse({ success: true, data: extractedData });
  }
  return true;
});
